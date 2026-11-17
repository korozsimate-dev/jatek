// ============================================================
// Static geometry batching + procedural building generators.
// Everything static is merged into a handful of draw calls.
// ============================================================
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/util.js';
import * as TEX from './textures.js';

// ---------- material registry ----------------------------------------------
export const MATS = {};
export function initMaterials() {
  const st = (o) => new THREE.MeshStandardMaterial(o);
  MATS.asphalt = st({ map: TEX.asphaltTexture(), roughness: 0.92, metalness: 0.03, color: '#8e9399' });
  MATS.asphalt.map.repeat.set(30, 30);
  MATS.sidewalk = st({ map: TEX.sidewalkTexture(), roughness: 0.86, metalness: 0.04 });
  MATS.concrete = st({ map: TEX.concreteTexture(), roughness: 0.9, metalness: 0.02 });
  MATS.dirt = st({ map: TEX.dirtTexture(), roughness: 0.96, metalness: 0 });
  MATS.grass = st({ map: TEX.grassTexture(), roughness: 0.95, metalness: 0 });
  MATS.metal = st({ color: '#6a7078', roughness: 0.5, metalness: 0.75 });
  MATS.darkMetal = st({ color: '#2b3036', roughness: 0.55, metalness: 0.7 });
  MATS.rustMetal = st({ color: '#6b4a3a', roughness: 0.78, metalness: 0.5 });
  MATS.paintYellow = st({ color: '#c9b03a', roughness: 0.6, metalness: 0.2 });
  MATS.paintWhite = st({ color: '#c9ccd0', roughness: 0.7, metalness: 0.1 });
  MATS.glassDark = new THREE.MeshPhysicalMaterial({
    color: '#101820', metalness: 0.7, roughness: 0.12, clearcoat: 1, envMapIntensity: 1.2,
  });
  MATS.wood = st({ color: '#5a4632', roughness: 0.9, metalness: 0 });
  MATS.roofTile = st({ color: '#5a3a34', roughness: 0.85, metalness: 0.05 });
  MATS.roofDark = st({ color: '#2a2d31', roughness: 0.8, metalness: 0.1 });
  MATS.tire = st({ color: '#121212', roughness: 0.95, metalness: 0 });
  MATS.water = new THREE.MeshPhysicalMaterial({
    color: '#0c2233', metalness: 0.85, roughness: 0.16, transparent: true, opacity: 0.92,
    normalMap: TEX.waterNormalTexture(), normalScale: new THREE.Vector2(0.42, 0.42), envMapIntensity: 1.1,
  });
  MATS.water.normalMap.repeat.set(26, 26);
  MATS.palmTrunk = st({ color: '#5d4b34', roughness: 0.95, metalness: 0 });
  MATS.palmLeaf = st({ color: '#2f5233', roughness: 0.8, metalness: 0, side: THREE.DoubleSide });

  // facades: several seeded variants
  MATS.facades = {};
  const kinds = ['glass', 'office', 'brick', 'stucco', 'warehouse', 'neon'];
  for (const k of kinds) {
    for (let s = 1; s <= 3; s++) {
      const t = TEX.facadeTextures(k, s);
      const m = new THREE.MeshStandardMaterial({
        map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.0, roughness: k === 'glass' ? 0.35 : 0.8, metalness: k === 'glass' ? 0.55 : 0.12,
      });
      MATS.facades[`${k}${s}`] = m;
    }
  }
  MATS.neonGlow = {
    cyan: new THREE.MeshBasicMaterial({ color: '#25e0d0', toneMapped: false }),
    pink: new THREE.MeshBasicMaterial({ color: '#ff2f92', toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb300', toneMapped: false }),
    purple: new THREE.MeshBasicMaterial({ color: '#a56bff', toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false }),
    white: new THREE.MeshBasicMaterial({ color: '#e8f4ff', toneMapped: false }),
  };
  // additive halo used for lamp heads and neon spill
  MATS.lampGlow = new THREE.MeshBasicMaterial({
    color: '#ffd9a0', transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  MATS.lampHead = new THREE.MeshStandardMaterial({
    color: '#ffe2a8', emissive: new THREE.Color('#ffcf80'), emissiveIntensity: 1.4, roughness: 0.4,
  });
  MATS.trafficHousing = st({ color: '#1b1f22', roughness: 0.6, metalness: 0.5 });
  MATS.tlRed = new THREE.MeshStandardMaterial({ color: '#3a0a0a', emissive: new THREE.Color('#ff2010'), emissiveIntensity: 1.6 });
  MATS.tlGreen = new THREE.MeshStandardMaterial({ color: '#0a2a12', emissive: new THREE.Color('#25ff70'), emissiveIntensity: 1.6 });
  MATS.tlAmber = new THREE.MeshStandardMaterial({ color: '#2a2008', emissive: new THREE.Color('#ffb300'), emissiveIntensity: 0.15 });
  MATS.mountain = st({ color: '#3b3a34', roughness: 0.96, metalness: 0.02, flatShading: true });
  MATS.rock = st({ color: '#4a4740', roughness: 0.95, metalness: 0, flatShading: true });
}

// ---------- batching ------------------------------------------------------
export class GeoBatch {
  constructor() {
    this.groups = new Map(); // key -> [geometry]
    this.colliders = [];
    this.colliderId = 0;
  }
  push(key, geometry) {
    let arr = this.groups.get(key);
    if (!arr) { arr = []; this.groups.set(key, arr); }
    arr.push(geometry);
    return geometry;
  }
  collider(minX, maxX, minZ, maxZ, height = 20) {
    this.colliders.push({ id: this.colliderId++, minX, maxX, minZ, maxZ, height, disabled: false });
  }
  addColliderBox(cx, cz, w, d, rotY = 0, height = 20) {
    if (Math.abs(rotY % (Math.PI / 2)) < 0.01) {
      const hw = Math.abs(Math.cos(rotY)) > 0.5 ? w / 2 : d / 2;
      const hd = Math.abs(Math.cos(rotY)) > 0.5 ? d / 2 : w / 2;
      this.collider(cx - hw, cx + hw, cz - hd, cz + hd, height);
    } else {
      // approximate rotated box with its AABB (roads are axis aligned so this is rare)
      const r = Math.hypot(w, d) / 2;
      this.collider(cx - r, cx + r, cz - r, cz + r, height);
    }
  }
  // box helper: centre x,y,z with rotation about Y
  box(key, w, h, d, x, y, z, rotY = 0, tileW = 0, tileH = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tileW > 0) applyBoxUV(g, w, h, d, tileW, tileH);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
    return g;
  }
  boxAt(key, w, h, d, x, y, z, rotY = 0, tileW = 0, tileH = 0) {
    // y is the centre rather than the base
    const g = new THREE.BoxGeometry(w, h, d);
    if (tileW > 0) applyBoxUV(g, w, h, d, tileW, tileH);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    this.push(key, g);
    return g;
  }
  cyl(key, rTop, rBot, h, x, y, z, seg = 10, rotY = 0) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
    return g;
  }
  plane(key, w, h, x, y, z, rx = -Math.PI / 2, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    g.rotateX(rx);
    g.translate(x, y, z);
    this.push(key, g);
    return g;
  }
  build(parent, opts = {}) {
    const meshes = [];
    for (const [key, geos] of this.groups) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
      if (!merged) continue;
      for (const g of geos) if (g !== merged) g.dispose();
      const mat = resolveMat(key);
      if (!mat) { merged.dispose(); continue; }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.shadowKeys ? opts.shadowKeys.has(key) : false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.name = 'batch_' + key;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

function resolveMat(key) {
  if (key.startsWith('facade:')) { const s = key.slice(7); return MATS.facades[s]; }
  if (key.startsWith('neon:')) return MATS.neonGlow[key.slice(5)];
  if (key.startsWith('container:')) return MATS['container_' + key.slice(10)] || MATS.metal;
  return MATS[key];
}

// per-face UV scaling so facade windows keep a consistent world size
export function applyBoxUV(geo, w, h, d, tileW = 12, tileH = 32) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z ; 4 verts each
  const dims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    const su = du / tileW, sv = dv / tileH;
    for (let i = 0; i < 4; i++) {
      const i4 = (f * 4 + i) * 2;
      uv.array[i4] *= su;
      uv.array[i4 + 1] *= sv;
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// gable roof prism
export function gableRoof(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-w / 2, 0, 0);
  return g;
}

// ============================================================
//  Building generators
// ============================================================
export function buildTower(b, x, z, w, d, h, seed, kind = 'glass') {
  const r = new RNG(seed);
  const variant = 1 + (seed % 3);
  const key = `facade:${kind}${variant}`;
  // base tier
  const tiers = h > 55 ? 3 : h > 30 ? 2 : 1;
  let cw = w, cd = d, cy = 0;
  const tierH = h / tiers;
  for (let t = 0; t < tiers; t++) {
    const th = tierH * (t === tiers - 1 ? 1.15 : 1);
    b.box(key, cw, th, cd, x, cy, z, 0, 11, 30);
    b.addColliderBox(x, z, cw, cd, 0, cy + th);
    // parapet
    if (t === tiers - 1) {
      b.box('concrete', cw + 0.5, 0.55, cd + 0.5, x, cy + th, z);
      // rooftop clutter
      const rt = new THREE.Group();
      const bx = r.range(-cw * 0.22, cw * 0.22), bz = r.range(-cd * 0.22, cd * 0.22);
      b.box('darkMetal', cw * 0.28, 1.6, cd * 0.24, x + bx, cy + th + 0.5, z + bz);
      if (r.chance(0.6)) b.cyl('metal', 0.12, 0.12, r.range(4, 11), x + bx, cy + th + 2, z + bz, 6);
      if (r.chance(0.4)) {
        b.box('metal', cw * 0.7, 0.12, cd * 0.7, x, cy + th + 2.0, z);
      }
    }
    cy += th;
    cw *= 0.82; cd *= 0.82;
  }
  // ground-floor canopy
  if (r.chance(0.7)) {
    b.box('concrete', w * 0.9, 0.3, d * 0.9, x, 4.2, z);
  }
  return cy;
}

export function buildShop(b, x, z, w, d, h, seed, style) {
  const r = new RNG(seed);
  const key = style === 'neon' ? `facade:neon${1 + (seed % 3)}` : `facade:stucco${1 + (seed % 3)}`;
  b.box(key, w, h, d, x, 0, z, 0, 10, 24);
  b.addColliderBox(x, z, w, d, 0, h);
  // flat roof with parapet
  b.box('concrete', w + 0.4, 0.4, d + 0.4, x, h, z);
  // awning
  b.boxAt('darkMetal', w * 0.94, 0.14, 2.2, x, h - 1.2, z + d / 2 + 0.9);
  // neon sign band above the entrance
  const neon = ['cyan', 'pink', 'amber', 'purple', 'red'][seed % 5];
  b.boxAt(`neon:${neon}`, w * 0.72, 0.9, 0.14, x, h - 0.5, z + d / 2 + 0.08);
  // storefront glass
  b.boxAt('glassDark', w * 0.86, 2.4, 0.12, x, 1.6, z + d / 2 + 0.06);
  if (r.chance(0.5)) {
    // rooftop AC
    b.box('metal', w * 0.2, 0.8, d * 0.2, x + r.range(-w * 0.2, w * 0.2), h + 0.4, z + r.range(-d * 0.2, d * 0.2));
  }
  return h;
}

export function buildHouse(b, x, z, w, d, seed, rot = 0) {
  const r = new RNG(seed);
  const h = r.range(2.9, 3.5);
  const key = `facade:stucco${1 + (seed % 3)}`;
  b.box(key, w, h, d, x, 0, z, rot, 7, 14);
  b.addColliderBox(x, z, w, d, rot, h);
  // pitched roof
  const roofH = r.range(1.0, 1.6);
  const roof = gableRoof(w + 0.7, roofH, d + 0.6);
  roof.rotateY(rot);
  roof.translate(x, h, z);
  b.push(seed % 3 === 0 ? 'roofTile' : 'roofDark', roof);
  // porch
  b.boxAt('wood', w * 0.5, 0.22, 1.5, x, 0.9, z + d / 2 + 0.6, rot);
  b.box('paintWhite', 0.14, 2.3, 0.14, x - w * 0.24, 0.15, z + d / 2 + 1.2);
  b.box('paintWhite', 0.14, 2.3, 0.14, x + w * 0.24, 0.15, z + d / 2 + 1.2);
  // door
  b.boxAt('wood', 0.95, 2.0, 0.12, x, 1.0, z + d / 2 + 0.02, rot);
  // driveway
  b.plane('concrete', 4.4, 5.5, x + w * 0.62, 0.155, z + d / 2 + 3.2);
  // fence
  if (r.chance(0.45)) {
    for (let i = -2; i <= 2; i++) {
      b.box('wood', 0.08, 1.1, 0.08, x + i * (w / 5) - w * 0.1, 0.15, z + d / 2 + 3.4);
    }
  }
  return h + roofH;
}

export function buildWarehouse(b, x, z, w, d, h, seed) {
  const r = new RNG(seed);
  const key = `facade:warehouse${1 + (seed % 3)}`;
  b.box(key, w, h, d, x, 0, z, 0, 14, 22);
  b.addColliderBox(x, z, w, d, 0, h);
  // corrugated roof cap
  b.box('darkMetal', w + 0.6, 0.35, d + 0.6, x, h, z);
  // roller doors
  for (let i = 0; i < 3; i++) {
    const dx = x - w * 0.3 + i * (w * 0.3);
    b.boxAt('darkMetal', w * 0.16, h * 0.52, 0.16, dx, h * 0.26, z + d / 2 + 0.05);
    b.boxAt('rustMetal', w * 0.17, 0.22, 0.2, dx, h * 0.54, z + d / 2 + 0.06);
  }
  // vents
  for (let i = 0; i < 3; i++) {
    b.cyl('metal', 0.45, 0.45, 1.8, x + r.range(-w * 0.35, w * 0.35), h + 0.3, z + r.range(-d * 0.3, d * 0.3), 8);
  }
  return h;
}

export function buildContainer(b, x, z, w, d, h, seed, colorIdx) {
  const colors = ['container:0', 'container:1', 'container:2', 'container:3', 'container:4', 'container:5'];
  const key = colors[colorIdx % colors.length];
  b.box(key, w, h, d, x, 0, z, 0, 6, 2.6);
  b.addColliderBox(x, z, w, d, 0, h * 3);
}

export function buildGasStation(b, x, z, seed) {
  // canopy
  b.box('paintWhite', 20, 0.6, 13, x, 4.6, z);
  for (const sx of [-8.5, 8.5]) {
    for (const sz of [-5, 5]) {
      b.box('concrete', 0.7, 4.6, 0.7, x + sx, 0, z + sz);
      b.addColliderBox(x + sx, z + sz, 0.7, 0.7, 0, 4.6);
    }
  }
  // pumps
  for (const sx of [-4, 4]) {
    b.box('paintYellow', 1.6, 1.5, 0.9, x + sx, 0.15, z + 1);
    b.addColliderBox(x + sx, z + 1, 1.6, 0.9, 0, 2);
    b.boxAt(`neon:amber`, 1.3, 0.3, 0.06, x + sx, 1.9, z + 1.45);
  }
  // kiosk
  b.box('facade:stucco1', 9, 3.6, 7, x - 12, 0, z - 2, 0, 8, 16);
  b.addColliderBox(x - 12, z - 2, 9, 7, 0, 3.6);
  b.box('concrete', 9.4, 0.4, 7.4, x - 12, 3.6, z - 2);
  b.boxAt('neon:cyan', 6.6, 0.8, 0.12, x - 12, 3.1, z + 1.6);
  b.boxAt('glassDark', 7.6, 2.1, 0.1, x - 12, 1.6, z + 1.56);
  // canopy sign
  b.boxAt('neon:red', 8, 2.0, 0.3, x, 6.4, z - 6.4);
  b.cyl('metal', 0.18, 0.18, 3.0, x, 3.4, z - 6.4, 6);
  // price sign
  b.boxAt('paintWhite', 5, 3.4, 0.5, x + 14, 2.6, z + 8);
  b.box('concrete', 0.5, 2.6, 0.5, x + 14, 0, z + 8);
  b.boxAt('neon:red', 4.4, 0.8, 0.06, x + 14, 3.4, z + 8.28);
}

export function buildMeetLot(b, x, z, w, d, seed, name) {
  const r = new RNG(seed);
  // painted floor + cones + floodlights + graffiti wall
  b.plane('concrete', w, d, x, 0.17, z);
  // edge line paint
  for (let i = -1; i <= 1; i += 2) {
    b.plane('paintYellow', w * 0.9, 0.35, x, 0.18, z + i * d * 0.42);
  }
  // floodlights
  for (const sx of [-w * 0.42, w * 0.42]) {
    for (const sz of [-d * 0.4, d * 0.4]) {
      b.cyl('metal', 0.16, 0.2, 9, x + sx, 0.17, z + sz, 6);
      b.addColliderBox(x + sx, z + sz, 0.4, 0.4, 0, 9);
      b.boxAt('lampHead', 2.4, 0.5, 0.3, x + sx, 9.2, z + sz);
    }
  }
  // graffiti wall
  b.box('concrete', w * 1.02, 3.2, 0.6, x, 0.17, z - d / 2 - 1);
  b.addColliderBox(x, z - d / 2 - 1, w * 1.02, 0.6, 0, 3.4);
  for (let i = 0; i < 5; i++) {
    b.boxAt(`neon:${['pink', 'cyan', 'purple', 'amber', 'red'][i]}`, w * 0.12, 1.2, 0.06,
      x - w * 0.36 + i * w * 0.18, 1.9, z - d / 2 - 0.68);
  }
  // cones
  for (let i = 0; i < 10; i++) {
    const cx = x + r.range(-w * 0.4, w * 0.4), cz = z + r.range(-d * 0.35, d * 0.35);
    b.cyl('neon:amber', 0.05, 0.22, 0.7, cx, 0.17, cz, 6);
  }
}

export function buildDealership(b, x, z, w, d, seed) {
  // glass showroom
  b.box('glassDark', w, 5.2, d * 0.7, x, 0, z - d * 0.15);
  b.addColliderBox(x, z - d * 0.15, w, d * 0.7, 0, 5.2);
  b.box('paintWhite', w + 0.8, 0.7, d * 0.75, x, 5.2, z - d * 0.15);
  b.boxAt('neon:cyan', w * 0.8, 1.0, 0.16, x, 4.4, z + d * 0.2);
  // canopy
  b.box('paintWhite', w * 0.95, 0.35, 4.5, x, 4.4, z + d * 0.42);
  for (const sx of [-w * 0.4, w * 0.4]) {
    b.cyl('metal', 0.22, 0.22, 4.4, x + sx, 0, z + d * 0.42, 8);
  }
  // flag poles
  for (let i = 0; i < 4; i++) {
    b.cyl('metal', 0.07, 0.07, 7, x - w * 0.36 + i * w * 0.24, 0, z + d * 0.5, 5);
    b.boxAt(`neon:${i % 2 ? 'red' : 'white'}`, 0.06, 1.2, 1.8, x - w * 0.36 + i * w * 0.24 + 0.02, 6.2, z + d * 0.5 + 0.9);
  }
  b.plane('concrete', w * 1.1, d * 0.6, x, 0.17, z + d * 0.3);
}

export function buildTuneShop(b, x, z, w, d, seed) {
  b.box('facade:warehouse2', w, 6.5, d, x, 0, z);
  b.addColliderBox(x, z, w, d, 0, 6.5);
  b.box('darkMetal', w + 0.6, 0.4, d + 0.6, x, 6.5, z);
  // big roller door
  b.boxAt('darkMetal', w * 0.5, 4.4, 0.2, x, 2.2, z + d / 2 + 0.05);
  b.boxAt('neon:amber', w * 0.5, 0.18, 0.26, x, 4.5, z + d / 2 + 0.06);
  // sign
  b.boxAt('neon:amber', w * 0.62, 1.3, 0.2, x, 5.6, z + d / 2 + 0.1);
  b.boxAt('neon:cyan', w * 0.3, 0.3, 0.24, x, 6.4, z + d / 2 + 0.12);
  // dyno outside
  b.box('concrete', 6, 0.2, 3, x + w * 0.7, 0.17, z + d * 0.7);
}

export function buildCrane(b, x, z, seed) {
  const h = 26;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box('paintYellow', 0.5, h, 0.5, x + sx * 2, 0, z + sz * 2);
  }
  for (let i = 1; i < 8; i++) {
    b.box('paintYellow', 4.3, 0.22, 0.22, x, i * 3, z - 2);
    b.box('paintYellow', 4.3, 0.22, 0.22, x, i * 3, z + 2);
  }
  b.box('paintYellow', 4.6, 0.7, 4.6, x, h, z);
  b.box('paintYellow', 18, 0.9, 1.2, x + 4, h + 0.6, z);
  b.box('metal', 2.2, 1.6, 2.2, x - 0.5, h, z);
  b.cyl('metal', 0.08, 0.08, 9, x + 11, h - 9, z, 5);
  b.addColliderBox(x, z, 5, 5, 0, h);
}

export function buildShip(b, x, z, w, d, seed) {
  b.box('darkMetal', w, 4.6, d, x, 0, z);
  b.box('rustMetal', w * 0.12, 9, d * 0.8, x - w * 0.42, 4.6, z);
  b.box('paintWhite', w * 0.10, 7, d * 0.86, x - w * 0.40, 4.6, z);
  // containers on deck
  const r = new RNG(seed);
  for (let i = 0; i < 12; i++) {
    const cx = x + r.range(-w * 0.34, w * 0.32);
    const cz = z + r.range(-d * 0.34, d * 0.34);
    const col = ['container:1', 'container:3', 'container:4'][i % 3];
    b.box(col, 6, 2.6, 2.4, cx, 4.6 + (i % 3) * 2.6, cz, 0, 6, 2.6);
  }
  b.cyl('paintYellow', 0.5, 0.7, 4, x - w * 0.42, 13.6, z, 8);
  b.addColliderBox(x, z, w, d, 0, 6);
}

export function buildPalm(b, x, z, seed) {
  const r = new RNG(seed);
  const h = r.range(7, 12);
  const lean = r.range(-0.10, 0.10);
  // trunk (segmented)
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const g = new THREE.CylinderGeometry(0.22 - t * 0.05, 0.26 - t * 0.05, h / segs, 6);
    g.translate(x + lean * h * t * t, (h / segs) * (i + 0.5), z);
    b.push('palmTrunk', g);
  }
  const topY = h + 0.2, topX = x + lean * h;
  // fronds as thin boxes fanned out
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const len = r.range(2.6, 4.4);
    const g = new THREE.BoxGeometry(len, 0.05, 0.55);
    g.translate(len / 2, 0, 0);
    g.rotateZ(-0.35 - r.range(0, 0.3));
    g.rotateY(a);
    g.translate(topX, topY, z);
    b.push('palmLeaf', g);
  }
  b.cyl('palmTrunk', 0.5, 0.28, 0.5, topX, topY - 0.4, z, 6);
  b.addColliderBox(x, z, 0.6, 0.6, 0, 2);
}

export function buildLampPost(b, x, z, rot, lights) {
  b.cyl('darkMetal', 0.11, 0.15, 7.2, x, 0, z, 6);
  b.box('darkMetal', 0.12, 0.12, 2.0, x, 7.0, z);
  const g = new THREE.BoxGeometry(0.12, 0.12, 2.0);
  g.translate(0, 0, 0.9);
  g.rotateY(rot);
  g.translate(x, 7.0, z);
  b.push('darkMetal', g);
  const head = new THREE.BoxGeometry(0.7, 0.16, 0.36);
  head.translate(0, 0, 1.9);
  head.rotateY(rot);
  head.translate(x, 6.96, z);
  b.push('lampHead', head);
  b.addColliderBox(x, z, 0.4, 0.4, 0, 7);
  // light position in world space
  lights.push({
    x: x + Math.sin(rot) * 1.9,
    z: z + Math.cos(rot) * 1.9,
    y: 6.9,
  });
}

export function buildTrafficLight(b, x, z, rot, lightRefs) {
  b.cyl('darkMetal', 0.12, 0.16, 5.4, x, 0, z, 6);
  const arm = new THREE.BoxGeometry(0.12, 0.12, 3.4);
  arm.translate(0, 0, 1.7);
  arm.rotateY(rot);
  arm.translate(x, 5.2, z);
  b.push('darkMetal', arm);
  const hx = x + Math.sin(rot) * 3.2, hz = z + Math.cos(rot) * 3.2;
  b.boxAt('trafficHousing', 0.5, 1.4, 0.4, hx, 4.6, hz, rot);
  lightRefs.push({ x: hx, z: hz, rot });
}

// mountains: low-poly ridges for the canyon
export function buildMountain(b, x, z, r, h, seed) {
  const rng = new RNG(seed);
  const seg = 7;
  const geo = new THREE.ConeGeometry(r, h, seg, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < h / 2 - 0.01) {
      pos.setX(i, pos.getX(i) * (0.8 + rng.next() * 0.45));
      pos.setZ(i, pos.getZ(i) * (0.8 + rng.next() * 0.45));
      pos.setY(i, y + rng.range(-h * 0.06, h * 0.06));
    }
  }
  geo.computeVertexNormals();
  geo.translate(x, h / 2 - 1, z);
  b.push('mountain', geo);
  b.addColliderBox(x, z, r * 0.9, r * 0.9, 0, h);
}
