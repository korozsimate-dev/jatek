// ============================================================
// AI driver — drives a Vehicle around a waypoint path.
// Pure kinematic steering/throttle controller: no cheating physics,
// so it feels like racing another car (with mild skill scaling).
// ============================================================
import { clamp, wrapAngle } from '../core/util.js';

export class AIDriver {
  constructor(vehicle, path, opts = {}) {
    this.vehicle = vehicle;
    this.path = path;
    this.index = 0;
    this.skill = opts.skill ?? 0.85;         // 0.6 slow .. 1.05 fast
    this.laneBias = opts.laneBias ?? 0;
    this.rubberBand = opts.rubberBand ?? 0.06;
    this.targetSpeed = 0;
    this.steerSmooth = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.lap = 0;
    this.finished = false;
    this.progressSegment = 0;
    this.progressT = 0;
    this.name = opts.name || 'RIVAL';
    this.color = opts.color || '#b9c4cd';
    this.wrongWayTimer = 0;
  }

  reset(path) {
    if (path) this.path = path;
    this.index = 0;
    this.lap = 0;
    this.finished = false;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
  }

  // distance from the car to the next waypoint
  _advance() {
    const v = this.vehicle;
    let guard = 0;
    while (guard++ < 4) {
      const wp = this.path[this.index];
      if (!wp) break;
      const d = Math.hypot(wp.x - v.x, wp.z - v.z);
      if (d < 12) {
        this.index++;
        if (this.index >= this.path.length) {
          this.index = 0;
          this.lap++;
        }
      } else break;
    }
  }

  currentTarget() {
    return this.path[this.index] || this.path[0];
  }

  lookaheadPoint(dist) {
    const v = this.vehicle;
    let idx = this.index;
    let remaining = dist;
    let px = v.x, pz = v.z;
    let guard = 0;
    while (remaining > 0 && guard++ < 12) {
      const wp = this.path[idx % this.path.length];
      if (!wp) break;
      const dx = wp.x - px, dz = wp.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 0.001) { idx++; continue; }
      if (d >= remaining) {
        return { x: px + (dx / d) * remaining, z: pz + (dz / d) * remaining };
      }
      remaining -= d;
      px = wp.x; pz = wp.z;
      idx++;
    }
    return { x: px, z: pz };
  }

  update(dt, ctx = {}) {
    const v = this.vehicle;
    this._advance();
    const speed = Math.abs(v.longSpeed);

    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      v.update(dt, { throttle: -0.7, brake: 0, steer: -clamp(this.steerSmooth, -1, 1), handbrake: 0 }, ctx.world);
      return;
    }

    const look = this.lookaheadPoint(9 + speed * 0.55);
    const dx = look.x - v.x, dz = look.z - v.z;
    const desired = Math.atan2(-dz, dx);
    let diff = wrapAngle(desired - v.heading);

    // avoidance: nudge around nearby cars
    if (ctx.others) {
      for (const o of ctx.others) {
        if (!o || o === v) continue;
        const rx = o.x - v.x, rz = o.z - v.z;
        const d = Math.hypot(rx, rz);
        if (d < 12 && d > 0.01) {
          const forwardDot = (rx * Math.cos(v.heading) + rz * -Math.sin(v.heading)) / d;
          if (forwardDot > 0.75) {
            const cross = Math.cos(v.heading) * rz - (-Math.sin(v.heading)) * rx;
            diff += (cross > 0 ? 1 : -1) * 0.22 * (1 - d / 12);
          }
        }
      }
    }

    // Controller convention: steer > 0 = turn right. A positive heading error
    // means the car points left of the target, so the sign is inverted here.
    const steerCmd = clamp(-diff * 2.3, -1, 1);
    this.steerSmooth += (steerCmd - this.steerSmooth) * Math.min(1, dt * 9);

    // target speed based on upcoming curvature
    const far = this.lookaheadPoint(26 + speed * 1.1);
    const fx = far.x - v.x, fz = far.z - v.z;
    const farAngle = Math.atan2(-fz, fx);
    const curve = Math.abs(wrapAngle(farAngle - v.heading));
    const topK = (v.stats.topSpeed / 3.6) * (0.80 + this.skill * 0.2);
    let want = topK * (1 - clamp(curve * 0.55, 0, 0.62));
    if (Math.abs(diff) > 0.35) want *= 0.62;
    if (Math.abs(diff) > 0.8) want *= 0.45;
    // rubber band relative to the player's progress
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
    else if (vkmh > wantKmh + 12) { brake = clamp((vkmh - wantKmh) / 40, 0, 1); throttle = 0; }
    else { throttle = 0.15; }
    // big slides: lift and counter-steer
    if (Math.abs(v.slipAngle) > 0.28) {
      throttle *= 0.55;
      this.steerSmooth += Math.sign(v.slipAngle) * 0.28;
    }
    if (Math.abs(v.slipAngle) > 0.45) handbrake = 0;
    // stuck detection
    if (vkmh < 3 && throttle > 0.5 && this.reverseTimer <= 0) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.8) { this.reverseTimer = 1.1; this.stuckTimer = 0; }
    } else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);

    v.transmission = 'auto';
    v.update(dt, {
      throttle: throttle - brake,
      brake, steer: clamp(this.steerSmooth, -1, 1), handbrake,
    }, ctx.world);

    // track progress for race positions
    this.progressSegment = this.index;
  }
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
