// ============================================================
// AI driver — drives a Vehicle around a waypoint path.
// Pure kinematic steering/throttle controller: no cheating physics,
// so it feels like racing another car (with mild skill scaling).
//
// The route is resampled to an even 2.5 m spacing and driven by arc length
// (`s`). Everything — look-ahead, curvature, corner speeds, lap counting —
// is expressed along that line, which is what stops the old symptom of rivals
// wandering off the road and circling their own waypoint.
// ============================================================
import { clamp, wrapAngle } from '../core/util.js';

const SAMPLE = 2.5;      // metres between route samples
const LOOK_MIN = 7;
const LOOK_MAX = 44;

export class AIDriver {
  constructor(vehicle, path, opts = {}) {
    this.vehicle = vehicle;
    this.skill = opts.skill ?? 0.85;         // 0.6 slow .. 1.05 fast
    this.laneBias = opts.laneBias ?? 0;
    this.rubberBand = opts.rubberBand ?? 0.06;
    this.name = opts.name || 'RIVAL';
    this.color = opts.color || '#b9c4cd';
    this.closed = opts.closed ?? false;      // circuit/highway laps vs point-to-point
    this.targetSpeed = 0;
    this.steerSmooth = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.lap = 0;
    this.finished = false;
    this.atEnd = false;
    this.progress = 0;                       // 0..1 along the current lap
    this.index = 0;
    this.wrongWayTimer = 0;
    this.lapArmed = false;
    this._lostFrames = 0;
    this.setPath(path || []);
  }

  setPath(path) {
    this.smooth = smoothPath(path, 2);
    this.line = resamplePath(this.smooth, SAMPLE, this.closed);
    this.n = this.line.length;
    this._buildCurvature();
    this.s = 0;
    this.index = 0;
    this._lastS = null;
    this._lapDist = 0;
    this.atEnd = false;
  }

  reset(path) {
    if (path) { this.setPath(path); } else { this.s = 0; this.index = 0; this._lapDist = 0; this._lastS = null; }
    // find the closest point on the route from wherever we were spawned
    this._seed();
    this._lastProgress = this.progress;
    this.lapArmed = false;
    this.lap = 0;
    this.finished = false;
    this.atEnd = false;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.steerSmooth = 0;
    this.progress = 0;
  }

  // Start the run at the beginning of the route. Used on the starting grid:
  // the start line sits on top of the finish line, so projecting from the
  // spawn point alone is ambiguous (a rival could seed itself at the finish
  // and drive the whole lap backwards).
  startAtRouteStart() {
    this.s = 0;
    this.index = 0;
    this.progress = 0;
    this.lap = 0;
    this.atEnd = false;
    this.lapArmed = false;
    this._lastS = 0;
    this._lapDist = 0;
    this._lastProgress = 0;
    this._lostFrames = 0;
  }

  // lock onto the route from anywhere (used after spawning on the grid)
  _seed() {
    const v = this.vehicle;
    const n = this.n;
    if (n < 2) return;
    // Collect the best match per route segment; on a lap the start and finish
    // sit on top of each other, so prefer the *earliest* point that is within
    // a metre of the very closest one. Seeding at the finish line made rivals
    // drive a whole lap backwards at the start.
    const hits = [];
    let bestD2 = Infinity;
    const lim = this.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = this.pointAt(i), b = this.pointAt(i + 1);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((v.x - a.x) * dx + (v.z - a.z) * dz) / len2 : 0;
      t = clamp(t, 0, 1);
      const d2 = (v.x - (a.x + dx * t)) ** 2 + (v.z - (a.z + dz * t)) ** 2;
      hits.push([d2, i, t]);
      if (d2 < bestD2) bestD2 = d2;
    }
    let bestI = 0, bestT = 0;
    const tol = bestD2 + 3.0 * 3.0;      // within 3 m of the closest match
    for (const [d2, i, t] of hits) {
      if (d2 <= tol) { bestI = i; bestT = t; break; }
    }
    this.s = (bestI + bestT) * SAMPLE;
    this.index = clamp(Math.floor(this.s / SAMPLE), 0, n - 1);
    this._lastS = this.s;
    this._lapDist = 0;
    this.progress = this.closed
      ? (this.s % (n * SAMPLE)) / (n * SAMPLE)
      : clamp(this.s / Math.max(1, (n - 1) * SAMPLE), 0, 1);
    this._lastProgress = this.progress;
  }

  // ---------------------------------------------------------------- route --
  pointAt(i) {
    return this.line[((i % this.n) + this.n) % this.n];
  }

  // point `dist` metres further along the route from arc position s
  pointAhead(s, dist) {
    if (!this.n) return { x: this.vehicle.x, z: this.vehicle.z };
    const raw = s + dist;
    if (this.closed) {
      const total = this.n * SAMPLE;
      const w = ((raw % total) + total) % total;
      const i = Math.floor(w / SAMPLE) % this.n;
      return this.line[i];
    }
    const i = clamp(Math.floor(raw / SAMPLE), 0, this.n - 1);
    return this.line[i];
  }

  // Pre-compute the tightness of the road at every sample.
  // Heading change over a ~16 m window: stable, and it matches what a corner
  // actually feels like (the single-chord estimate jumped 4x at each kink).
  _buildCurvature() {
    const n = this.n;
    this.curvature = new Float32Array(Math.max(1, n));
    if (n < 6) return;
    const win = 3;                         // +-3 samples = 15 m span
    const heading = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.pointAt(i), b = this.pointAt(i + 1);
      heading[i] = Math.atan2(-(b.z - a.z), b.x - a.x);
    }
    for (let i = 0; i < n; i++) {
      const hi = heading[(i + win + n) % n];
      const lo = heading[(i - win + n) % n];
      this.curvature[i] = Math.abs(wrapAngle(hi - lo)) / (2 * win * SAMPLE);
    }
    // look one bend ahead so the brakes go on before the corner, not in it
    const ahead = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let mx = this.curvature[i];
      for (let k = 1; k <= 4; k++) {
        mx = Math.max(mx, this.curvature[(i + k) % n] * (1 - k * 0.05));
      }
      ahead[i] = mx;
    }
    this.curvature = ahead;
  }

  // Fastest we may be going right now and still clear every bend we could
  // reach before stopping, with its own corner speed (braking-distance aware).
  speedLimitAhead(dist, latBudget, decel) {
    if (!this.n) return Infinity;
    const k = this.curvature;
    let limit = Infinity;
    const steps = Math.min(this.n, Math.ceil(dist / SAMPLE) + 1);
    for (let j = 0; j < steps; j++) {
      const i = this.closed
        ? (Math.floor(this.s / SAMPLE) + j) % this.n
        : Math.min(this.n - 1, Math.floor(this.s / SAMPLE) + j);
      const vmax = Math.sqrt(latBudget / Math.max(0.0016, k[i]));
      const allowed = Math.sqrt(vmax * vmax + 2 * decel * j * SAMPLE);
      if (allowed < limit) limit = allowed;
    }
    return limit;
  }

  // Project the car onto the route. Forward-only window, so a rival can never
  // accidentally latch onto a piece of road it has already driven.
  _project() {
    const v = this.vehicle;
    const n = this.n;
    if (n < 2) return;
    const centre = this.closed
      ? ((Math.floor(this.s / SAMPLE) % n) + n) % n
      : clamp(Math.floor(this.s / SAMPLE), 0, n - 1);
    const window = clamp(Math.round(8 + Math.abs(v.longSpeed) * 1.4), 10, 56);
    let bestD2 = Infinity, bestI = centre, bestT = 0;
    for (let k = -2; k < window; k++) {          // a little behind, mostly ahead
      let i = centre + k;
      if (this.closed) i = ((i % n) + n) % n;
      else { if (i < 0 || i >= n - 1) continue; }
      const a = this.pointAt(i), b = this.pointAt(i + 1);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((v.x - a.x) * dx + (v.z - a.z) * dz) / len2 : 0;
      t = clamp(t, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d2 = (v.x - px) ** 2 + (v.z - pz) ** 2;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; bestT = t; }
    }
    if (bestD2 === Infinity) { this._lostFrames = (this._lostFrames || 0) + 1; return; }
    // off the line for a sustained moment (wall, spin, wrong turn): re-lock
    // onto the nearest piece of route instead of driving off into the city
    if (bestD2 > 30 * 30) this._lostFrames = (this._lostFrames || 0) + 1;
    else this._lostFrames = Math.max(0, (this._lostFrames || 0) - 2);
    const newS = (bestI + bestT) * SAMPLE;
    // forward-only: never move backwards along the route (except tiny jitter)
    if (this.closed) {
      const total = n * SAMPLE;
      let delta = newS - (this.s % total);
      if (delta < -total * 0.5) delta += total;
      if (delta > total * 0.5) delta -= total;
      if (delta > -SAMPLE * 2) this.s = (this.s % total) + delta;
      if (this.s < 0) this.s += total;
      // A wrap through the start line ends a lap — but only once we have
      // actually driven most of the way round, otherwise spawning next to the
      // start/finish line (where the first and last samples touch) counts as
      // an instant lap.
      if (this._lastS != null) {
        let step = this.s - this._lastS;
        if (step < -total * 0.5) step += total;
        this._lapDist += Math.max(0, step);
      }
      this._lastS = this.s;
      const prog = (this.s % total) / total;
      if (prog > 0.5) this.lapArmed = true;
      else if (this.lapArmed && prog < 0.2) { this.lap++; this.lapArmed = false; }
    } else {
      if (newS > this.s - SAMPLE * 2) this.s = newS;
      this._lastS = this.s;
      // crossed the finish line of a point-to-point route: run is over
      const end = (n - 1) * SAMPLE;
      if (this.s >= end - 12) {
        this.s = end;
        if (!this.atEnd) { this.lap++; }
        this.atEnd = true;
      }
    }
    this.index = clamp(Math.floor(this.s / SAMPLE), 0, n - 1);
    this.progress = this.closed
      ? (this.s % (n * SAMPLE)) / (n * SAMPLE)
      : clamp(this.s / Math.max(1, (n - 1) * SAMPLE), 0, 1);
    // lost (crashed into a wall, spun into a side street): re-lock globally
    if (this._lostFrames > 45) {
      this._seed();
      this._lostFrames = 0;
    }
  }

  currentTarget() {
    return this.pointAhead(this.s, 12);
  }

  // kept for compatibility with older call sites
  lookaheadPoint(dist) {
    return this.pointAhead(this.s, dist);
  }

  update(dt, ctx = {}) {
    const v = this.vehicle;
    if (!this.n) return;
    this._project();
    const speed = Math.abs(v.longSpeed);

    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      v.transmission = 'auto';
      v.update(dt, {
        throttle: -0.7, brake: 0,
        steer: clamp(this.steerSmooth, -1, 1), handbrake: 0,
      }, ctx.world);
      return;
    }

    // ---------------------------------------------------------------
    // Pure pursuit along the arc-length route. The old controller aimed at a
    // point 9 + 0.55*v metres ahead, so at 160 km/h it reacted to a waypoint
    // 18 m away and slammed from lock to lock — the rivals looked drunk.
    // ---------------------------------------------------------------
    const lookDist = clamp(LOOK_MIN + speed * 1.05, LOOK_MIN, LOOK_MAX);
    const look = this.atEnd
      ? { x: v.x + Math.cos(v.heading) * lookDist, z: v.z - Math.sin(v.heading) * lookDist }
      : this.pointAhead(this.s, lookDist);

    const dx = look.x - v.x, dz = look.z - v.z;
    const distToLook = Math.hypot(dx, dz) || 1;
    // bearing in the car frame: forward is (cos h, -sin h), heading grows CCW
    const err = wrapAngle(Math.atan2(-dz, dx) - v.heading);

    // steering angle needed to follow the arc that reaches the target point
    const curvature = (2 * Math.sin(err)) / Math.max(5, distToLook);
    const wantAngle = Math.atan(curvature * v.def.body.wheelbase);
    const lock = steeringLockAt(speed, true);
    // +steerAngle in the physics turns left; this controller's +steer = right
    let steerCmd = clamp(-wantAngle / lock, -1, 1);

    // avoidance: ease around a car that is directly in front
    if (ctx.others) {
      const fwdX = Math.cos(v.heading), fwdZ = -Math.sin(v.heading);
      let avoid = 0;
      for (const o of ctx.others) {
        if (!o || o === v) continue;
        const rx = o.x - v.x, rz = o.z - v.z;
        const d = Math.hypot(rx, rz);
        if (d < 15 && d > 0.01) {
          const ahead = (rx * fwdX + rz * fwdZ) / d;
          if (ahead > 0.72) {
            const cross = fwdX * rz - fwdZ * rx;      // + = target on the left
            avoid += (cross > 0 ? -1 : 1) * 0.30 * (1 - d / 15);
          }
        }
      }
      steerCmd = clamp(steerCmd + avoid, -1, 1);
    }

    this.steerSmooth += (steerCmd - this.steerSmooth) * Math.min(1, dt * 9);
    if (Math.abs(steerCmd) < 0.1) this.steerSmooth *= 1 - Math.min(1, dt * 7);

    // ---------------------------------------------------------------
    // Speed: brake for the tightest bend we can reach before stopping.
    // ---------------------------------------------------------------
    // stats.grip is a 0-100 handling figure, not a 0-1 coefficient.
    const grip = clamp((v.stats?.grip ?? 60) / 90, 0.45, 1.25);
    const decel = 7.0 * grip;                    // braking we rely on (m/s^2)
    const latBudget = 8.8 * grip * (0.84 + this.skill * 0.16);
    const scanDist = clamp((speed * speed) / (2 * decel) + 34, 45, 200);
    const topK = (v.stats.topSpeed / 3.6) * (0.80 + this.skill * 0.2);
    let want = Math.min(this.speedLimitAhead(scanDist, latBudget, decel), topK);
    // genuinely lost (nose pointing away from the road): slow down and turn
    if (Math.abs(err) > 1.35) want = Math.min(want, 9);
    if (ctx.playerProgress != null && ctx.ownProgress != null) {
      const gap = ctx.playerProgress - ctx.ownProgress;
      want *= 1 + clamp(gap * this.rubberBand, -0.12, 0.16);
    }
    if (this.finished) want *= 0.82;
    this.targetSpeed = want;

    const vkmh = v.speedKmh;
    const wantKmh = want * 3.6;
    let throttle = 0, brake = 0, handbrake = 0;
    if (vkmh < wantKmh - 6) throttle = 1;
    else if (vkmh < wantKmh) throttle = 0.45;
    else if (vkmh > wantKmh + 10) { brake = clamp((vkmh - wantKmh) / 35, 0, 1); throttle = 0; }
    else throttle = 0.15;

    // slides: lift, steady the wheel, let the assists work. Adding lock here
    // (the old behaviour) fed the oscillation that caused the spin-outs.
    if (Math.abs(v.slipAngle) > 0.3) {
      throttle *= 0.5;
      brake = Math.max(brake, 0.2);
    }

    // stuck against something: back up briefly
    if (vkmh < 3 && throttle > 0.5 && this.reverseTimer <= 0) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.8) { this.reverseTimer = 1.1; this.stuckTimer = 0; }
    } else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);

    // finished a point-to-point run: brake to a stop, never creep backwards
    if (this.atEnd) {
      this.steerSmooth *= 0.9;
      throttle = 0;
      if (v.longSpeed > 1.2) { brake = 1; handbrake = 0; }
      else { brake = 0; handbrake = 1; }     // brake input reverses at a standstill
    }

    v.transmission = 'auto';
    v.update(dt, {
      throttle: throttle - brake,
      brake,
      steer: clamp(this.steerSmooth, -1, 1),
      handbrake,
    }, ctx.world);
  }
}

// steering lock available at a given speed — same curve the physics uses
function steeringLockAt(speed, assists = true) {
  const sf = 1 / (1 + Math.abs(speed) * 0.075);
  return (0.5 * sf + 0.055) * (assists ? 1 : 1.12);
}

// Resample a polyline so consecutive points sit `spacing` metres apart.
export function resamplePath(path, spacing = 4, closed = false) {
  if (!path || path.length < 2) return path || [];
  const out = [{ x: path[0].x ?? path[0][0], z: path[0].z ?? path[0][1] }];
  let carry = 0;
  const count = closed ? path.length : path.length - 1;
  for (let i = 0; i < count; i++) {
    const pa = path[i], pb = path[(i + 1) % path.length];
    const a = { x: pa.x ?? pa[0], z: pa.z ?? pa[1] };
    const b = { x: pb.x ?? pb[0], z: pb.z ?? pb[1] };
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    let t = spacing - carry;
    while (t <= len) {
      out.push({ x: a.x + (dx / len) * t, z: a.z + (dz / len) * t });
      t += spacing;
    }
    carry = len - (t - spacing);
  }
  if (!closed) {
    const last = path[path.length - 1];
    const lp = { x: last.x ?? last[0], z: last.z ?? last[1] };
    const tail = out[out.length - 1];
    if (Math.hypot(lp.x - tail.x, lp.z - tail.z) > spacing * 0.4) out.push(lp);
  }
  return out;
}

// Chaikin-style corner cutting: turns the sharp polyline joining the
// checkpoints into a drivable racing line. Endpoints stay put.
export function smoothPath(path, passes = 2) {
  if (!path || path.length < 4 || passes <= 0) {
    return (path || []).map((p) => ({ x: p.x ?? p[0], z: p.z ?? p[1] }));
  }
  let pts = path.map((p) => ({ x: p.x ?? p[0], z: p.z ?? p[1] }));
  const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 40;
  for (let pass = 0; pass < passes; pass++) {
    const out = [];
    const n = pts.length;
    if (!closed) out.push(pts[0]);
    const first = closed ? 0 : 1;
    for (let i = first; i < (closed ? n : n - 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

// build a smooth path (points every ~8m) from the sparse checkpoints
export function densifyPath(points, spacing = 9, closed = false) {
  const out = [];
  const pts = points.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// progress along a polyline (0..1 per lap)
export function pathProgress(x, z, path, index) {
  let best = Infinity, bestI = 0, bestT = 0;
  const start = Math.max(0, index - 6);
  const end = Math.min(path.length - 1, index + 26);
  for (let i = start; i < end; i++) {
    const a = path[i], b = path[i + 1];
    if (!b) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) { best = d; bestI = i; bestT = t; }
  }
  return (bestI + bestT) / Math.max(1, path.length - 1);
}
