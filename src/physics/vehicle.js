// ============================================================
// Vehicle dynamics.
// Bicycle-model lateral tyre forces + a torque-curve longitudinal
// model, tuned to feel arcade-responsive but weighty. All maths is
// in plain numbers so it can be unit-tested headless.
// ============================================================

import { computeStats } from '../data/cars.js';
import { clamp, wrapAngle } from '../core/util.js';

const GEAR_RATIOS = {
  3: [3.5, 2.1, 1.35],
  4: [3.4, 2.1, 1.45, 1.0],
  5: [3.35, 2.15, 1.55, 1.18, 0.92],
  6: [3.55, 2.32, 1.72, 1.35, 1.08, 0.88],
  7: [3.65, 2.45, 1.85, 1.5, 1.25, 1.05, 0.9],
};

export const DRIVE_CONFIG = {
  idleRpm: 850,
  redline: 7600,
  limiter: 7900,
  clutchTime: 0.16,
  torqueCurve: [0.42, 0.62, 0.80, 0.93, 1.0, 0.97, 0.88, 0.72, 0.55], // normalised 0..redline
  engineBrake: 0.16,
};

export class Vehicle {
  constructor(def, mods, opts = {}) {
    this.def = def;
    this.mods = mods;
    this.stats = computeStats(def, mods);
    this.reset(0, 0, 0);
    this.isPlayer = !!opts.isPlayer;
    this.transmission = opts.transmission || 'auto';
    this.assists = opts.assists !== false;

    // identity
    this.name = def.name;
    this.id = def.id;

    // audio/visual event flags (consumed by presentation layer)
    this.events = { shift: 0, backfire: 0, scrape: 0, impact: 0, driftStart: 0, wheelspin: 0 };
    this.nitro = 1;
    this.nitroActive = false;
    this.throttleAmount = 0;
  }

  reset(x, z, heading = 0) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.gear = 1;
    this.rpm = DRIVE_CONFIG.idleRpm;
    this.shiftTimer = 0;
    this.pitch = 0; this.roll = 0;
    this.pitchVel = 0; this.rollVel = 0;
    this.slipAngle = 0;
    this.lateralSpeed = 0;
    this.longSpeed = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.handbrake = 0;
    this.braking = 0;
    this.suspension = [0, 0, 0, 0];
    this.health = 1;
    this.airborne = false;
    this.wheelspinAmount = 0;
    this.speed = 0;
    this.accelG = 0;
    this.lastShift = 0;
    this.throttleAmount = 0;
    this.engineLoad = 0;
  }

  get speedKmh() { return Math.abs(this.longSpeed) * 3.6; }
  get forwardX() { return Math.cos(this.heading); }
  get forwardZ() { return -Math.sin(this.heading); }
  get rightX() { return Math.sin(this.heading); }
  get rightZ() { return Math.cos(this.heading); }

  gearRatio() {
    const ratios = GEAR_RATIOS[this.stats.gears] || GEAR_RATIOS[5];
    const g = clamp(this.gear, 1, ratios.length);
    return ratios[g - 1];
  }

  // ---------------- main integration ----------------
  update(dt, input, world) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const S = this.stats;
    const P = {
      mass: S.weight,
      power: S.hp * 745.7 * 0.88,
      topSpeed: (S.topSpeed / 3.6),
      grip: S.grip / 100,
      brake: S.brake / 100,
      driftMul: S.driftMul || 1,
      camber: S.camber || 0,
    };
    // geometry
    const wheelbase = this.def.body.wheelbase;
    const a = wheelbase * 0.47;      // CG to front axle
    const b = wheelbase * 0.53;      // CG to rear axle
    const trackW = this.def.body.track;
    const g = 9.81;

    // --- body-frame velocity derived from world velocity ---
    // (rotating the car must NOT rotate its momentum, or slides are impossible)
    let cosH = Math.cos(this.heading), sinH = Math.sin(this.heading);
    let vLong = this.vx * cosH - this.vz * sinH;
    let vLat = this.vx * sinH + this.vz * cosH;
    const totalSpeed = Math.hypot(vLong, vLat);
    this.slipAngle = Math.atan2(vLat, Math.max(0.4, Math.abs(vLong)));

    const throttle = clamp(input.throttle || 0, -1, 1);
    const brakeIn = clamp(input.brake || 0, 0, 1);
    const steerIn = clamp(input.steer || 0, -1, 1);
    const hbIn = clamp(input.handbrake || 0, 0, 1);
    this.throttleAmount = Math.abs(throttle);

    // --- steering: speed sensitive, smoothed ---
    const speedFactor = 1 / (1 + Math.abs(vLong) * 0.045);
    const maxSteerNow = 0.58 * speedFactor + 0.07;
    const steerTarget = steerIn * maxSteerNow * (this.assists ? 1 : 1.12);
    const steerRate = 8.5 + (1 - speedFactor) * 7;
    this.steerAngle += clamp(steerTarget - this.steerAngle, -steerRate * dt, steerRate * dt);

    // --- gearbox ---
    this._updateGearbox(dt, throttle, brakeIn);

    // --- longitudinal forces ---
    let longForce = 0;
    const absV = Math.abs(vLong);

    // engine force
    const gearRatio = this.gearRatio();
    const finalDrive = 3.7;
    const driveEff = 0.90;
    const torque = this._torqueAtRpm(this.rpm);
    const wheelR = this.def.body.wheelR;
    let engineForce = 0;
    if (throttle > 0 && this.shiftTimer <= 0) {
      engineForce = (torque * gearRatio * finalDrive * driveEff * throttle) / wheelR;
      // physical power ceiling (forces fall away as speed rises)
      const Fmax = (P.power * 1.9) / Math.max(absV, 3.0);
      engineForce = Math.min(engineForce, Fmax);
    } else if (throttle < 0) {
      // reverse gear — the S key doubles as brake then reverse
      if (vLong < 0.5) engineForce = P.mass * 3.2 * throttle;  // throttle is negative
      else engineForce = -P.mass * 0.55;                        // engine braking while rolling forward
    }
    if (this.shiftTimer > 0) engineForce *= 0.12;

    // applied drive force is limited by tyre grip (else the car spins the wheels)
    const maxTraction = P.grip * P.mass * g * (this.def.drivetrain === 'AWD' ? 12.0 : this.def.drivetrain === 'RWD' ? 6.6 : 6.2);
    let wheelspin = 0;
    if (Math.abs(engineForce) > maxTraction) {
      wheelspin = clamp((Math.abs(engineForce) - maxTraction) / maxTraction, 0, 1.6);
      engineForce = Math.sign(engineForce) * maxTraction * (1 + wheelspin * 0.10);
    }
    this.wheelspinAmount = wheelspin;
    if (wheelspin > 0.55 && absV < 22) this.events.wheelspin = Math.max(this.events.wheelspin, wheelspin);

    // brakes
    let brakeForce = 0;
    if (brakeIn > 0 && vLong > 0.35) {
      brakeForce = -brakeIn * P.mass * (6.5 + P.brake * 9);
      this.braking = brakeIn;
    } else this.braking = 0;
    // handbrake
    let hbForce = 0;
    if (hbIn > 0.1) hbForce = -Math.sign(vLong) * hbIn * P.mass * 5.5;
    this.handbrake = hbIn;

    // drag + rolling resistance. Drag is calibrated so the car's stated
    // top speed is reachable at around 6500 rpm in top gear.
    const dragMul = this.stats.dragMul || 1;
    const topMs = Math.max(20, P.topSpeed);
    const dragC = (0.88 * P.power) / (topMs * topMs * topMs);
    const drag = -dragC * vLong * Math.abs(vLong) * dragMul;
    const roll = -Math.sign(vLong) * P.mass * g * (this.stats.weight > 1500 ? 0.013 : 0.011);

    longForce = engineForce + brakeForce + hbForce + drag + roll;

    // nitro
    const wantNitro = !!input.nitro && this.nitro > 0.02 && throttle > 0.2;
    this.nitroActive = wantNitro;
    if (wantNitro) {
      longForce += P.mass * 5.4;
      this.nitro = Math.max(0, this.nitro - dt * 0.20);
    } else {
      this.nitro = Math.min(1, this.nitro + dt * 0.045);
    }

    // --- tyre model (bicycle) ---
    const yawRate = this.yawRate;
    const vfLat = vLat + yawRate * a;
    const vrLat = vLat - yawRate * b;

    const loadF = P.mass * g * 0.5 - (longForce * 0.5 * 0.16);
    const loadR = P.mass * g * 0.5 + (longForce * 0.5 * 0.16);
    const loadFc = clamp(loadF, P.mass * g * 0.18, P.mass * g * 0.82);
    const loadRc = clamp(loadR, P.mass * g * 0.18, P.mass * g * 0.82);

    const muBase = 0.92 + (P.grip - 0.5) * 1.45; // 0.5 -> ~0.92, 0.9 -> ~1.5
    const muF = muBase * (1 + P.camber * -0.55);
    let muR = muBase * 0.995;
    if (hbIn > 0.05) muR *= (1 - 0.68 * hbIn);
    // power oversteer for RWD/AWD when spinning up
    if (wheelspin > 0.35) muR *= (1 - 0.34 * Math.min(1, wheelspin));
    const surfaceGrip = world?.surfaceGrip ? world.surfaceGrip(this.x, this.z) : 1;
    const muFW = muF * surfaceGrip;
    const muRW = muR * surfaceGrip;

    const speedDen = Math.max(Math.abs(vLong), 1.4);
    const alphaF = Math.atan2(vfLat, speedDen) - this.steerAngle;
    const alphaR = Math.atan2(vrLat, speedDen);

    const stiffF = 10.5, stiffR = 11.5;
    let fyF = -clamp(alphaF * stiffF, -1, 1) * muFW * loadFc;
    let fyR = -clamp(alphaR * stiffR, -1, 1) * muRW * loadRc;

    // low speed: fade forces to avoid jitter while parked
    if (absV < 0.8) { fyF *= absV / 0.8; fyR *= absV / 0.8; }

    // --- integrate local velocity ---
    const dvLong = longForce / P.mass;
    const dvLat = (fyF * Math.cos(this.steerAngle) + fyR) / P.mass;
    vLong += dvLong * dt;
    vLat += dvLat * dt;
    // scrubbing: lateral velocity decays (tyre drag), more aggressively when gripping
    const scrub = this.drifting ? 0.9 : 3.2;
    vLat *= Math.exp(-dt * scrub);

    // yaw dynamics
    const izz = P.mass * (wheelbase * wheelbase) * 0.115 + P.mass * (trackW * trackW) * 0.02;
    const torqueYaw = a * fyF * Math.cos(this.steerAngle) - b * fyR;
    let yawAccel = torqueYaw / izz;
    // handbrake kick: the rear steps out
    if (hbIn > 0.2 && absV > 4) {
      const dir = Math.sign(this.steerAngle) || Math.sign(vLat) || 1;
      yawAccel += dir * hbIn * 4.6 * clamp(absV / 18, 0, 1.5);
    }
    // stability: self-aligning damping plus a gentle yaw boost while powering out of a slide
    yawAccel -= yawRate * 1.7;
    if (this.assists && Math.abs(this.slipAngle) > 0.22 && throttle > 0.35) {
      yawAccel += Math.sign(this.slipAngle) * 0.9;
    }
    this.yawRate = clamp(yawRate + yawAccel * dt, -3.6, 3.6);
    if (absV < 1.2) this.yawRate *= 0.55;

    // --- rotate velocity into the world frame with the OLD heading ---
    this.vx = vLong * cosH + vLat * sinH;
    this.vz = -vLong * sinH + vLat * cosH;

    // --- then rotate the body ---
    this.heading = wrapAngle(this.heading + this.yawRate * dt);

    // integrate position
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // --- derived values for presentation ---
    this.longSpeed = vLong;
    this.lateralSpeed = vLat;
    this.speed = Math.hypot(vLong, vLat);
    const wasDrifting = this.drifting;
    this.drifting = Math.abs(this.slipAngle) > 0.16 && this.speed > 7;
    if (this.drifting && !wasDrifting) this.events.driftStart = 1;
    if (this.drifting) this.driftTime += dt; else this.driftTime = 0;

    // suspension: simulate a spring per wheel for body attitude
    this.accelG = dvLong / g;
    const latG = (this.yawRate * vLong) / g;
    const pitchTarget = clamp(-this.accelG * 0.055, -0.075, 0.075) * (this.def.body.height / 1.3);
    const rollTarget = clamp(latG * 0.055, -0.09, 0.09) * (1.3 / this.def.body.height);
    this.pitchVel += (pitchTarget - this.pitch) * 42 * dt - this.pitchVel * 9 * dt;
    this.pitch += this.pitchVel * dt;
    this.rollVel += (rollTarget - this.roll) * 40 * dt - this.rollVel * 8.5 * dt;
    this.roll += this.rollVel * dt;

    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const axle = i < 2 ? 1 : -1;
      const target = (axle > 0 ? 1 : -1) * this.pitch * 1.6 + side * this.roll * 1.4;
      this.suspension[i] += (target - this.suspension[i]) * Math.min(1, dt * 14);
    }

    this.wheelSpin += (vLong / wheelR) * dt + wheelspin * dt * 6 * Math.sign(engineForce || 1);

    // engine load / sound
    this.engineLoad = Math.max(throttle > 0 ? 0.55 + this.rpm / 8000 * 0.45 : 0.1,
      throttle < 0 ? 0.35 : 0);
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    if (this.events.backfire > 0) this.events.backfire -= dt * 3;
    if (this.events.impact > 0) this.events.impact -= dt * 3;
    return this;
  }

  _updateGearbox(dt, throttle, brakeIn) {
    // engine rpm from wheel speed & gear
    const gearRatio = this.gearRatio();
    const finalDrive = 3.7;
    const wheelR = this.def.body.wheelR;
    const kmh = Math.abs(this.longSpeed) * 3.6;
    const wheelRpm = (Math.abs(this.longSpeed) / (2 * Math.PI * wheelR)) * 60;
    let rpm = wheelRpm * gearRatio * finalDrive;
    const idle = DRIVE_CONFIG.idleRpm;
    const redline = DRIVE_CONFIG.redline;
    // clutch slip when launching
    const launching = Math.abs(this.longSpeed) < 2.2 && throttle > 0.1;
    if (launching) rpm = Math.max(rpm, idle + throttle * 2200 + this.wheelspinAmount * 2400);
    if (this.gear === 1 && Math.abs(this.longSpeed) < 0.4) rpm = Math.max(rpm, idle + throttle * 3400);
    this.rpm = clamp(rpm, idle - 200, DRIVE_CONFIG.limiter);

    const auto = this.transmission === 'auto';
    if (this.shiftTimer > 0) return;

    const shiftDelay = DRIVE_CONFIG.clutchTime / (this.stats.shiftMul || 1);
    if (auto) {
      const upRpm = redline * 0.94;
      const downRpm = redline * 0.42;
      const maxGear = this.stats.gears;
      if (this.rpm > upRpm && this.gear < maxGear && this.longSpeed > 0.5) {
        this.gear++; this.shiftTimer = shiftDelay; this.lastShift = 1; this.events.shift = 1;
      } else if (this.rpm < downRpm && this.gear > 1) {
        this.gear--; this.shiftTimer = shiftDelay * 0.8; this.lastShift = -1; this.events.shift = 1;
      }
      if (this.longSpeed < -0.5 && this.gear !== 1) this.gear = 1;
    }
    // over-rev limiter: bounce
    if (this.rpm >= DRIVE_CONFIG.limiter - 40 && throttle > 0) {
      this.rpm = DRIVE_CONFIG.limiter - 120;
      this.events.backfire = Math.max(this.events.backfire, 0.4);
    }
  }

  _torqueAtRpm(rpm) {
    const idle = DRIVE_CONFIG.idleRpm, red = DRIVE_CONFIG.redline;
    const curve = DRIVE_CONFIG.torqueCurve;
    const t = clamp((rpm - idle) / (red - idle), 0, 1);
    const f = t * (curve.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(curve.length - 1, i0 + 1);
    const frac = f - i0;
    const tn = curve[i0] * (1 - frac) + curve[i1] * frac;
    // Peak crank torque from peak power: T = P / omega (watts / rad-s)
    const peakPowerW = this.stats.hp * 745.7 * 0.88;
    const radPerSecAtPeak = red * 0.68 * (Math.PI * 2 / 60);
    const peakTorque = peakPowerW / radPerSecAtPeak;
    return tn * peakTorque;
  }

  shiftUp() {
    if (this.shiftTimer > 0) return;
    if (this.gear < this.stats.gears) {
      this.gear++;
      this.shiftTimer = DRIVE_CONFIG.clutchTime / (this.stats.shiftMul || 1);
      this.lastShift = 1;
      this.events.shift = 1;
    }
  }
  shiftDown() {
    if (this.shiftTimer > 0) return;
    if (this.gear > 1) {
      this.gear--;
      this.shiftTimer = DRIVE_CONFIG.clutchTime / (this.stats.shiftMul || 1) * 0.8;
      this.lastShift = -1;
      this.events.shift = 1;
    }
  }

  applyDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  // resolve a collision with a static box (world-space velocity)
  resolveCollision(nx, nz, depth, restitution = 0.28) {
    this.x += nx * depth;
    this.z += nz * depth;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      const impact = Math.abs(vn);
      this.vx -= vn * (1 + restitution) * nx;
      this.vz -= vn * (1 + restitution) * nz;
      // scrub tangential velocity a little
      this.vx *= 0.92; this.vz *= 0.92;
      // refresh the cached body-frame speeds
      const cosH = Math.cos(this.heading), sinH = Math.sin(this.heading);
      this.longSpeed = this.vx * cosH - this.vz * sinH;
      this.lateralSpeed = this.vx * sinH + this.vz * cosH;
      this.yawRate *= 0.7;
      if (impact > 2) {
        this.events.impact = Math.min(1, impact / 14);
        this.applyDamage(impact * 0.012);
      }
      return impact;
    }
    return 0;
  }
}
