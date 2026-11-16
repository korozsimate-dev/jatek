// ============================================================
// Player character on foot — articulated low-poly figure with walk,
// run, idle and enter/exit animation. Moves with simple kinematic
// collision against the city's static colliders.
// ============================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, circleBox } from '../core/util.js';

const SKIN = '#c99b74';
const JACKET = '#1d2833';
const JACKET_ACCENT = '#25e0d0';
const PANTS = '#262b32';
const SHOE = '#121417';

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'player';
    scene.add(this.group);
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0;
    this.speed = 0;
    this.inCar = null;
    this.anim = { phase: 0, run: 0, lean: 0, armSwing: 0 };
    this.radius = CONFIG.player.radius;
    this.materials = [];
    this.build();
  }

  build() {
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: JACKET, roughness: 0.60, metalness: 0.10 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.88 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.65 });
    const accentMat = new THREE.MeshStandardMaterial({ color: JACKET_ACCENT, emissive: new THREE.Color('#25e0d0'), emissiveIntensity: 0.35, roughness: 0.5 });
    this.materials = [skinMat, jacketMat, pantsMat, shoeMat, accentMat];

    const mkBox = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    // hips
    const hips = new THREE.Group(); hips.position.y = 0.92;
    hips.add(mkBox(0.34, 0.20, 0.24, pantsMat, 0, 0, 0));
    // torso
    const torso = new THREE.Group(); torso.position.y = 0.10;
    torso.add(mkBox(0.44, 0.56, 0.26, jacketMat, 0, 0.28, 0));
    // chest accent stripe
    torso.add(mkBox(0.46, 0.06, 0.27, accentMat, 0, 0.42, 0));
    // collar
    torso.add(mkBox(0.30, 0.08, 0.22, jacketMat, 0, 0.57, 0));
    hips.add(torso);
    // head
    const head = new THREE.Group(); head.position.y = 0.62;
    head.add(mkBox(0.24, 0.26, 0.24, skinMat, 0, 0.12, 0));
    // hair
    head.add(mkBox(0.26, 0.10, 0.26, jacketMat, 0, 0.25, 0));
    // sunglasses
    head.add(mkBox(0.03, 0.05, 0.25, shoeMat, 0.12, 0.14, 0));
    torso.add(head);
    // arms
    const mkArm = (sgn) => {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * 0.27, 0.50, 0);
      const upper = mkBox(0.13, 0.30, 0.14, jacketMat, 0, -0.15, 0);
      pivot.add(upper);
      const lower = mkBox(0.12, 0.28, 0.13, jacketMat, 0, -0.42, 0);
      pivot.add(lower);
      const hand = mkBox(0.11, 0.10, 0.12, skinMat, 0, -0.60, 0);
      pivot.add(hand);
      return pivot;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    torso.add(this.armL, this.armR);

    // legs
    const mkLeg = (sgn) => {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * 0.11, 0, 0);
      const thigh = mkBox(0.16, 0.44, 0.18, pantsMat, 0, -0.22, 0);
      pivot.add(thigh);
      const shin = new THREE.Group(); shin.position.y = -0.44;
      shin.add(mkBox(0.145, 0.42, 0.16, pantsMat, 0, -0.21, 0));
      // toes point along +X: that is the direction the rig walks in
      const foot = mkBox(0.30, 0.11, 0.16, shoeMat, 0.07, -0.46, 0);
      shin.add(foot);
      pivot.add(shin);
      return { pivot, shin };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    hips.add(this.legL.pivot, this.legR.pivot);

    this.hips = hips;
    this.torso = torso;
    this.headGroup = head;
    this.rig.add(hips);
  }

  // World-space heading for a direction vector: the rig faces (cos h, -sin h).
  static headingFor(dx, dz) {
    return Math.atan2(-dz, dx);
  }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.group.position.set(x, 0.16, z);
    this.group.rotation.y = heading;
  }

  update(dt, input, colliders, cameraYaw, camera) {
    if (this.inCar) return;
    const runKey = input.down('ShiftLeft') || input.down('ShiftRight');
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    let mx = 0, mz = 0;
    const camYaw = cameraYaw ?? 0;
    if (fwd || strafe) {
      // move relative to camera orientation
      const cf = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const cr = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
      mx = cf.x * fwd + cr.x * strafe;
      mz = cf.z * fwd + cr.z * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0.001) { mx /= len; mz /= len; }
    }
    const maxSpeed = runKey ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
    const moving = Math.abs(mx) + Math.abs(mz) > 0.01;
    const targetSpeed = moving ? maxSpeed : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (moving) {
      const targetHeading = Player.headingFor(mx, mz);
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 12);
    }
    const step = this.speed * dt;
    this.x += Math.cos(this.heading) * step;
    this.z += -Math.sin(this.heading) * step;

    // collide with city
    const r = this.radius;
    const near = colliders ? colliders.query(this.x, this.z, r + 1.2) : [];
    for (const c of near) {
      if (c.height < 0.5) continue;
      const hit = circleBox(this.x, this.z, r, c);
      if (hit) { this.x += hit.nx * hit.depth; this.z += hit.nz * hit.depth; }
    }
    // world bounds
    this.x = clamp(this.x, -505, 505);
    this.z = clamp(this.z, -505, 505);

    // animate
    this.anim.phase += dt * (this.speed > 0.1 ? 3.4 + this.speed * 1.5 : 1.2);
    this.anim.run += ((runKey && moving ? 1 : 0) - this.anim.run) * Math.min(1, dt * 6);
    const amp = Math.min(1, this.speed / 2.2) * (0.35 + this.anim.run * 0.65);
    const s = Math.sin(this.anim.phase * 2);
    const s2 = Math.sin(this.anim.phase * 2 + Math.PI);
    // limbs swing about Z, which is the axis that moves them along the walking
    // direction (X). A rotation around X would splay the legs sideways.
    this.legL.pivot.rotation.z = -s * 0.72 * amp;
    this.legR.pivot.rotation.z = -s2 * 0.72 * amp;
    this.legL.shin.rotation.z = -Math.max(0, -s) * 0.9 * amp;
    this.legR.shin.rotation.z = -Math.max(0, -s2) * 0.9 * amp;
    this.armL.rotation.z = -s2 * 0.60 * amp;
    this.armR.rotation.z = -s * 0.60 * amp;
    this.torso.rotation.z = -s * 0.06 * amp;
    this.hips.position.y = 0.92 + Math.abs(Math.sin(this.anim.phase * 2)) * 0.035 * amp;
    // idle breathing
    if (amp < 0.1) {
      this.torso.position.y = 0.10 + Math.sin(this.anim.phase * 1.2) * 0.006;
      this.headGroup.rotation.y = Math.sin(this.anim.phase * 0.35) * 0.12;
    } else {
      this.headGroup.rotation.y *= 0.9;
    }

    this.group.position.set(this.x, 0.16, this.z);
    this.group.rotation.y = this.heading;
  }

  poseForEnterCar(carGroup, dt) {
    // handled by camera tween in the game loop
  }

  setVisible(v) { this.group.visible = v; }
  dispose() {
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    this.materials.forEach((m) => m.dispose());
  }
}
