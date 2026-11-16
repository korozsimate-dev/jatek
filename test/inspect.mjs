// Orthographic inspection renders of a car — side, front, top, and a
// wheel-highlight pass. Built to verify geometry fixes without a browser.
//   node test/inspect.mjs side|front|top|wheel|player [carId]
// writes out/inspect-<view>.png
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';

// ---- DOM stub (canvas 2D only; no textures are sampled here) --------------
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
  fillText() {}, putImageData() {}, setTransform() {}, clip() {},
});
global.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 };
global.document = {
  createElement: (t) => (t === 'canvas' ? { width: 64, height: 64, style: {}, getContext: c2d } : { style: {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
};

// ---- reuse the rasteriser from preview.mjs -------------------------------
const { collectMeshes, renderObjects, writePNG } = await import('./preview.mjs');

const view = process.argv[2] || 'side';
const carId = process.argv[3] || 'coupe_zen';
const { CAR_BY_ID, defaultMods } = await import('../src/data/cars.js');

const W = 1200, H = 500;
const scene = new THREE.Scene();

if (view === 'player') {
  const { Player } = await import('../src/game/player.js');
  const p = new Player(scene);
  p.place(0, 0, 0);
  p.speed = 2.2; p.anim.phase = 0.9;
  p.update(1 / 60, { down: () => false, axis: () => 0 }, null, 0);
} else {
  const { CarVisual } = await import('../src/world/carMesh.js');
  const def = CAR_BY_ID[carId] || CAR_BY_ID.coupe_zen;
  const mods = defaultMods(def);
  mods.rims = 2; mods.rimSize = 2;
  const car = new CarVisual(def, mods, { quality: 'high' });
  car.group.position.set(0, 0, 0);
  scene.add(car.group);
  if (view === 'wheel') {
    // hide the body so wheel placement is readable; tint tyres red
    car.bodyGroup.visible = false;
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material = o.material.clone();
      if (o.isMesh && o.material && o.material.color) o.material.color.set('#ff3b30');
    });
  }
  if (view === 'front' || view === 'top') car.update(0.016, { steer: 0.0, wheelDelta: 0, suspension: [0, 0, 0, 0] });
}

const meshes = collectMeshes(scene);
const box = new THREE.Box3();
for (const m of meshes) box.expandByObject(m.mesh);
const c = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
const zoom = Number(process.env.ZOOM || 0.62);
const span = Math.max(size.x, size.y, size.z) * zoom;

// orthographic so proportions are readable (no perspective distortion)
const aspect = W / H;
const cam = new THREE.OrthographicCamera(-span * aspect, span * aspect, span, -span, 0.05, 400);
const d = 60;
if (view === 'side' || view === 'wheel') cam.position.set(c.x, c.y, c.z + d);
else if (view === 'front') cam.position.set(c.x + d, c.y, c.z);
else if (view === 'top') cam.position.set(c.x, c.y + d, c.z);
else cam.position.set(c.x + d * 0.7, c.y + d * 0.45, c.z + d * 0.7);
cam.lookAt(c);
cam.updateMatrixWorld(true);

const raster = renderObjects(meshes, cam, W, H);
const out = `out/inspect-${view}.png`;
writePNG(out, W, H, raster.buffer);
console.log(`${view}: ${meshes.length} meshes, bbox ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} -> ${out}`);
