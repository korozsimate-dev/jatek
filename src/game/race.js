// ============================================================
// Race director — checkpoints, laps, opponents, timing, drift scoring
// ============================================================
import * as THREE from 'three';
import { CAR_BY_ID, CAR_DEFS, computeStats, defaultMods } from '../data/cars.js';
import { Vehicle } from '../physics/vehicle.js';
import { CarVisual } from '../world/carMesh.js';
import { AIDriver, densifyPath } from './aiDriver.js';
import { clamp, formatTime, ordinal, RNG } from '../core/util.js';

const RIVAL_POOL = ['coupe_zen', 'coupe_slide', 'sedan_evo', 'drift_nagata', 'exotic_aoi', 'sedan_kessler', 'muscle_stallion', 'hatch_walden', 'sport_milano', 'muscle_vanguard'];
const RIVAL_COLORS = ['#c8202c', '#1c3f8f', '#e0c72a', '#f2f4f6', '#191919', '#28b7a8', '#5c2d7a', '#d04a86'];


// A big floating chevron that points at the next checkpoint. It is parented to
// the scene but repositioned in front of the camera every frame, so it reads
// like a navigation HUD arrow that also exists in the world.
function directionArrow() {
  const g = new THREE.Group();
  // always on top: it is a navigation aid, so a building or a rival must never
  // hide it
  const mat = new THREE.MeshBasicMaterial({
    color: '#37e0c8', transparent: true, opacity: 0.92, toneMapped: false,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  // chevron: two angled slabs forming an arrow head
  for (const sgn of [1, -1]) {
    const geo = new THREE.BoxGeometry(1.15, 0.16, 0.42);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sgn * 0.46, 0, -0.30);
    m.rotation.y = sgn * 0.62;
    g.add(m);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 1.25), mat);
  tail.position.set(0, 0, 0.42);
  g.add(tail);
  const haloMat = new THREE.MeshBasicMaterial({
    color: '#37e0c8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.1;
  g.add(halo);
  g.scale.setScalar(1.35);
  g.renderOrder = 999;
  g.userData.mat = mat;
  g.userData.halo = haloMat;
  return g;
}

function ringMarker(color, radius = 6) {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(radius, 0.28, 8, 32);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 0.6;
  g.add(ring);
  const geo2 = new THREE.TorusGeometry(radius * 0.75, 1.7, 8, 32);
  geo2.rotateX(Math.PI / 2);
  const m2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(geo2, m2);
  glow.position.y = 0.35;
  g.add(glow);
  // vertical beacon
  const beamGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.85, 26, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 13;
  g.add(beam);
  g.userData.mat = mat;
  g.userData.glowMat = m2;
  g.userData.beamMat = beamMat;
  return g;
}

export class RaceDirector {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.ev = null;
    this.state = 'idle';
    this.timer = 0;
    this.countdown = 0;
    this.checkpoints = [];
    this.cpIndex = 0;
    this.lap = 1;
    this.opponents = [];
    this.markers = new THREE.Group();
    game.scene.add(this.markers);
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftMult = 1;
    this.driftBank = 0;
    this.driftDisplay = 0;
    this.driftCooldown = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.result = null;
    this.markerMesh = null;
    this.wrongWay = 0;
  }

  // ---------- setup ----------
  start(ev, opts = {}) {
    this.ev = ev;
    this.active = true;
    this.state = 'countdown';
    this.timer = 0;
    this.countdown = opts.practice ? 1.6 : 3.9;
    this.cpIndex = 0;
    this.lap = 1;
    this.lapTimes = [];
    this.lapStart = 0;
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftMult = 1;
    this.driftBank = 0;
    this.driftDisplay = 0;
    this.result = null;
    this.finishedPos = 0;
    this.opponentFinishCount = 0;
    this.wrongWay = 0;

    // navigation arrow (created once, reused by every event)
    if (!this.arrow) {
      this.arrow = directionArrow();
      this.arrow.visible = false;
      this.game.scene.add(this.arrow);
    }

    // path
    const pts = [[ev.x, ev.z], ...ev.route];
    const closed = ev.type === 'circuit' || ev.type === 'highway';
    this.isCircuit = closed;
    this.path = densifyPath(pts, 9, closed);
    this.checkpointPoints = closed ? pts.slice(1) : pts.slice(1);
    this.totalCheckpoints = this.checkpointPoints.length;
    this.totalLaps = ev.laps || 1;

    // checkpoint markers
    this.clearMarkers();
    for (let i = 0; i < this.checkpointPoints.length; i++) {
      const p = this.checkpointPoints[i];
      const m = ringMarker(ev.type === 'drift' ? '#ffb300' : '#25e0d0', ev.type === 'drift' ? 9 : 6.5);
      m.position.set(p[0], 0.1, p[1]);
      m.visible = false;
      this.markers.add(m);
      this.checkpoints.push({ x: p[0], z: p[1], mesh: m, passed: false });
    }
    this.showNextCheckpoint();
    this._buildOpponents(ev);
    this.game.hud.showRace(ev);
    if (ev.type === 'drift') {
      this.driftTarget = ev.targetScore || 10000;
      this.driftTimeLimit = ev.duration || 60;
    }
    if (ev.type === 'timeattack' || ev.type === 'delivery') {
      this.targetTime = ev.targetTime;
    }
    return true;
  }

  clearMarkers() {
    for (const c of this.checkpoints) {
      if (c.mesh) {
        this.markers.remove(c.mesh);
        c.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      }
    }
    this.checkpoints = [];
    while (this.markers.children.length) this.markers.remove(this.markers.children[0]);
  }

  showNextCheckpoint() {
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      cp.mesh.visible = i === this.cpIndex;
      if (i === this.cpIndex) cp.mesh.userData.mat.opacity = 0.95;
    }
  }

  _buildOpponents(ev) {
    // remove old
    for (const o of this.opponents) {
      this.game.scene.remove(o.visual.group);
      o.visual.dispose();
    }
    this.opponents = [];
    const n = ev.opponents || 0;
    if (!n) return;
    const rng = new RNG(Math.floor(ev.x * 13 + ev.z * 7 + 991));
    const playerRep = this.game.progression.rep || 0;
    const start = this.checkpoints.length ? { x: ev.x, z: ev.z } : { x: ev.x, z: ev.z };
    for (let i = 0; i < n; i++) {
      const id = RIVAL_POOL[Math.floor(rng.next() * RIVAL_POOL.length)];
      const def = CAR_BY_ID[id];
      const mods = defaultMods(def);
      // rivals get some tasteful bolt-ons scaled to the player's rep
      const tier = Math.min(3, 1 + Math.floor(playerRep / 14));
      mods.engine = tier;
      mods.tires = Math.min(2, tier);
      mods.suspension = Math.min(2, tier);
      mods.rims = 2;
      mods.spoiler = 2;
      mods.finish = 1;
      mods.paintColor = RIVAL_COLORS[(i + 1) % RIVAL_COLORS.length];
      mods.tint = 2;
      const veh = new Vehicle(def, mods, { transmission: 'auto', assists: true });
      const visual = new CarVisual(def, mods, { quality: this.game.qualityName });
      visual.setLights(true);
      this.game.scene.add(visual.group);
      const ang = ev.heading || 0;
      const side = (i % 2 === 0 ? 1 : -1) * (3.2 + Math.floor(i / 2) * 3.0);
      // grid rows behind the start line
      const row = Math.floor(i / 2);
      veh.reset(
        ev.x + Math.sin(ang) * side - Math.cos(ang) * (row * 8.5),
        ev.z + Math.cos(ang) * side + Math.sin(ang) * (row * 8.5),
        ang
      );
      const pathCopy = this.path.slice();
      const skill = clamp(0.72 + playerRep / 120 + rng.range(0, 0.12), 0.68, 1.02);
      const ai = new AIDriver(veh, pathCopy, {
        skill, laneBias: (i % 2 ? 1 : -1) * 0.1, rubberBand: 0.07,
        closed: this.isCircuit,
        name: 'RIVAL ' + (i + 1), color: mods.paintColor,
      });
      // the start line doubles as the finish line, so seed the run at the
      // start of the route instead of guessing from the grid position
      ai.startAtRouteStart();
      this.opponents.push({ vehicle: veh, visual, ai, finishTime: null, pos: i + 2 });
    }
  }

  clear() {
    this.active = false;
    this.state = 'idle';
    if (this.arrow) this.arrow.visible = false;
    this.ev = null;
    this.clearMarkers();
    for (const o of this.opponents) {
      this.game.scene.remove(o.visual.group);
      o.visual.dispose();
    }
    this.opponents = [];
    this.game.hud.hideRace();
  }

  // ---------- per-frame ----------
  // point the navigation arrow at whatever the player has to reach next
  updateArrow(dt, vehicle) {
    const arrow = this.arrow;
    if (!arrow) return;
    const cp = this.targetPoint(vehicle);
    if (!this.active || !cp || this.state === 'finished') {
      arrow.visible = false;
      return;
    }
    // HUD compass: bearing relative to where the car is pointing
    const targetBearing = Math.atan2(cp.x - vehicle.x, cp.z - vehicle.z);
    const bearing = Math.atan2(Math.sin(targetBearing - (vehicle.heading + Math.PI / 2)),
                               Math.cos(targetBearing - (vehicle.heading + Math.PI / 2)));
    this.game.hud.updateNav(bearing, Math.hypot(cp.x - vehicle.x, cp.z - vehicle.z));
    const cam = this.game.camera;
    const dx = cp.x - vehicle.x, dz = cp.z - vehicle.z;
    const dist = Math.hypot(dx, dz);
    // park it a few metres in front of the camera, slightly below eye level
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    // the arrow drifts to the side of the screen the target is on
    const sideDot = clamp((dx * right.x + dz * right.z) / Math.max(8, dist), -1, 1);
    const base = cam.position.clone()
      .add(fwd.clone().multiplyScalar(8))
      .add(right.clone().multiplyScalar(sideDot * 2.2));
    base.y = cam.position.y - 0.95;
    arrow.position.lerp(base, Math.min(1, dt * 12));
    // rotate the chevron so its nose (+Z is the tail, so -Z is forward) aims
    // at the checkpoint in world space
    arrow.rotation.y = Math.atan2(dx, dz) + Math.PI;
    const pulse = 0.82 + Math.sin(performance.now() * 0.006) * 0.18;
    arrow.userData.mat.opacity = 0.92 * pulse;
    arrow.userData.halo.opacity = 0.16 * pulse;
    // close to the gate: fade out so it does not cover the checkpoint
    arrow.visible = dist > 6;
  }

  // the point the player should drive to: the active checkpoint, or the finish
  targetPoint(vehicle) {
    if (!this.checkpoints.length) return null;
    const cp = this.checkpoints[this.cpIndex];
    if (!cp) return null;
    return { x: cp.x, z: cp.z };
  }

  update(dt, vehicle, player) {
    if (!this.active) return null;
    const ev = this.ev;
    const hud = this.game.hud;

    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after >= 0) {
        if (after > 0) this.game.audio.countdownBeep(false);
        else { this.game.audio.countdownBeep(true); this.state = 'racing'; this.lapStart = 0; }
        hud.setCountdown(after > 0 ? String(after) : 'GO!');
      }
      // hold the car still
      vehicle.vx = vehicle.vz = vehicle.vLong = vehicle.vLat = 0;
      vehicle.yawRate = 0;
      return null;
    }
    if (this.state === 'racing' || this.state === 'finished') {
      this.timer += dt;
      if (this.state === 'racing') {
        this._checkCheckpoints(vehicle);
        this._updateDrift(dt, vehicle);
        this._updatePositions(vehicle);
        this._updateOpponents(dt, vehicle);
        if (ev.type === 'drift') {
          this.driftTimeLimit -= dt;
          if (this.driftTimeLimit <= 0) this.finishRace(vehicle, true);
        }
        if (ev.type === 'timeattack' || ev.type === 'delivery') {
          const fail = this.targetTime && this.timer > this.targetTime * 1.9;
          if (fail) this.finishRace(vehicle, false, 'TIME EXPIRED');
        }
      } else {
        // still animate opponents home
        this._updateOpponents(dt, vehicle);
      }
      this._updateMarkers(dt);
      hud.updateRace({
        timer: this.timer, position: this.position || 1, lap: this.lap,
        totalLaps: this.totalLaps, cp: this.cpIndex, totalCp: this.totalCheckpoints,
      });
    }
    if (this.state === 'countdown') {
      this._updateMarkers(dt);
    }
    return null;
  }

  _updateMarkers(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      if (!cp.mesh.visible) continue;
      cp.mesh.rotation.y += dt * 0.6;
      const pulse = 1 + Math.sin(t * 3.4) * 0.06;
      cp.mesh.scale.setScalar(pulse);
      cp.mesh.userData.beamMat.opacity = 0.10 + Math.sin(t * 2.6) * 0.05;
    }
  }

  _checkCheckpoints(vehicle) {
    const cp = this.checkpoints[this.cpIndex];
    if (!cp) return;
    const d = Math.hypot(vehicle.x - cp.x, vehicle.z - cp.z);
    if (d < 11) {
      cp.passed = true;
      cp.mesh.visible = false;
      this.cpIndex++;
      if (this.cpIndex >= this.checkpoints.length) {
        // lap complete
        this.lapTimes.push(this.timer - this.lapStart);
        this.lapStart = this.timer;
        this.lap++;
        if (this.lap > this.totalLaps) {
          this.finishRace(vehicle, true);
          return;
        }
        for (const c of this.checkpoints) c.passed = false;
        this.cpIndex = 0;
        this.game.audio.countdownBeep(false);
        this.game.hud.toast(`LAP ${this.lap} / ${this.totalLaps}`, 'rep');
      } else {
        this.game.audio.audioClickCheckpoint?.();
      }
      this.showNextCheckpoint();
      this.game.hud.raceCheckpoint();
    }
  }

  _updateDrift(dt, vehicle) {
    const ev = this.ev;
    const speed = vehicle.speedKmh;
    const slip = Math.abs(vehicle.slipAngle);
    const drifting = slip > 0.18 && speed > 30 && !vehicle.airborne;
    if (ev.type === 'drift') {
      if (drifting) {
        this.driftChain += dt;
        this.driftMult = clamp(1 + this.driftChain * 0.55, 1, 6);
        const gain = slip * speed * 2.4 * this.driftMult * dt * 10;
        this.driftBank += gain;
        this.driftCooldown = 0.9;
        this.game.hud.showDrift(this.driftBank + this.driftScore, this.driftMult);
      } else {
        this.driftCooldown -= dt;
        if (this.driftCooldown <= 0) {
          this.driftChain = 0;
          if (this.driftBank > 0) {
            this.driftScore += Math.round(this.driftBank);
            this.game.audio.ui('confirm');
            this.driftBank = 0;
          }
          this.driftMult = 1;
          this.game.hud.hideDrift();
        }
      }
      // spin out penalty
      if (speed < 12 && this.driftChain > 1.2) {
        this.driftChain = 0; this.driftBank = 0; this.driftMult = 1;
        this.game.hud.toast('SPIN OUT — CHAIN LOST', 'warn');
      }
    }
  }

  driftTotal() {
    return Math.round(this.driftScore + this.driftBank);
  }

  _updatePositions(vehicle) {
    const total = this.totalCheckpoints;
    const myProgress = (this.lap - 1) + (this.cpIndex / total);
    this.position = 1;
    this.playerProgress = myProgress;
    for (const o of this.opponents) {
      const p = (o.ai.lap) + this._opponentCpProgress(o);
      o.raceProgress = p;
      if (p > myProgress) this.position++;
    }
    for (const o of this.opponents) {
      if (o.ai.finished) this.position = Math.min(this.position + 1, this.opponents.length + 1);
    }
  }

  _opponentCpProgress(o) {
    // the AI tracks its own arc-length progress along the route (0..1 per lap)
    if (o.ai && Number.isFinite(o.ai.progress)) return clampi(o.ai.progress, 0, 0.999);
    return 0;
  }

  _updateOpponents(dt, playerVehicle) {
    const others = [playerVehicle, ...this.opponents.map((o) => o.vehicle)];
    const myProg = this.playerProgress || 0;
    for (const o of this.opponents) {
      const ai = o.ai;
      if (ai.finished) {
        // cool down: keep driving
        ai.update(dt, { others, world: this.game.city, playerProgress: null, ownProgress: null });
      } else {
        ai.update(dt, { others, world: this.game.city, playerProgress: myProg, ownProgress: o.raceProgress || 0 });
      }
      const v = o.vehicle;
      o.visual.group.position.set(v.x, 0.16 + (v.y || 0), v.z);
      o.visual.group.rotation.y = v.heading;
      o.visual.update(dt, {
        steer: clamp(v.steerAngle * 1.8, -0.7, 0.7), wheelDelta: (v.longSpeed / v.def.body.wheelR) * dt,
        suspension: v.suspension, pitch: v.pitch, roll: v.roll,
      });
      o.visual.setBrake(v.braking > 0.1 ? 1 : 0);
      o.visual.setReverse(v.longSpeed < -0.5 ? 1 : 0);
      // track lap / finish
      if (ai.lap >= this.totalLaps && !ai.finished) {
        ai.finished = true;
        o.finishTime = this.timer;
        this.opponentFinishCount++;
        // if the player hasn't finished, their position worsens
        if (this.state === 'racing') {
          this.game.hud.toast(`${ai.name} FINISHED`, 'warn');
        }
      }
    }
  }

  finishRace(vehicle, success = true, reason = '') {
    if (this.state === 'finished') return;
    this.state = 'finished';
    const ev = this.ev;
    let position = this.position || 1;
    // anyone who finished before us beats us
    const beaten = this.opponents.filter((o) => o.ai.finished).length;
    position = Math.max(1, Math.min(this.opponents.length + 1, beaten + 1));
    if (ev.type === 'drift') {
      position = this.driftTotal() >= this.driftTarget ? 1 : 2;
    }
    this.finishedPos = position;
    const totalTime = this.timer;
    const result = {
      ev,
      position,
      time: totalTime,
      bestLap: this.lapTimes.length ? Math.min(...this.lapTimes) : null,
      score: ev.type === 'drift' ? this.driftTotal() : null,
      success,
      reason,
      opponents: this.opponents.length + 1,
    };

    // payout model
    const prizeBase = ev.prize;
    let payout = 0;
    let rep = 0;
    if (!success) {
      payout = 0; rep = 0;
    } else if (ev.type === 'drift') {
      const ratio = clamp(this.driftTotal() / this.driftTarget, 0, 2.2);
      payout = Math.round(prizeBase * ratio * 0.85);
      rep = Math.round((ev.rep || 3) * clamp(ratio, 0.2, 1.7));
    } else if (ev.type === 'timeattack') {
      const margin = 1 - clamp(totalTime / this.targetTime, 0, 2);
      payout = Math.round(prizeBase * clamp(0.4 + margin * 1.1, 0, 1.6));
      rep = Math.round((ev.rep || 3) * (margin > 0 ? 1.2 : 0.4));
    } else {
      const n = this.opponents.length + 1;
      const ratios = n <= 1 ? [1] : [1, 0.58, 0.36, 0.2, 0.12, 0.08];
      const ratio = ratios[Math.min(position - 1, ratios.length - 1)];
      payout = Math.round(prizeBase * ratio);
      rep = Math.round((ev.rep || 3) * (position === 1 ? 1 : position === 2 ? 0.55 : position === 3 ? 0.3 : 0.12));
    }
    // repeat farming decay
    const rec = this.game.progression.data.records[ev.id];
    if (rec && rec.lastPayout > 0 && rec.plays > 2) {
      payout = Math.round(payout * 0.55);
    }
    result.payout = payout;
    result.rep = rep;

    const prog = this.game.progression;
    if (payout > 0) prog.addMoney(payout, true);
    if (rep > 0) prog.addRep(rep);
    prog.recordRace(ev, { position, time: ev.type === 'drift' ? null : totalTime, score: result.score });
    prog.data.races++;
    if (position === 1 && success) prog.data.wins++;
    prog.data.records[ev.id].lastPayout = payout;
    prog.save();

    this.result = result;
    // clear the track visuals
    this.clearMarkers();
    this.game.hud.hideDrift();
    this.game.hud.hideRace();
    return result;
  }

  abort() {
    this.clear();
  }
}

function clampi(v, a, b) { return v < a ? a : v > b ? b : v; }
