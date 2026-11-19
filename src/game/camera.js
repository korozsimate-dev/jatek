// ============================================================
// Camera rig — third-person orbit while walking, chase camera while
// driving (with first-person / hood / bumper modes and shake).
// ============================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, lerp, wrapAngle } from '../core/util.js';

export const DRIVE_CAMS = ['CHASE', 'CLOSE CHASE', 'HOOD', 'FIRST PERSON', 'CINEMATIC'];

export class CameraRig {
  constructor(camera, input, settings) {
    this.camera = camera;
    this.input = input;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = 0.16;
    this.distance = settings.get('camDist') || 6.6;
    this.currentDistance = this.distance;
    this.mode = 0;
    this.modeName = 'CHASE';
    this.shake = 0;
    this.shakeOffset = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.modeIndex = 0;
    this.freeLook = false;
    this.transition = 0;
    this.smoothPos = new THREE.Vector3(0, 6, 20);
    this.smoothLook = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._fov = settings.get('fov') || 70;
    this.zoomHeld = false;
  }

  cycleCamera() {
    this.modeIndex = (this.modeIndex + 1) % DRIVE_CAMS.length;
    this.modeName = DRIVE_CAMS[this.modeIndex];
    return this.modeName;
  }

  addShake(amount) { this.shake = Math.min(1.4, this.shake + amount); }

  updateMouse() {
    const sens = (this.settings.get('sensitivity') ?? 1) * 0.0022;
    const inv = this.settings.get('invertY') ? -1 : 1;
    if (this.freeLook || true) {
      this.yaw -= this.input.mouse.dx * sens;
      this.pitch += this.input.mouse.dy * sens * inv;
      this.pitch = clamp(this.pitch, -0.35, 1.15);
    }
  }

  updateWalk(dt, player) {
    this.updateMouse();
    const dist = this.distance * (this.zoomHeld ? 0.62 : 1);
    this.currentDistance = damp(this.currentDistance, dist, 8, dt);
    const focX = player.x, focZ = player.z;
    const focusY = 1.55 + (player.y || 0);
    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch) + 0.12,
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize().multiplyScalar(this.currentDistance);
    const want = new THREE.Vector3(focX + back.x, focusY + back.y, focZ + back.z);
    want.y = Math.max(0.5, want.y);
    this.smoothPos.x = damp(this.smoothPos.x, want.x, 11, dt);
    this.smoothPos.y = damp(this.smoothPos.y, want.y, 11, dt);
    this.smoothPos.z = damp(this.smoothPos.z, want.z, 11, dt);
    this.smoothLook.x = damp(this.smoothLook.x, focX, 14, dt);
    this.smoothLook.y = damp(this.smoothLook.y, focusY, 14, dt);
    this.smoothLook.z = damp(this.smoothLook.z, focZ, 14, dt);
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
    this.applyShake(dt);
    this.camera.fov = damp(this.camera.fov, this._fov, 6, dt);
    this.camera.updateProjectionMatrix();
    return { yaw: this.yaw };
  }

  // Convention: `yaw` is the direction the car FACES. The chase camera is
  // placed at -forward, so "yaw == heading" is what keeps it behind the car.
  static chaseYaw(heading) { return heading; }

  updateDrive(dt, vehicle) {
    this.updateMouse();
    // auto-recentre behind the car after a moment of no mouse input
    if (Math.abs(this.input.mouse.dx) < 0.5) {
      const wanted = CameraRig.chaseYaw(vehicle.heading);
      let d = wrapAngle(wanted - this.yaw);
      // only auto re-centre when the car is moving forward
      if (vehicle.longSpeed > 3) {
        this.yaw += d * Math.min(1, dt * 1.35);
      }
    }
    const speedK = Math.min(1, Math.abs(vehicle.longSpeed) / 42);
    const mode = this.modeIndex;
    const settingsDist = this.distance;
    let dist = settingsDist;
    let height = 2.35;
    let lookAhead = 4.5;
    let fov = this._fov + speedK * 11;

    if (mode === 0) { dist = settingsDist + speedK * 1.9; height = 2.35; lookAhead = 5.0 + speedK * 4; }
    else if (mode === 1) { dist = settingsDist * 0.66; height = 1.95; lookAhead = 4.0; fov = this._fov + 6 + speedK * 12; }
    else if (mode === 2) { dist = 0; height = 1.25; lookAhead = 8; fov = this._fov + 4 + speedK * 10; }
    else if (mode === 3) { dist = 0; height = 1.18; lookAhead = 10; fov = this._fov + 3 + speedK * 10; }
    else { dist = 9.5; height = 3.4; lookAhead = 3.0; fov = this._fov - 4 + speedK * 6; }

    this.currentDistance = damp(this.currentDistance, dist, 6, dt);

    const carPos = this._tmp.set(vehicle.x, vehicle.y || 0, vehicle.z);
    const fwdX = Math.cos(vehicle.heading), fwdZ = -Math.sin(vehicle.heading);

    // 2 = HOOD, 3 = FIRST PERSON. Cinematic (4) is a chase camera.
    if (mode === 2 || mode === 3) {
      // hood / first person: rigidly attached, small lag
      const eyeY = mode === 3 ? CONFIG.player.eyeHeight - 0.28 : 1.32;
      const px = carPos.x + fwdX * (mode === 3 ? 0.1 : 1.35);
      const pz = carPos.z + fwdZ * (mode === 3 ? 0.1 : 1.35);
      const want = new THREE.Vector3(px, carPos.y + eyeY - (vehicle.pitch || 0) * 0.4, pz);
      this.smoothPos.x = damp(this.smoothPos.x, want.x, 24, dt);
      this.smoothPos.y = damp(this.smoothPos.y, want.y, 24, dt);
      this.smoothPos.z = damp(this.smoothPos.z, want.z, 24, dt);
      this.smoothLook.set(px + fwdX * lookAhead, carPos.y + eyeY + Math.sin(-this.pitch) * 4, pz + fwdZ * lookAhead);
      this.camera.position.copy(this.smoothPos);
      // add a touch of the car body roll
      this.camera.up.set(Math.sin(-(vehicle.roll || 0) * 0.6), 1, 0).normalize();
      this.camera.lookAt(this.smoothLook);
      this.camera.up.set(0, 1, 0);
    } else {
      // sit behind the car: -forward, where forward = (cos yaw, -sin yaw)
      const back = new THREE.Vector3(
        -Math.cos(this.yaw) * Math.cos(this.pitch),
        Math.sin(Math.max(this.pitch, 0.06)) + 0.30,
        Math.sin(this.yaw) * Math.cos(this.pitch)
      ).normalize().multiplyScalar(this.currentDistance);
      const want = new THREE.Vector3(
        carPos.x + back.x,
        carPos.y + Math.max(0.55, height * 0.1 + back.y + 1.1),
        carPos.z + back.z
      );
      // keep the camera out of buildings
      this._avoidBuildings(want, carPos);
      const lag = mode === 4 ? 3.2 : 8.5;
      this.smoothPos.x = damp(this.smoothPos.x, want.x, lag, dt);
      this.smoothPos.y = damp(this.smoothPos.y, want.y, lag * 1.15, dt);
      this.smoothPos.z = damp(this.smoothPos.z, want.z, lag, dt);
      const lookTargetX = carPos.x + fwdX * lookAhead * 0.4;
      const lookTargetZ = carPos.z + fwdZ * lookAhead * 0.4;
      const rate = mode === 4 ? 3.0 : 12;
      this.smoothLook.x = damp(this.smoothLook.x, lookTargetX, rate, dt);
      this.smoothLook.y = damp(this.smoothLook.y, carPos.y + 1.05, rate, dt);
      this.smoothLook.z = damp(this.smoothLook.z, lookTargetZ, rate, dt);
      this.camera.position.copy(this.smoothPos);
      this.camera.lookAt(this.smoothLook);
    }
    // rolling body-roll tilt
    const roll = -(vehicle.roll || 0) * 0.22;
    this.camera.rotateZ(roll);
    this.applyShake(dt);
    this.camera.fov = damp(this.camera.fov, fov, 3.5, dt);
    this.camera.updateProjectionMatrix();
    return { yaw: this.yaw };
  }

  _avoidBuildings(want, carPos) {
    // cheap: if the camera is far from the car and near a collider, pull it in
    const dx = want.x - carPos.x, dz = want.z - carPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = carPos.x + dx * t, pz = carPos.z + dz * t;
      if (this.colliderQuery && this.colliderQuery(px, pz, 0.8)) {
        const t2 = Math.max(0.15, (i - 1) / steps);
        want.x = carPos.x + dx * t2;
        want.z = carPos.z + dz * t2;
        return;
      }
    }
  }

  applyShake(dt) {
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.34;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.28;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.34;
      this.shake *= Math.exp(-dt * 5.5);
      if (this.shake < 0.002) this.shake = 0;
    }
  }

  setFov(f) { this._fov = f; }
  setDistance(d) { this.distance = d; }
}
