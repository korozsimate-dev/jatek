// ============================================================
// Wanted level + police pursuit (fictional arcade gameplay)
// ============================================================
import * as THREE from 'three';
import { CAR_BY_ID, computeStats, defaultMods } from '../data/cars.js';
import { Vehicle } from '../physics/vehicle.js';
import { CarVisual } from '../world/carMesh.js';
import { clamp, wrapAngle, RNG } from '../core/util.js';

const WANTED_THRESHOLDS = [0, 1, 2, 3, 4, 5];

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.wanted = 0;
    this.heat = 0;                 // 0..1 progress toward losing the cops
    this.units = [];
    this.copGroup = new THREE.Group();
    game.scene.add(this.copGroup);
    this.sirenTimer = 0;
    this.bustedTimer = 0;
    this.searchTimer = 0;
    this.lastCrimeTime = 0;
    this.cooldown = 0;
    this.roadblock = null;
    this.roadblockTimer = 0;
    this.lightBars = [];
    this.cooldownPause = 0;
  }

  get maxUnits() { return this.wanted === 0 ? 0 : Math.min(5, this.wanted + 1); }

  addWanted(amount, reason = '') {
    if (this.cooldown > 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + amount, 0, 5);
    this.heat = 0;
    this.searchTimer = 0;
    if (this.wanted > before) {
      this.game.hud.setWanted(this.wanted);
      this.game.audio.siren();
      if (reason) this.game.hud.toast(reason, 'warn');
      this.game.hud.setObjective(this.wanted >= 3 ? 'LOSE THE COPS — BREAK LINE OF SIGHT' : '');
      this.spawnUnits();
    }
  }

  clearWanted(reward = 0) {
    if (this.wanted === 0) return;
    this.wanted = 0;
    this.heat = 0;
    for (const u of this.units) { this.copGroup.remove(u.visual.group); u.visual.dispose(); }
    this.units.length = 0;
    this.clearRoadblock();
    this.game.hud.setWanted(0);
    this.game.hud.setObjective('');
    if (reward > 0) {
      this.game.progression.addMoney(reward, true);
      this.game.hud.toast(`ESCAPED — EASY MONEY $${reward}`, 'money');
      this.game.progression.data.escapes++;
    }
    this.cooldown = 18;
  }

  _makeUnit(x, z, heading) {
    const def = CAR_BY_ID['sedan_rhein'];
    const mods = defaultMods(def);
    mods.paintColor = Math.random() < 0.5 ? '#141821' : '#1c2430';
    mods.finish = 0;
    mods.tint = 2;
    mods.rims = 1;
    const veh = new Vehicle(def, mods, { transmission: 'auto', assists: true });
    // cops are a bit faster than traffic
    veh.reset(x, z, heading);
    const visual = new CarVisual(def, mods, { quality: this.game.qualityName });
    // light bar
    const bar = new THREE.Group();
    const geoR = new THREE.BoxGeometry(0.34, 0.14, 0.42);
    const matR = new THREE.MeshBasicMaterial({ color: '#ff2b2b', toneMapped: false });
    const matB = new THREE.MeshBasicMaterial({ color: '#3b7bff', toneMapped: false });
    const r = new THREE.Mesh(geoR, matR); r.position.set(-0.05, 1.42, 0.22);
    const b = new THREE.Mesh(geoR, matB); b.position.set(-0.05, 1.42, -0.22);
    bar.add(r, b);
    visual.group.add(bar);
    const glowR = new THREE.PointLight('#ff2b2b', 0, 16, 2); glowR.position.set(0, 1.5, 0);
    const glowB = new THREE.PointLight('#3b7bff', 0, 16, 2); glowB.position.set(0, 1.5, 0);
    // one shared light per unit is cheaper
    const flash = new THREE.PointLight('#ff2b2b', 0, 20, 2);
    flash.position.set(0, 1.8, 0);
    visual.group.add(flash);
    this.game.scene.add(visual.group);
    visual.setLights(true);
    return {
      vehicle: veh, visual, flash, bar, matR, matB,
      state: 'pursue', stuck: 0, reverse: 0, offset: new RNG(Math.random() * 1e9).range(-4, 4),
      life: 0,
    };
  }

  spawnUnits() {
    const target = this.maxUnits;
    const p = this.game.playerVehicle;
    if (!p || this.game.race?.active) return;   // no spawns during events
    while (this.units.length < target) {
      // spawn behind the player, on the nearest road or just in the air-free spot
      let best = null;
      for (let tries = 0; tries < 18; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = 90 + Math.random() * 80;
        const x = p.x + Math.cos(a) * d;
        const z = p.z + Math.sin(a) * d;
        if (Math.abs(x) > 480 || Math.abs(z) > 480) continue;
        const heading = a + Math.PI;
        best = { x, z, heading };
        break;
      }
      if (!best) break;
      const u = this._makeUnit(best.x, best.z, best.heading);
      this.units.push(u);
    }
  }

  spawnRoadblock(px, pz, heading) {
    this.clearRoadblock();
    const grp = new THREE.Group();
    this.game.scene.add(grp);
    const cars = [];
    for (let i = -1; i <= 1; i++) {
      const offX = Math.sin(heading) * i * 5.6;
      const offZ = Math.cos(heading) * i * 5.6;
      const ahead = 120;
      const x = px + Math.cos(heading) * ahead + offX;
      const z = pz - Math.sin(heading) * ahead + offZ;
      const def = CAR_BY_ID['sedan_rhein'];
      const mods = defaultMods(def);
      mods.paintColor = '#12161d';
      const visual = new CarVisual(def, mods, { quality: this.game.qualityName });
      visual.group.position.set(x, 0, z);
      visual.group.rotation.y = heading + Math.PI / 2;
      visual.setLights(true);
      grp.add(visual.group);
      cars.push({ visual, x, z, w: def.body.length, d: def.body.width });
      this.game.city.collider(x - 2.6, x + 2.6, z - 2.2, z + 2.2, 1.6, 'police');
    }
    // cones + flares
    for (let i = 0; i < 10; i++) {
      const t = (i / 10 - 0.5) * 22;
      const x = px + Math.cos(heading) * ahead + Math.sin(heading) * t;
      const z = pz - Math.sin(heading) * ahead + Math.cos(heading) * t;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 6),
        new THREE.MeshBasicMaterial({ color: '#ff7a1a', toneMapped: false }));
      cone.position.set(x, 0.35, z);
      grp.add(cone);
      const light = new THREE.PointLight('#ff5a10', 1.4, 8, 2);
      light.position.set(x, 0.7, z);
      grp.add(light);
    }
    this.roadblock = { group: grp, cars, created: 0 };
    this.game.hud.toast('ROADBLOCK AHEAD', 'warn');
  }

  clearRoadblock() {
    if (!this.roadblock) return;
    this.game.scene.remove(this.roadblock.group);
    this.roadblock.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    // remove the colliders we added on roads
    for (const c of this.game.city.colliderList) if (c.kind === 'police') c.disabled = true;
    this.roadblock = null;
  }

  update(dt, player) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!player) return;
    const hud = this.game.hud;

    if (this.wanted === 0) {
      if (this.units.length) {
        for (const u of this.units) this.copGroup.remove(u.visual.group);
        this.units.length = 0;
      }
      return;
    }

    this.sirenTimer += dt;
    if (this.sirenTimer > 4.5) { this.sirenTimer = 0; this.game.audio.siren(); }

    // maintain unit count
    if (this.units.length < this.maxUnits) {
      this._spawnTimer = (this._spawnTimer || 0) + dt;
      if (this._spawnTimer > 2.5) { this._spawnTimer = 0; this.spawnUnits(); }
    }

    // roadblock at wanted >= 3
    if (this.wanted >= 3 && !this.roadblock) {
      this.roadblockTimer += dt;
      if (this.roadblockTimer > 22) {
        this.roadblockTimer = 0;
        const v = player;
        if (Math.abs(v.longSpeed) > 12) this.spawnRoadblock(v.x, v.z, v.heading);
      }
    }
    if (this.roadblock) {
      this.roadblock.created += dt;
      if (this.roadblock.created > 30) this.clearRoadblock();
    }

    let nearest = Infinity;
    let contact = false;
    for (const u of this.units) {
      const v = u.vehicle;
      const d = Math.hypot(v.x - player.x, v.z - player.z);
      nearest = Math.min(nearest, d);
      u.life += dt;
      // despawn and respawn if very far
      if (d > 320) {
        const a = Math.atan2(player.z - v.z, player.x - v.x);
        const nx = player.x + Math.cos(a + Math.PI + (Math.random() - 0.5)) * 120;
        const nz = player.z + Math.sin(a + Math.PI + (Math.random() - 0.5)) * 120;
        v.reset(clamp(nx, -470, 470), clamp(nz, -470, 470), a);
        continue;
      }
      this._driveCop(u, dt, player, d);
      // update visuals
      u.visual.group.position.set(v.x, 0.16 + (v.y || 0), v.z);
      u.visual.group.rotation.y = v.heading;
      u.visual.update(dt, {
        steer: clamp(v.steerAngle * 1.8, -0.75, 0.75),
        wheelDelta: (v.longSpeed / v.def.body.wheelR) * dt,
        suspension: v.suspension, pitch: v.pitch, roll: v.roll,
      });
      u.visual.setBrake(v.braking > 0.1 ? 1 : 0);
      // flashing light bar
      const flash = Math.sin(performance.now() * 0.012) > 0;
      u.matR.color.setHex(flash ? '#ff2b2b' : '#3b7bff' === '#3b7bff' ? '#3b7bff' : '#ff2b2b');
      u.matB.color.setHex(flash ? '#3b7bff' : '#ff2b2b');
      u.flash.color.setHex(flash ? '#ff2b2b' : '#3b7bff');
      u.flash.intensity = d < 90 ? 3.2 : 0;
      if (d < 14) contact = true;
    }

    // escape logic: out of sight long enough
    if (nearest > 65 || this.game.playerInCar === false) {
      this.heat += dt * (nearest > 140 ? 0.30 : 0.16);
    } else if (nearest < 42) {
      this.heat = Math.max(0, this.heat - dt * 0.5);
    }
    if (this.heat >= 1) {
      const reward = 150 + this.wanted * 120;
      this.clearWanted(reward);
    }
    hud.setHeat(this.wanted, this.heat);

    // busted: cops close and the player is slow
    if (contact && Math.abs(player.longSpeed) < 3.2 && !this.game.race.active) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 2.6) {
        this.bustedTimer = 0;
        this._bust();
      }
    } else this.bustedTimer = Math.max(0, this.bustedTimer - dt * 1.6);

    // cops bumping the player pushes them a little
    if (contact) this.game.audio.sirenTick?.(dt);
  }

  _driveCop(u, dt, player, dist) {
    const v = u.vehicle;
    if (u.reverse > 0) {
      u.reverse -= dt;
      v.update(dt, { throttle: -0.8, brake: 0, steer: 0.4, handbrake: 0 }, this.game.city);
      return;
    }
    // aim at the player with a small lateral offset (PIT-ish but safe)
    const lead = clamp(dist / 26, 0, 1);
    const tx = player.x + player.vx * lead * 0.55 + u.offset;
    const tz = player.z + player.vz * lead * 0.55 + u.offset;
    const desired = Math.atan2(-(tz - v.z), tx - v.x);
    let diff = wrapAngle(desired - v.heading);
    // avoid running into walls: nudge if blocked
    // steer > 0 = right (controller convention), +diff means pointing left
    const steer = clamp(-diff * 2.2, -1, 1);
    const speed = v.speedKmh;
    let want = dist > 80 ? 100 : dist > 30 ? 78 : 52;
    want *= 1 + this.wanted * 0.07;
    let throttle = speed < want - 8 ? 1 : speed < want ? 0.4 : 0;
    let brake = speed > want + 14 ? 0.8 : 0;
    if (Math.abs(diff) > 0.9) throttle *= 0.4;
    if (v.speedKmh < 3 && throttle > 0.4) {
      u.stuck += dt;
      if (u.stuck > 1.4) { u.reverse = 1.0; u.stuck = 0; }
    } else u.stuck = Math.max(0, u.stuck - dt * 0.4);
    v.transmission = 'auto';
    v.update(dt, { throttle: throttle - brake, brake, steer, handbrake: 0 }, this.game.city);
  }

  _bust() {
    const prog = this.game.progression;
    const fine = Math.min(prog.money, 300 + this.wanted * 250);
    prog.addMoney(-fine, true);
    prog.data.busts++;
    prog.save();
    this.game.hud.toast(`BUSTED — FINE $${fine}`, 'warn');
    this.clearWanted(0);
    this.wanted = 0;
    this.cooldown = 25;
    this.game.hud.setWanted(0);
    this.game.bustPlayer();
  }

  get dangerLevel() { return this.wanted; }
}
