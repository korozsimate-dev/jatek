// ============================================================
// Software preview renderer — projects the game's real geometry and
// rasterises it to a PNG so the art direction can be inspected in a
// headless environment. Not used by the game itself.
//   node test/preview.mjs car   -> out/car.png
//   node test/preview.mjs city  -> out/city.png
//   node test/preview.mjs grid  -> out/cars.png
// ============================================================
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ---------- minimal DOM ----------
const canvasStub = () => {
  const mk = (w, h) => ({
    width: w || 256, height: h || 256, style: {},
    getContext: () => ({
      canvas: { width: w || 256, height: h || 256 },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createImageData: (ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4) }),
      getImageData: (x, y, ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4) }),
      measureText: () => ({ width: 10 }),
      fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, fill() {},
      stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage() {},
      fillText() {}, putImageData() {}, setTransform() {}, clip() {},
    }),
  });
  return mk(256, 256);
};
global.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 };
global.document = {
  createElement: (t) => (t === 'canvas' ? canvasStub() : { style: {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
};
global.performance = global.performance || { now: () => Date.now() };

// ---------- PNG writer ----------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}
function writePNG(file, w, h, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

// ---------- rasteriser ----------
class Raster {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.color = Buffer.alloc(w * h * 3);
    this.depth = new Float32Array(w * h).fill(Infinity);
    // vertical gradient background
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const r = Math.round(14 + 26 * (1 - t));
      const g = Math.round(18 + 34 * (1 - t));
      const b = Math.round(24 + 46 * (1 - t));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        this.color[i] = r; this.color[i + 1] = g; this.color[i + 2] = b;
      }
    }
  }
  triangle(p0, p1, p2, shade, color) {
    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));
    if (maxX < minX || maxY < minY) return;
    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (Math.abs(area) < 1e-8) return;
    const tone = (v) => 255 * Math.min(1, Math.pow(v * shade, 1 / 1.9));
    const r = tone(color.r), g = tone(color.g), b = tone(color.b);
    const inv = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((p1.x - px) * (p2.y - py) - (p2.x - px) * (p1.y - py)) * inv;
        let w1 = ((p2.x - px) * (p0.y - py) - (p0.x - px) * (p2.y - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < -0.0001 || w1 < -0.0001 || w2 < -0.0001) continue;
        const z = w0 * p0.z + w1 * p1.z + w2 * p2.z;
        const idx = y * this.w + x;
        if (z >= this.depth[idx]) continue;
        this.depth[idx] = z;
        const i3 = idx * 3;
        this.color[i3] = r;
        this.color[i3 + 1] = g;
        this.color[i3 + 2] = b;
      }
    }
  }
  get buffer() { return this.color; }
}

// ---------- mesh collection ----------
function collectMeshes(root, out = []) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    let mat = o.material;
    if (Array.isArray(mat)) mat = mat[0];
    let color = new THREE.Color(0.7, 0.7, 0.7);
    let opacity = 1;
    if (mat) {
      if (mat.color) color = mat.color.clone();
      if (mat.emissive && mat.emissiveIntensity > 0.2) color = color.clone().add(mat.emissive.clone().multiplyScalar(0.5));
      if (mat.transparent) opacity = mat.opacity ?? 1;
    }
    out.push({ mesh: o, geo: g, color, opacity, matrix: o.matrixWorld.clone(), mat });
  });
  return out;
}

function renderObjects(meshes, camera, w, h, opts = {}) {
  const raster = new Raster(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const viewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const lightDir = new THREE.Vector3(0.45, 0.86, 0.35).normalize();
  const lightDir2 = new THREE.Vector3(-0.6, 0.4, -0.5).normalize();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const n = new THREE.Vector3(), c = new THREE.Vector3();

  for (const m of meshes) {
    const geo = m.geo;
    const pos = geo.attributes.position;
    const index = geo.index;
    const count = index ? index.count : pos.count;
    const clip = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      v0.fromBufferAttribute(pos, i0).applyMatrix4(m.matrix);
      v1.fromBufferAttribute(pos, i1).applyMatrix4(m.matrix);
      v2.fromBufferAttribute(pos, i2).applyMatrix4(m.matrix);
      // face normal (world)
      n.subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
      c.copy(v0).add(v1).add(v2).multiplyScalar(1 / 3);
      const toCam = new THREE.Vector3().subVectors(camera.position, c).normalize();
      let shade = Math.abs(n.dot(lightDir)) * 0.72 + Math.abs(n.dot(lightDir2)) * 0.18;
      // fresnel-ish edge light
      shade += Math.pow(1 - Math.abs(n.dot(toCam)), 2.2) * 0.30;
      shade = Math.min(1.5, shade + 0.10);
      if (opts.backface !== false && n.dot(toCam) < 0) shade *= 0.82;

      clip[0].copy(v0).applyMatrix4(viewProj);
      clip[1].copy(v1).applyMatrix4(viewProj);
      clip[2].copy(v2).applyMatrix4(viewProj);
      let behind = false;
      for (const p of clip) if (p.z < -1.4 || p.z > 1) behind = true;
      if (behind) { m.skipped = (m.skipped||0)+1; continue; }
      m.drawn = (m.drawn || 0) + 1;
      const pts = clip.map((p) => ({ x: (p.x * 0.5 + 0.5) * w, y: (1 - (p.y * 0.5 + 0.5)) * h, z: p.z }));
      raster.triangle(pts[0], pts[1], pts[2], shade, m.color);
      if (m.opacity < 1) {
        // semi transparent surfaces get a second, lighter pass
        raster.triangle(pts[0], pts[1], pts[2], shade * 1.3, m.color.clone().multiplyScalar(0.6));
      }
    }
  }
  if (opts.debug) {
    const stats = meshes.map((m) => `${m.mesh.name || m.mesh.type}:${m.geo.attributes.position.count}v drawn=${m.drawn||0} skipped=${m.skipped||0}`);
    console.log(stats.slice(0, 16).join('\n'));
  }
  return raster;
}

// ---------- scenes ----------
async function carScene() {
  const { CAR_BY_ID, defaultMods } = await import('../src/data/cars.js');
  const { CarVisual } = await import('../src/world/carMesh.js');
  const scene = new THREE.Scene();
  const def = CAR_BY_ID[process.env.CAR || 'coupe_zen'];
  const mods = defaultMods(def);
  mods.paintColor = '#d8352a';
  mods.finish = 1;
  mods.rims = 2;
  mods.rimSize = 2;
  mods.spoiler = 2;
  mods.frontBumper = 2;
  mods.rearBumper = 2;
  mods.skirts = 2;
  mods.tint = 2;
  mods.livery = 0;
  const car = new CarVisual(def, mods, { quality: 'high' });
  car.update(0.016, { steer: 0.5, wheelDelta: 0, suspension: [0, 0, 0, 0] });
  scene.add(car.group);
  // ground plane for context
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.17, 0.18) }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camMode = process.env.VIEW || 'three';
  const camera = new THREE.PerspectiveCamera(camMode === 'side' ? 26 : 38, 1.6, 0.1, 200);
  if (camMode === 'side') camera.position.set(0.6, 1.15, 10.5);
  else if (camMode === 'front') camera.position.set(8.5, 1.8, 3.4);
  else camera.position.set(5.6, 2.5, 6.2);
  camera.lookAt(0, 0.62, 0);
  return { scene, camera, meshes: collectMeshes(scene) };
}

async function gridScene() {
  const { CAR_DEFS, defaultMods } = await import('../src/data/cars.js');
  const { CarVisual } = await import('../src/world/carMesh.js');
  const scene = new THREE.Scene();
  const colors = ['#e8eef2', '#1b2027', '#8b0f18', '#e0c72a', '#1c3f8f', '#28b7a8'];
  const cols = 3;
  CAR_DEFS.forEach((def, i) => {
    const mods = defaultMods(def);
    mods.paintColor = colors[i % colors.length];
    mods.rims = 2 + (i % 3);
    const car = new CarVisual(def, mods, { quality: 'medium' });
    const gx = (i % cols) * 6.5 - 6.5;
    const gz = Math.floor(i / cols) * 7.2;
    car.group.position.set(gx, 0, gz);
    car.group.rotation.y = 0;
    scene.add(car.group);
    // simple plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.12, 0.13, 0.15) }));
    plinth.position.set(gx, -0.06, gz);
    scene.add(plinth);
  });
  const camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 300);
  camera.position.set(0, 26, 26);
  camera.lookAt(0, 0, Math.floor(CAR_DEFS.length / cols) * 3.3);
  return { scene, camera, meshes: collectMeshes(scene) };
}

async function cityScene() {
  const THREE2 = THREE;
  const { City } = await import('../src/world/city.js');
  const { Settings } = await import('../src/core/settings.js');
  const { EVENTS } = await import('../src/world/layout.js');
  const scene = new THREE2.Scene();
  const settings = new Settings();
  const city = new City(scene, settings);
  city._events = EVENTS;
  city.build();
  const camera = new THREE2.PerspectiveCamera(48, 1.55, 1, 3000);
  camera.position.set(430, 200, 460);
  camera.lookAt(0, 0, 40);
  return { scene, camera, meshes: collectMeshes(scene) };
}

async function cockpitScene() {
  const { CAR_BY_ID, defaultMods } = await import('../src/data/cars.js');
  const { CarVisual } = await import('../src/world/carMesh.js');
  const scene = new THREE.Scene();
  const def = CAR_BY_ID['sedan_kessler'];
  const mods = defaultMods(def);
  mods.paintColor = '#14202b';
  mods.finish = 1;
  const car = new CarVisual(def, mods, { quality: 'high' });
  scene.add(car.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.13, 0.14, 0.16) }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.05, 200);
  camera.position.set(-1.2, 1.35, 7.5);
  camera.lookAt(0, 0.7, 0);
  return { scene, camera, meshes: collectMeshes(scene) };
}

const mode = process.argv[2] || 'car';
const scenes = { car: carScene, grid: gridScene, city: cityScene, rear: cockpitScene };
const fn = scenes[mode] || carScene;
const { camera, meshes } = await fn();
const W = mode === 'city' ? 1200 : 1100;
const H = mode === 'grid' ? 1000 : 700;
const t0 = Date.now();
const raster = renderObjects(meshes, camera, W, H, { debug: !!process.env.DBG });
const out = `out/${mode}.png`;
writePNG(out, W, H, raster.buffer);
console.log(`rendered ${meshes.length} mesh groups, ${W}x${H} -> ${out} in ${Date.now() - t0}ms`);
