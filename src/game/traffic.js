// ============================================================
// Ambient traffic — cars following the city road graph.
// Uses a lightweight kinematic model: they steer toward their next
// waypoint, brake for each other and for the player.
// ============================================================
import * as THREE from 'three';
import { CAR_DEFS, CAR_BY_ID } from '../data/cars.js';
import { CarVisual } from '../world/carMesh.js';
import { buildRoadNetwork, GRID } from '../world/layout.js';
import { RNG, clamp } from '../core/util.js';

const TRAFFIC_COLORS = [
  '#b9c4cd', '#1b2027', '#7a1f24', '#2c3f4a', '#d8dde2', '#4a5a3a',
  '#8a6a2a', '#3d3d42', '#8b9198', '#5c2d3a', '#2f5b6e', '#c9c3b0',
];

export const TRAFFIC_DEFS = ['muscle_coronet', 'van_delivery', 'suv_path', 'sedan_rhein', 'hatch_kei', 'sedan_kessler', 'muscle_vanguard', 'coupe_zen'];

export class TrafficCar {
  constructor(def, color, quality, network) {
    this.def = def;
    this.visual = new CarVisual(def, {
      paintColor: color, finish: 0, tint: 1, rims: 0, rimSize: 0,
      frontBumper: 0, rearBumper: 0, skirts: 0, spoiler: 0, hood: 0,
      headlights: 0, exhaustTip: 0, livery: 0, underglow: 0,
      wheel: 0, seats: 0, dash: 0, interiorColor: 0, tires: 0,
      engine: 0, turbo: 0, ecu: 0, intake: 0, exhaust: 0, cooling: 0,
      gearbox: 0, clutch: 0, diff: 0, final: 0,
      suspension: 0, ride: 0, camber: 0,
    }, { quality });
    this.group = this.visual.group;
    this.network = network;
    this.speed = 0;
    this.targetSpeed = 11;
    this.heading = 0;
    this.x = 0; this.z = 0;
    this.node = null;
    this.next = null;
    this.wheelSpin = 0;
    this.steer = 0;
    this.stuckTimer = 0;
    this.honkTimer = 0;
    this.isPolice = false;
    this.kind = 'traffic';
  }

  spawnAt(x, z, heading, node, next) {
    this.x = x; this.z = z; this.heading = heading;
    this.node = node; this.next = next;
    this.speed = 9;
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    // model points +X by default, so rotate so that local +X aligns with heading
    this.group.rotation.y = this.heading;
    this.group.rotation.y = this.heading;
  }

  pickNext() {
    if (!this.next) { this.next = this.node; }
    this.node = this.next;
    const opts = this.network.neighbours(this.node, true);
    let choice = null;
    if (opts.length === 0) {
      // dead end: reverse direction
      const back = this.network.neighbours(this.node, false);
      choice = back[0] || null;
    } else {
      // prefer going straight
      const straight = opts.filter((o) => o.turn === 0);
      const side = opts.filter((o) => o.turn !== 0);
      const r = Math.random();
      if (straight.length && (r < 0.62 || side.length === 0)) choice = straight[Math.floor(Math.random() * straight.length)];
      else if (side.length) choice = side[Math.floor(Math.random() * side.length)];
      else choice = opts[Math.floor(Math.random() * opts.length)];
    }
    this.next = choice ? choice.node : null;
  }

  update(dt, player, others) {
    if (!this.node) return;
    if (!this.next) this.pickNext();
    if (!this.next) return;
    const tx = this.next.x, tz = this.next.z;
    let dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6.5) this.pickNext();
    dx = this.next.x - this.x; dz = this.next.z - this.z;
    const targetHeading = Math.atan2(-dz, dx);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = 1.9;
    this.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    this.steer = clamp(diff * 1.6, -0.55, 0.55);

    // speed control
    let want = 12 + (this.def.hp > 200 ? 3 : 0);
    if (Math.abs(diff) > 0.5) want = 5.5;
    else if (Math.abs(diff) > 0.2) want = 8.5;

    // slow for obstacles ahead
    const ax = Math.cos(this.heading), az = -Math.sin(this.heading);
    for (const o of others) {
      if (o === this) continue;
      const rx = o.x - this.x, rz = o.z - this.z;
      const d = Math.hypot(rx, rz);
      if (d < 16 && d > 0.1) {
        const dot = (rx * ax + rz * az) / d;
        if (dot > 0.72) want = Math.min(want, Math.max(0, (d - 5) * 1.5));
      }
    }
    if (player) {
      const rx = player.x - this.x, rz = player.z - this.z;
      const d = Math.hypot(rx, rz);
      if (d < 20) {
        const dot = (rx * ax + rz * az) / d;
        if (dot > 0.6) want = Math.min(want, Math.max(0, (d - 6) * 1.4));
      }
    }

    this.targetSpeed = want;
    const accel = this.speed < want ? 5.5 : -9;
    this.speed += accel * dt;
    this.speed = clamp(this.speed, 0, 24);

    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z += -Math.sin(this.heading) * this.speed * dt;
    this.wheelSpin += (this.speed / this.def.body.wheelR) * dt;

    // visual
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    this.visual.update(dt, {
      steer: this.steer, wheelDelta: (this.speed / this.def.body.wheelR) * dt,
      suspension: [0, 0, 0, 0], pitch: 0, roll: this.steer * 0.02,
    });
    // brake lights when slowing
    this.visual.setBrake(this.speed < 2 || (want < this.speed - 0.4) ? 1 : 0);
  }
}

export class TrafficSystem {
  constructor(scene, settings, quality) {
    this.scene = scene;
    this.settings = settings;
    this.quality = quality;
    this.network = buildRoadNetwork();
    this.cars = [];
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    scene.add(this.group);
    this.enabled = true;
  }

  count() {
    return this.quality === 'low' ? 10 : this.quality === 'medium' ? 16 : 22;
  }

  _spawnPoint(rng) {
    const nodes = this.network.nodes;
    for (let tries = 0; tries < 24; tries++) {
      const n = nodes[Math.floor(rng.next() * nodes.length)];
      if (!n) continue;
      const onwards = this.network.neighbours(n, true);
      if (!onwards.length) continue;
      return { node: n, next: onwards[0].node };
    }
    return null;
  }

  reset() {
    for (const c of this.cars) {
      this.group.remove(c.group);
      c.visual.dispose();
    }
    this.cars.length = 0;
  }

  populate(centre, radius = 260) {
    const rng = new RNG(Date.now() & 0xffff);
    const list = TRAFFIC_DEFS;
    const n = this.count();
    let made = 0, guard = 0;
    while (made < n && guard < n * 8) {
      guard++;
      const sp = this._spawnPoint(rng);
      if (!sp) continue;
      const x = sp.node.x, z = sp.node.z;
      if (centerDist(x, z, centre) < 18) continue;
      const def = CAR_BY_ID[list[made % list.length]];
      const color = TRAFFIC_COLORS[Math.floor(rng.next() * TRAFFIC_COLORS.length)];
      const car = new TrafficCar(def, color, 'low', this.network);
      const dx = sp.next.x - x, dz = sp.next.z - z;
      car.spawnAt(x, z, Math.atan2(-dz, dx), sp.node, sp.next);
      car.visual.setLights(true);
      this.group.add(car.group);
      this.cars.push(car);
      made++;
    }
  }

  // recycle cars that are far away
  update(dt, player, centre) {
    if (!this.enabled) return;
    for (const car of this.cars) {
      car.update(dt, player, this.cars);
      const d = Math.hypot(car.x - centre.x, car.z - centre.z);
      if (d > 340) {
        const rng = new RNG(Math.floor(Math.random() * 1e9));
        for (let k = 0; k < 12; k++) {
          const sp = this._spawnPoint(rng);
          if (!sp) continue;
          const nd = Math.hypot(sp.node.x - centre.x, sp.node.z - centre.z);
          if (nd < 250 && nd > 60) {
            const dx = sp.next.x - sp.node.x, dz = sp.next.z - sp.node.z;
            car.spawnAt(sp.node.x, sp.node.z, Math.atan2(-dz, dx), sp.node, sp.next);
            break;
          }
        }
      }
    }
  }
}

function centerDist(x, z, c) { return Math.hypot(x - c.x, z - c.z); }
