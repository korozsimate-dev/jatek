// ============================================================
// Pedestrians — instanced-ish low-poly crowd that wanders the pads.
// ============================================================
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { GRID, ROAD_HW, PAD, blockCenters } from '../world/layout.js';

const SHIRT = ['#2b3a4a', '#7a2f35', '#b8a98c', '#2f5b46', '#42485c', '#8d6a3f', '#5c2d52', '#c9c3b0'];
const PANTS = ['#22262c', '#2f3640', '#4a443a', '#1b1f24', '#3a3f4a'];
const SKIN = ['#c99b74', '#8a5c3c', '#e0bb95', '#5c3d28', '#b98a63'];

function makePedGeo(quality) {
  const g = new THREE.Group();
  const legs = new THREE.BoxGeometry(0.16, 0.78, 0.20);
  const torso = new THREE.BoxGeometry(0.42, 0.58, 0.26);
  const head = new THREE.BoxGeometry(0.24, 0.26, 0.24);
  const arm = new THREE.BoxGeometry(0.12, 0.54, 0.14);
  return { legs, torso, head, arm };
}

export class Pedestrian {
  constructor(x, z, rng, geos) {
    this.group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRT[Math.floor(rng.next() * SHIRT.length)], roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: PANTS[Math.floor(rng.next() * PANTS.length)], roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[Math.floor(rng.next() * SKIN.length)], roughness: 0.8 });
    this.legL = new THREE.Mesh(geos.legs, pants); this.legL.position.set(0, 0.39, 0.11);
    this.legR = new THREE.Mesh(geos.legs, pants); this.legR.position.set(0, 0.39, -0.11);
    this.torso = new THREE.Mesh(geos.torso, shirt); this.torso.position.set(-0.06, 1.07, 0);
    this.head = new THREE.Mesh(geos.head, skin); this.head.position.set(0, 1.5, 0);
    this.armL = new THREE.Mesh(geos.arm, shirt); this.armL.position.set(-0.04, 1.06, 0.22);
    this.armR = new THREE.Mesh(geos.arm, shirt); this.armR.position.set(-0.04, 1.06, -0.22);
    this.legL.castShadow = this.torso.castShadow = true;
    this.group.add(this.legL, this.legR, this.torso, this.head, this.armL, this.armR);
    this.group.scale.setScalar(rng.range(0.92, 1.08));
    this.x = x; this.z = z;
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = rng.range(0.7, 1.5);
    this.walkPhase = rng.range(0, 7);
    this.timer = rng.range(1, 6);
    this.homeX = x; this.homeZ = z;
    this.flinch = 0;
    this.meshes = [this.legL, this.legR, this.torso, this.head, this.armL, this.armR];
    this.materials = [shirt, pants, skin];
    this.geos = geos;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
  }

  update(dt, player) {
    // flee from fast cars
    if (player) {
      const d = Math.hypot(player.x - this.x, player.z - this.z);
      if (d < 9 && player.speed > 6) {
        this.flinch = 1;
        const a = Math.atan2(this.z - player.z, this.x - player.x);
        this.heading = Math.atan2(-Math.sin(a), Math.cos(a));
      }
    }
    if (this.flinch > 0) {
      this.flinch -= dt;
      this.x += Math.cos(this.heading) * 4.2 * dt;
      this.z += -Math.sin(this.heading) * 4.2 * dt;
      this.walkPhase += dt * 16;
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 2 + Math.random() * 7;
        this.heading += (Math.random() - 0.5) * 2.4;
        this.speed = 0.6 + Math.random() * 1.1;
        if (Math.hypot(this.x - this.homeX, this.z - this.homeZ) > 26) {
          this.heading = Math.atan2(-(this.homeZ - this.z), this.homeX - this.x);
        }
      }
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.z += -Math.sin(this.heading) * this.speed * dt;
      this.walkPhase += dt * this.speed * 5;
    }
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.legL.rotation.z = sw;
    this.legR.rotation.z = -sw;
    this.armL.rotation.z = -sw * 0.7;
    this.armR.rotation.z = sw * 0.7;
    this.group.position.set(this.x, 0.17, this.z);
    this.group.rotation.y = this.heading;
    this.group.visible = Math.abs(this.x) < 520 && Math.abs(this.z) < 520;
  }
}

export class PedestrianSystem {
  constructor(scene, settings, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'peds';
    scene.add(this.group);
    this.peds = [];
    this.geos = makePedGeo(quality);
    this.enabled = true;
  }

  count() { return this.quality === 'low' ? 18 : this.quality === 'medium' ? 34 : 52; }

  reset() {
    for (const p of this.peds) { this.group.remove(p.group); p.dispose(); }
    this.peds.length = 0;
  }

  populate(centre) {
    const rng = new RNG(9182);
    const blocks = blockCenters();
    const n = this.count();
    for (let i = 0; i < n; i++) {
      const bl = blocks[Math.floor(rng.next() * blocks.length)];
      const s = (bl.size - 6.4) / 2 - 2;
      const x = bl.cx + rng.range(-s, s);
      const z = bl.cz + rng.range(-s, s);
      if (Math.hypot(x - centre.x, z - centre.z) < 14) continue;
      const p = new Pedestrian(x, z, rng, this.geos);
      this.group.add(p.group);
      this.peds.push(p);
    }
    this.blocks = blocks;
  }

  update(dt, player, centre) {
    if (!this.enabled) return;
    for (const p of this.peds) {
      p.update(dt, player);
      // soft relocation if too far from the player
      if (Math.hypot(p.x - centre.x, p.z - centre.z) > 300) {
        const bl = this.blocks[Math.floor(Math.random() * this.blocks.length)];
        const s = (bl.size - 6.4) / 2 - 2;
        p.x = bl.cx + (Math.random() * 2 - 1) * s;
        p.z = bl.cz + (Math.random() * 2 - 1) * s;
        p.homeX = p.x; p.homeZ = p.z;
      }
    }
  }
}
