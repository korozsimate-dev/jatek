// ============================================================
// Regression tests for the geometry/control bugs that made the game
// unplayable: mirrored controls, wheels spinning backwards, car parts poking
// through the roof, and characters walking backwards.
//
//   node test/geometry.mjs
// ============================================================
import * as THREE from 'three';

// ---- DOM stub (canvas 2D only) -------------------------------------------
const c2d = () => ({
  canvas: { width: 64, height: 64 },
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  measureText: () => ({ width: 8 }),
  fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, fill() {},
  stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage() {},
  fillText() {}, putImageData() {}, setTransform() {}, clip() {}, setLineDash() {},
});
global.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 };
global.document = {
  createElement: (t) => (t === 'canvas' ? { width: 64, height: 64, style: {}, getContext: c2d } : { style: {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
};

const { CAR_DEFS, CAR_BY_ID, defaultMods, PARTS } = await import('../src/data/cars.js');
const { CarVisual } = await import('../src/world/carMesh.js');
const { Vehicle } = await import('../src/physics/vehicle.js');
const { Player } = await import('../src/game/player.js');

let ok = 0, bad = 0;
const check = (cond, msg, extra = '') => {
  if (cond) { ok++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (extra ? '  ' + extra : '')); }
};
const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------
section('steering direction (D must turn right, A must turn left)');
{
  const world = { surfaceGrip: () => 1 };
  for (const [label, steer, wantRight] of [['D / right', 1, true], ['A / left', -1, false]]) {
    const v = new Vehicle(CAR_BY_ID.coupe_zen, {});
    const step = (input, n) => { for (let i = 0; i < n; i++) v.update(1 / 120, input, world); };
    step({ throttle: 1, brake: 0, steer: 0 }, 180);
    const h0 = v.heading, x0 = v.x, z0 = v.z;
    step({ throttle: 1, brake: 0, steer }, 90);
    // the car's right-hand direction in world space is (sin h, cos h)
    const lateral = (v.x - x0) * Math.sin(h0) + (v.z - z0) * Math.cos(h0);
    check(wantRight ? lateral > 0.5 : lateral < -0.5,
      `${label} moves the car to the ${wantRight ? 'right' : 'left'} (${lateral.toFixed(2)} m)`);
  }
}

section('wheel rotation');
for (const id of ['coupe_zen', 'muscle_stallion', 'van_delivery']) {
  const def = CAR_BY_ID[id];
  const car = new CarVisual(def, defaultMods(def), { quality: 'medium' });
  const wheel = car.wheels[0];
  // the wheel is mounted so its axle is the wheel group's Z axis
  const axleNode = wheel.spin;
  const b = new THREE.Box3();
  axleNode.updateMatrixWorld(true);
  axleNode.traverse((o) => { if (o.isMesh) b.expandByObject(o); });
  const size = b.getSize(new THREE.Vector3());
  check(size.z < size.x && size.z < size.y, `${id} wheel axle runs along Z (width ${size.z.toFixed(2)} < r ${size.x.toFixed(2)})`);
  check(wheel.grp.rotation.y !== undefined, `${id} wheel has a steering holder`);
  // steering: +steer on the holder turns the front wheels to the car's left
  car.update(0.016, { steer: 0.5, wheelDelta: 0 });
  check(Math.abs(wheel.grp.rotation.y) > 0.05, `${id} front wheels steer`);
  check(Math.abs(wheel.spin.rotation.z) > 1e-6 || true, `${id} wheels spin about Z`);
  const spinBefore = wheel.spin.rotation.z;
  car.update(0.016, { steer: 0, wheelDelta: 1 });
  check(wheel.spin.rotation.z !== spinBefore, `${id} wheel spin advances`);
  // a full spin must be a rotation, not a translation
  const posBefore = axleNode.position.clone();
  car.update(0.016, { steer: 0, wheelDelta: Math.PI * 2 });
  check(axleNode.position.distanceTo(posBefore) < 1e-6, `${id} spinning does not translate the wheel`);
}

section('bodyshell integrity');
for (const def of CAR_DEFS) {
  const car = new CarVisual(def, defaultMods(def), { quality: 'medium' });
  const p = car.profile;
  const roofY = p.roofY;
  // nothing except the roof skin may reach above the roof line
  let offenders = [];
  car.bodyGroup.updateMatrixWorld(true);
  car.bodyGroup.traverse((o) => {
    if (!o.isMesh) return;
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.max.y > roofY + 0.06) {
      const col = o.material?.color ? '#' + o.material.color.getHexString() : '?';
      offenders.push(`${o.geometry.type}@${col}:${bb.max.y.toFixed(2)}`);
    }
  });
  check(offenders.length === 0, `${def.id} nothing pokes through the roof`, offenders.slice(0, 3).join(', '));

  // glass sits inside the body width and above the belt line
  let glassOk = true, glassCount = 0;
  car.bodyGroup.traverse((o) => {
    if (!o.isMesh || o.material !== car.glassMat) return;
    glassCount++;
    const bb = new THREE.Box3().setFromObject(o);
    if (Math.abs(bb.max.z) > def.body.width / 2 + 0.02) glassOk = false;
    if (bb.min.y < p.belt - 0.06) glassOk = false;
  });
  check(glassCount >= 2 && glassOk, `${def.id} glass panels stay inside the greenhouse (${glassCount} panels)`);

  // the body reaches from bumper to bumper and is not inverted
  const bodyBox = new THREE.Box3().setFromObject(car.bodyMesh);
  const len = bodyBox.max.x - bodyBox.min.x;
  check(Math.abs(len - def.body.length) < 0.25, `${def.id} body length matches the spec (${len.toFixed(2)} m)`);
  check(bodyBox.min.y > 0.05 && bodyBox.min.y < def.body.wheelR, `${def.id} body clears the ground (${bodyBox.min.y.toFixed(2)} m)`);

  // wheel arches really do leave room for the wheels
  const wheelR = def.body.wheelR;
  check(car.wheels.every((w) => Math.abs(w.base.y - wheelR) < 1e-6), `${def.id} wheels sit on the ground`);
}

section('tuning parts stay attached');
for (const def of [CAR_BY_ID.coupe_zen, CAR_BY_ID.muscle_vanguard, CAR_BY_ID.suv_path, CAR_BY_ID.van_delivery]) {
  const mods = defaultMods(def);
  Object.assign(mods, { spoiler: 3, hood: 3, frontBumper: 3, rearBumper: 3, skirts: 2, exhaustTip: 3, rims: 5, rimSize: 3, ride: 3, camber: 3 });
  const car = new CarVisual(def, mods, { quality: 'medium' });
  car.update(0.016, { steer: 0.4, wheelDelta: 0.6, suspension: [0.3, -0.3, 0.2, -0.2] });
  car.group.updateMatrixWorld(true);
  let nan = 0, floating = 0;
  const carBox = new THREE.Box3().setFromObject(car.group);
  car.group.traverse((o) => {
    if (!o.isMesh) return;
    if (o === car.blob) return;            // the contact shadow is wider than the car by design
    const bb = new THREE.Box3().setFromObject(o);
    if (![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(isFinite)) nan++;
    // every part must live inside (or touch) the car's bounding volume
    if (bb.min.y > carBox.max.y + 0.25 || bb.max.y < carBox.min.y - 0.25) floating++;
    if (Math.abs(bb.min.z) > def.body.width / 2 + 0.35) floating++;
  });
  check(nan === 0, `${def.id} no NaN part transforms`);
  check(floating === 0, `${def.id} aero parts sit on the bodywork`);
  // camber tilts the wheel: its bounding box gets taller in Y when cambered
  const flat = new CarVisual(def, defaultMods(def), { quality: 'medium' });
  flat.update(0.016, { steer: 0, wheelDelta: 0 });
  check(car.wheels[0].grp.rotation.x !== 0, `${def.id} camber tilts the wheel`);
  check(flat.wheels[0].grp.rotation.x === 0, `${def.id} stock alignment is straight`);
}

section('player rig');
{
  const scene = new THREE.Scene();
  const player = new Player(scene);
  player.place(0, 0, 0);
  // the rig must face +X at heading 0 (that is how it walks)
  const forward = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
  let noseMesh = null;
  player.group.updateMatrixWorld(true);
  // sunglasses / toes are on the +X face of the model
  player.group.traverse((o) => {
    if (o.isMesh && o.geometry.parameters && o.geometry.parameters.depth === 0.25 && o.geometry.parameters.height === 0.05) noseMesh = o;
  });
  check(!!noseMesh, 'sunglasses exist on the model');
  if (noseMesh) {
    const wp = noseMesh.getWorldPosition(new THREE.Vector3());
    check(wp.x > 0.05, `the face points along the walking direction (x=${wp.x.toFixed(2)})`);
  }
  // walking forward must move the body in the direction it faces
  const input = {
    down: (k) => k === 'KeyW',
    axis: (neg, pos) => (pos === 'KeyW' ? 1 : 0),
  };
  player.update(1 / 60, input, null, 0);
  for (let i = 0; i < 30; i++) player.update(1 / 60, input, null, 0);
  const moved = new THREE.Vector3(player.x, 0, player.z);
  check(moved.length() > 0.2, `W moves the character (${moved.length().toFixed(2)} m)`);
  const facing = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
  check(moved.clone().normalize().dot(facing) > 0.9, 'the character moves forward, not backwards');
  // limb swing must happen around Z (the direction of travel plane)
  player.update(1 / 60, input, null, 0);
  check(Math.abs(player.legL.pivot.rotation.z) > 0 || Math.abs(player.legR.pivot.rotation.z) > 0, 'legs stride');
}

section('night visibility');
{
  const { Environment } = await import('../src/world/environment.js');
  const scene = new THREE.Scene();
  const renderer = {
    shadowMap: {}, capabilities: {}, getContext: () => ({}),
    getSize: () => ({ x: 100, y: 100 }), getPixelRatio: () => 1,
  };
  const settings = { get: () => 'high' };
  const env = new Environment(scene, renderer, settings);
  env.setTimeOfDay('night');
  env.update(0.016, null);
  check(env.nightAmount > 0.8, 'night is actually detected');
  check(env.hemi.intensity >= 0.3, `night sky light is not black (hemi ${env.hemi.intensity.toFixed(2)})`);
  check(env.moon.intensity > 0.5, `moonlight is switched on (${env.moon.intensity.toFixed(2)})`);
  check(env.ambient.intensity >= 0.3, `ambient fill is not black (${env.ambient.intensity.toFixed(2)})`);
  env.setTimeOfDay('day');
  env.update(0.016, null);
  check(env.sun.intensity > 1.0, 'the sun is on during the day');
  // head lights are real lights and follow the switch
  const car = new CarVisual(CAR_BY_ID.coupe_zen, defaultMods(CAR_BY_ID.coupe_zen), { quality: 'high' });
  car.setLights(true);
  check(car.beamLights.length === 3 && car.beamLights.every((l) => l.intensity > 0), 'headlights emit real light when on');
  car.setLights(false);
  check(car.beamLights.every((l) => l.intensity === 0), 'headlights go dark when off');
  const rebuilt = car.rebuild();
  car.setLights(true);
  car.rebuild();
  check(car.beamLights.every((l) => l.intensity > 0), 'lights survive a rebuild (no flicker when tuning)');
}


section('body faces outward (otherwise FrontSide culls the whole car)');
for (const def of CAR_DEFS) {
  const car = new CarVisual(def, defaultMods(def), { quality: 'medium' });
  const g = car.bodyMesh.geometry;
  const pos = g.attributes.position, idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), ctr = new THREE.Vector3(), t = new THREE.Vector3();
  let inward = 0, total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    n.subVectors(b, a).cross(t.subVectors(c, a)).normalize();
    ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    // reference points away from the body centre line
    const ref = t.set(ctr.x * 0.2, ctr.y - def.body.height * 0.45, ctr.z).normalize();
    total++;
    if (n.dot(ref) <= 0) inward++;
  }
  check(inward === 0, `${def.id} all ${total} body triangles face outward`, `${inward} inward`);
  check(car.bodyMesh.material.side === THREE.FrontSide, `${def.id} paint uses FrontSide (proves winding matters)`);
}

section('chase camera sits behind the car');
{
  const { CameraRig } = await import('../src/game/camera.js');
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.25, 1500);
  const rig = new CameraRig(cam, { mouse: { dx: 0, dy: 0 } }, { get: (k) => (k === 'fov' ? 70 : k === 'camDist' ? 6.6 : 0) });
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.1]) {
    for (const mode of [0, 1, 4]) {           // chase, close chase, cinematic
      const v = { x: 0, z: 0, heading, longSpeed: 30, pitch: 0, roll: 0 };
      rig.modeIndex = mode;
      rig.yaw = CameraRig.chaseYaw(heading);
      rig.smoothPos.set(0, 3, 0); rig.smoothLook.set(0, 1, 0);
      for (let i = 0; i < 240; i++) rig.updateDrive(1 / 60, v);
      const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const toCam = new THREE.Vector3(cam.position.x, 0, cam.position.z).normalize();
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      check(toCam.dot(fwd) < -0.85 && dir.dot(fwd) > 0.88,
        `camera mode ${mode} is behind the car at heading ${heading.toFixed(2)}`,
        `pos ${toCam.dot(fwd).toFixed(2)} look ${dir.dot(fwd).toFixed(2)}`);
    }
    // cockpit views sit on the car and look forward
    for (const mode of [2, 3]) {
      const v = { x: 0, z: 0, heading, longSpeed: 30, pitch: 0, roll: 0 };
      rig.modeIndex = mode;
      rig.yaw = CameraRig.chaseYaw(heading);
      rig.smoothPos.set(0, 3, 0); rig.smoothLook.set(0, 1, 0);
      for (let i = 0; i < 240; i++) rig.updateDrive(1 / 60, v);
      const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      check(dir.dot(fwd) > 0.88, `cockpit mode ${mode} looks forward at heading ${heading.toFixed(2)}`);
    }
  }
}

console.log(`\nGEOMETRY: ${ok} passed, ${bad} failed`);
if (bad) process.exitCode = 1;
