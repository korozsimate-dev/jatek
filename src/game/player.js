// ============================================================
// Player character on foot — articulated low-poly figure with walk,
// run, idle and enter/exit animation. Moves with simple kinematic
// collision against the city's static colliders.
//
// The figure is built from a `look` descriptor (skin / hair / clothes /
// build / hair style), so the driver customiser can rebuild it live.
// ============================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, circleBox } from '../core/util.js';
import { defaultLook, resolvedLook } from '../data/look.js';

export class Player {
  constructor(scene, look) {
    this.group = new THREE.Group();
    this.group.name = 'player';
    scene.add(this.group);
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0;
    this.speed = 0;
    this.inCar = null;
    this.anim = { phase: 0, run: 0, lean: 0, armSwing: 0, turn: 0 };
    this.radius = CONFIG.player.radius;
    this.materials = [];
    this.look = look || defaultLook();
    this.build();
  }

  // Rebuild the figure in place (used by the character customiser).
  setLook(look, opts = {}) {
    this.look = look || this.look;
    const keepHeading = this.heading;
    const keepPos = this.group.position.clone();
    this.disposeRig();
    this.build();
    this.group.position.copy(keepPos);
    this.group.rotation.y = keepHeading;
    if (opts.hideColors) for (const m of this.materials) m.color.set('#202428');
    return this;
  }

  disposeRig() {
    this.rig.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    this.rig.clear();
  }

  build() {
    const L = resolvedLook(this.look);
    this.resolved = L;
    const B = L.build;
    const skinMat = new THREE.MeshStandardMaterial({ color: L.skin, roughness: 0.72 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: L.jacket, roughness: 0.60, metalness: 0.10 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: L.pants, roughness: 0.88 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: L.shoe, roughness: 0.65 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: L.accent, emissive: new THREE.Color(L.accent), emissiveIntensity: 0.35, roughness: 0.5,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: L.hair, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#121417', roughness: 0.6, metalness: 0.2 });
    // pass 1 builds the geometry; colours are applied afterwards so both the
    // live rig and the customiser preview use exactly the same code path
    const paintAll = !!this._paintAfter;
    const unlit = (m) => { if (paintAll) m.color.set('#2a2f35'); return m; };
    this.materials = [skinMat, jacketMat, pantsMat, shoeMat, accentMat, hairMat, darkMat].map(unlit);

    const mkBox = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    // hips
    const hips = new THREE.Group(); hips.position.y = 0.92;
    hips.add(mkBox(0.34 * B.hip, 0.20, 0.24 * B.hip, pantsMat, 0, 0, 0));
    // torso
    const torso = new THREE.Group(); torso.position.y = 0.10;
    torso.add(mkBox(0.44 * B.chest, 0.56, 0.26 * B.chest, jacketMat, 0, 0.28, 0));
    // chest accent stripe
    torso.add(mkBox(0.46 * B.chest, 0.06, 0.27 * B.chest, accentMat, 0, 0.42, 0));
    // collar / open jacket front
    if (L.outfitDef.collar) {
      torso.add(mkBox(0.30 * B.chest, 0.08, 0.22 * B.chest, jacketMat, 0, 0.57, 0));
      // shirt showing in the V of the jacket
      if (L.outfitDef.shirt) torso.add(mkBox(0.12, 0.34, 0.02, new THREE.MeshStandardMaterial({ color: L.outfitDef.shirt, roughness: 0.7 }), 0, 0.38, 0.135 * B.chest));
      // zip
      torso.add(mkBox(0.02, 0.34, 0.02, accentMat, 0, 0.30, 0.132 * B.chest));
    } else if (L.outfitDef.hood) {
      // hood bunched behind the neck
      torso.add(mkBox(0.30 * B.chest, 0.14, 0.18, jacketMat, 0, 0.56, -0.10 * B.chest));
    } else {
      torso.add(mkBox(0.16 * B.chest, 0.07, 0.20 * B.chest, jacketMat, 0, 0.56, 0));
    }
    hips.add(torso);

    // head
    const head = new THREE.Group(); head.position.y = 0.62;
    head.add(mkBox(0.24, 0.26, 0.24, skinMat, 0, 0.12, 0));
    // ears
    for (const sgn of [1, -1]) head.add(mkBox(0.03, 0.07, 0.05, skinMat, sgn * 0.125, 0.12, 0));
    // hair: style-dependent
    const style = L.hairStyle;
    if (style === 1) {                        // buzz cut: thin skull cap
      head.add(mkBox(0.25, 0.05, 0.25, hairMat, 0, 0.255, 0));
    } else if (style === 2) {                 // top knot
      head.add(mkBox(0.26, 0.08, 0.26, hairMat, 0, 0.25, -0.01));
      head.add(mkBox(0.10, 0.10, 0.10, hairMat, 0, 0.34, -0.06));
    } else if (style === 3) {                 // mohawk
      head.add(mkBox(0.07, 0.16, 0.26, hairMat, 0, 0.30, 0));
    } else if (style === 4) {                 // long
      head.add(mkBox(0.27, 0.10, 0.27, hairMat, 0, 0.25, -0.01));
      head.add(mkBox(0.26, 0.30, 0.08, hairMat, 0, 0.10, -0.135));
    } else if (style === 5) {                 // bald: nothing
      head.add(mkBox(0.02, 0.02, 0.02, skinMat, 0, 0.26, 0));
    } else {                                  // faded crop (default)
      head.add(mkBox(0.26, 0.10, 0.26, hairMat, 0, 0.25, -0.005));
    }
    // sunglasses
    head.add(mkBox(0.25, 0.05, 0.03, darkMat, 0, 0.14, 0.12));
    torso.add(head);

    // arms
    const mkArm = (sgn) => {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * 0.27 * B.shoulder, 0.50, 0);
      const upper = mkBox(0.13 * B.limb, 0.30, 0.14 * B.limb, jacketMat, 0, -0.15, 0);
      pivot.add(upper);
      const lower = mkBox(0.12 * B.limb, 0.28, 0.13 * B.limb, jacketMat, 0, -0.42, 0);
      pivot.add(lower);
      // cuff accent
      pivot.add(mkBox(0.13 * B.limb, 0.03, 0.14 * B.limb, accentMat, 0, -0.545, 0));
      const hand = mkBox(0.11 * B.limb, 0.10, 0.12 * B.limb, skinMat, 0, -0.60, 0);
      pivot.add(hand);
      return pivot;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    torso.add(this.armL, this.armR);

    // legs
    const mkLeg = (sgn) => {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * 0.11 * B.hip, 0, 0);
      const thigh = mkBox(0.16 * B.limb, 0.44, 0.18 * B.limb, pantsMat, 0, -0.22, 0);
      pivot.add(thigh);
      const shin = new THREE.Group(); shin.position.y = -0.44;
      shin.add(mkBox(0.145 * B.limb, 0.42, 0.16 * B.limb, pantsMat, 0, -0.21, 0));
      // toes point along +Z: the direction the rig walks in
      const foot = mkBox(0.16 * B.limb, 0.11, 0.30, shoeMat, 0, -0.46, 0.07);
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

    // keep the rig's feet on the ground whatever the build
    this.rig.position.y = 0;
    if (paintAll) {
      skinMat.color.set(L.skin); jacketMat.color.set(L.jacket);
      pantsMat.color.set(L.pants); shoeMat.color.set(L.shoe);
      accentMat.color.set(L.accent); accentMat.emissive.set(L.accent);
      hairMat.color.set(L.hair);
    }
  }

  // The rig is modelled facing +Z (shoulders span X), so with rotation.y = h
  // its facing vector is (sin h, cos h).
  static headingFor(dx, dz) {
    return Math.atan2(dx, dz);
  }

  // A vehicle heading points along (cos h, -sin h); convert it to a rig heading.
  static fromVehicleHeading(carHeading) {
    return carHeading + Math.PI / 2;
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
      // Turn towards the movement direction at a capped angular rate, so the
      // body never crabs sideways and never snaps jarringly either.
      const maxTurn = 12 * dt;
      this.heading += clamp(d, -maxTurn, maxTurn);
      // remember the turn rate so the torso can lean into it
      this.anim.turn = clamp(d * 2.2, -1, 1);
    } else {
      this.anim.turn *= 0.85;
    }
    const step = this.speed * dt;
    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;

    // collide with city
    const r = this.radius;
    const near = colliders ? colliders.query(this.x, this.z, r + 1.2) : [];
    for (const c of near) {
      if (c.height < 0.5 || (c.baseY || 0) > 1.2) continue;
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
    // The rig faces +Z, so a stride swings the limbs about X (the shoulder /
    // hip axis) and the body banks about Z when turning.
    this.legL.pivot.rotation.x = s * 0.72 * amp;
    this.legR.pivot.rotation.x = s2 * 0.72 * amp;
    this.legL.shin.rotation.x = Math.max(0, s) * 0.9 * amp;
    this.legR.shin.rotation.x = Math.max(0, s2) * 0.9 * amp;
    this.armL.rotation.x = s2 * 0.60 * amp;
    this.armR.rotation.x = s * 0.60 * amp;
    this.torso.rotation.x = s * 0.05 * amp;
    // bank into turns so direction changes read clearly
    this.torso.rotation.z = -(this.anim.turn || 0) * 0.20 * amp;
    this.hips.rotation.z = -(this.anim.turn || 0) * 0.10 * amp;
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
