// ============================================================
// Procedural vehicle geometry.
// A vehicle is lofted from cross-sections so the silhouette reads
// as a real car, then dressed with wheels, glass, lamps, aero and
// livery decals driven by the tuning state.
// ============================================================

import * as THREE from 'three';
import { PARTS } from '../data/cars.js';
import { clamp } from '../core/util.js';


// ---------- material helpers ----------
// Procedural sky/ground studio environment used for paint reflections.
export function makeEnv(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const colors = [];
  const pos = geo.attributes.position;
  const c1 = new THREE.Color('#0b1524'); // zenith
  const c2 = new THREE.Color('#22333f'); // horizon
  const c3 = new THREE.Color('#0a0b0d'); // ground
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y > 0) tmp.copy(c2).lerp(c1, Math.pow(y, 0.6));
    else tmp.copy(c2).lerp(c3, Math.pow(-y, 0.5));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(geo, mat));
  // a couple of soft "studio lights" for highlights
  const l = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshBasicMaterial({ color: '#cfe6ff' }));
  l.position.set(0, 30, -20); l.rotation.x = Math.PI / 2.4; envScene.add(l);
  const l2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
  l2.position.set(-25, 18, 25); l2.lookAt(0, 0, 0); envScene.add(l2);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  geo.dispose(); mat.dispose();
  return rt.texture;
}

// ---------- body surfaces ------------------------------------------------
// The body is lofted from closed cross-sections along X. A section is built
// from three pieces per side so the flank has real vertical resolution (needed
// for the wheel arches to be cut cleanly):
//
//   floor corner -> rocker/flank (nearly vertical) -> shoulder
//     -> crowned top (quarter superellipse) -> mirror down the other side
//
// Ring index 0 is the floor corner on +Z; the ring closes along the flat floor.

const FLANK = 6;      // rows between the floor and the shoulder
const CROWN = 9;      // rows from the shoulder to the roof centre
const RING = (FLANK + 1 + CROWN) * 2 - 1;   // 31: floor corner both sides

function sectionRing(sec, out) {
  const { hw, yBot, yTop } = sec;
  const yShoulder = sec.shoulderY ?? yBot + (yTop - yBot) * 0.62;
  const tuck = sec.tuck ?? 0.11;          // bottom edge pulled inboard
  const nz = sec.nz ?? 5.5;               // horizontal roundness of the roof
  const ny = sec.ny ?? 2.6;               // vertical roundness of the roof
  const zBot = hw * (1 - tuck);
  const crown = sec.topCrown ?? 0;
  let i = 0;
  const put = (z, y) => { out[i * 2] = z; out[i * 2 + 1] = y; i++; };

  // ---- +Z side, bottom to roof centre ----
  const half = [];
  for (let k = 0; k <= FLANK; k++) {
    const t = k / FLANK;
    const e = t * t * (3 - 2 * t);                 // smoothstep
    const z = zBot + (hw - zBot) * e;
    const y = yBot + (yShoulder - yBot) * e;
    half.push([z, y]);
  }
  for (let k = 1; k <= CROWN; k++) {
    const t = k / CROWN;
    const a = t * Math.PI / 2;
    const z = hw * Math.pow(Math.cos(a), 2 / nz);
    const y = yShoulder + (yTop - yShoulder) * Math.pow(Math.sin(a), 2 / ny);
    half.push([z, y]);
  }
  // half runs from the floor corner up to (0, yTop)
  for (const [z, y] of half) put(z, y + crown * (1 - Math.pow(Math.abs(z) / Math.max(0.01, hw), 2)));
  // ---- mirror down the -Z side, skipping the shared roof vertex ----
  for (let k = half.length - 2; k >= 0; k--) {
    const [z, y] = half[k];
    put(-z, y + crown * (1 - Math.pow(Math.abs(z) / Math.max(0.01, hw), 2)));
  }
  return RING;
}

function loftBody(sections, def) {
  const S = sections.length;
  sectionRing(sections[0], new Float32Array(RING * 2));   // warm-up / validation
  const rings = sections.map((sec) => {
    const arr = new Float32Array(RING * 2);
    sectionRing(sec, arr);
    return arr;
  });
  const pos = [];
  const idx = [];
  const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const map = [];
  for (let s = 0; s < S; s++) {
    const row = [];
    for (let i = 0; i < RING; i++) row.push(push(sections[s].x, rings[s][i * 2 + 1], rings[s][i * 2]));
    map.push(row);
  }

  const B = def.body;
  const archR = B.wheelR * 1.10;
  const axleF = B.wheelbase / 2, axleR = -B.wheelbase / 2;
  const archCentreY = B.wheelR;
  // is the quad between these two sections and ring rows inside a wheel arch?
  const inArch = (xc, y, z) => {
    if (Math.abs(z) < 0.55 * (B.width / 2)) return false;      // only the flanks
    for (const ax of [axleF, axleR]) {
      const dx = xc - ax, dy = y - archCentreY;
      if (dx * dx + dy * dy < archR * archR) return true;
    }
    return false;
  };

  for (let s = 0; s < S - 1; s++) {
    const xc = (sections[s].x + sections[s + 1].x) / 2;
    for (let i = 0; i < RING - 1; i++) {
      const y = (rings[s][i * 2 + 1] + rings[s][i * 2 + 3]) / 2;
      const z = (rings[s][i * 2] + rings[s][i * 2 + 2]) / 2;
      if (inArch(xc, y, z)) continue;      // leave the wheel arch open
      const a = map[s][i], b = map[s][i + 1];
      const c = map[s + 1][i], d = map[s + 1][i + 1];
      // wind outward: with x increasing along +X and the ring running up the
      // +Z flank, (a, b, c) has its normal pointing away from the body
      idx.push(a, b, c, b, d, c);
    }
  }
  // flat floor (closes the underside between the two floor corners)
  for (let s = 0; s < S - 1; s++) {
    const a = map[s][0], b = map[s][RING - 1];
    const c = map[s + 1][0], d = map[s + 1][RING - 1];
    idx.push(a, c, b, b, c, d);   // floor faces down
  }
  // end caps
  const capF = push(sections[0].x, (sections[0].yBot + sections[0].yTop) / 2, 0);
  for (let i = 0; i < RING - 1; i++) idx.push(capF, map[0][i + 1], map[0][i]);
  const capR = push(sections[S - 1].x, (sections[S - 1].yBot + sections[S - 1].yTop) / 2, 0);
  for (let i = 0; i < RING - 1; i++) idx.push(capR, map[S - 1][i], map[S - 1][i + 1]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = [];
  const L = Math.max(1, B.length), H = Math.max(0.5, B.height);
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / L + 0.5, pos[i + 1] / H);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Half-annulus flare that lines each wheel opening, so the cut edge reads as a
// rolled fender lip instead of a hole.
function archLipGeometry(def) {
  const B = def.body;
  const r0 = B.wheelR * 1.02;
  const r1 = B.wheelR * 1.16;
  const depth = B.wheelW * 0.55;
  const steps = 10;
  const shape = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI * 0.06 + (i / steps) * Math.PI * 1.12;
    const x = Math.cos(a) * r0, y = Math.sin(a) * r0;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -Math.PI * 0.06 + (i / steps) * Math.PI * 1.12;
    shape.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, B.wheelR, -depth / 2);
  return geo;
}

// ---------- livery textures ----------
const liveryCache = new Map();
function liveryTexture(kind) {
  if (!kind) return null;
  if (liveryCache.has(kind)) return liveryCache.get(kind);
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const dark = '#14171a';
  if (kind === 1) {
    // twin racing stripes running the length of the car (bands in v)
    g.fillStyle = dark;
    g.fillRect(0, H * 0.20, W, H * 0.07);
    g.fillRect(0, H * 0.285, W, H * 0.07);
  } else if (kind === 2) {
    // kanji-ish decals on the side band (v ~0.5)
    g.fillStyle = dark;
    g.font = 'bold 54px serif';
    g.fillText('走', 70, H * 0.58);
    g.fillText('夜', 250, H * 0.62);
    g.fillStyle = '#9b1c26';
    g.fillText('速', 390, H * 0.56);
    g.strokeStyle = dark; g.lineWidth = 5;
    g.beginPath(); g.moveTo(20, H * 0.44); g.lineTo(150, H * 0.40); g.stroke();
  } else if (kind === 3) {
    // tribal flames along the flanks / hood
    g.fillStyle = dark;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 100, H * 0.52);
      g.bezierCurveTo(i * 100 + 40, H * 0.30, i * 100 + 80, H * 0.62, i * 100 + 130, H * 0.44);
      g.bezierCurveTo(i * 100 + 90, H * 0.66, i * 100 + 50, H * 0.44, i * 100, H * 0.52);
      g.fill();
    }
  } else if (kind === 4) {
    // sponsor wrap
    g.fillStyle = '#1b1f24'; g.fillRect(0, H * 0.16, W, H * 0.10);
    g.fillStyle = '#c8102e'; g.fillRect(0, H * 0.26, W, H * 0.03);
    g.fillStyle = '#e8eef5'; g.font = 'bold 40px sans-serif';
    g.fillText('SAN VELOR', 24, H * 0.24);
    g.fillStyle = '#0e1115'; g.fillRect(0, H * 0.40, W * 0.5, H * 0.16);
    g.fillStyle = '#ffffff'; g.font = 'bold 58px sans-serif';
    g.fillText('04', 30, H * 0.55);
    g.fillStyle = '#f2b21a'; g.fillRect(W * 0.55, H * 0.40, W * 0.4, H * 0.06);
  } else if (kind === 5) {
    // digital camo
    g.fillStyle = '#8c949c';
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const s = 8 + Math.random() * 26;
      g.globalAlpha = 0.5 + Math.random() * 0.4;
      g.fillRect(x, y, s, s * 0.6);
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  liveryCache.set(kind, tex);
  return tex;
}

// ---------- paint finishes ----------
// A procedural flake/flip map: fine metallic sparkle plus a subtle panel
// gradient, so the paint reads as layered paint instead of flat plastic.
let _flakeTex = null;
function flakeTexture() {
  if (_flakeTex) return _flakeTex;
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // sparkle: mostly neutral, a few bright grains
    const r = Math.random();
    const v = 150 + (r > 0.94 ? 105 : r > 0.7 ? 40 : 0);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace;
  _flakeTex = t;
  return t;
}

function paintMaterial(color, finish, opts = {}) {
  const col = new THREE.Color(color);
  const mat = new THREE.MeshPhysicalMaterial({
    color: col,
    metalness: 0.42,
    roughness: 0.34,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.95,
    ...opts,
  });
  if (finish === 'metallic') {
    mat.metalness = 0.85; mat.roughness = 0.26; mat.clearcoat = 1;
  } else if (finish === 'matte') {
    mat.metalness = 0.25; mat.roughness = 0.72; mat.clearcoat = 0.15;
  } else if (finish === 'pearl') {
    mat.metalness = 0.55; mat.roughness = 0.2; mat.clearcoat = 1;
    mat.iridescence = 1; mat.iridescenceIOR = 1.6; mat.iridescenceThicknessRange = [120, 460];
  }
  // metallic sparkle: modulate the normal slightly so the highlight breaks up
  if (finish === 'metallic' || finish === 'pearl') {
    mat.roughnessMap = flakeTexture();
    mat.roughness = finish === 'pearl' ? 0.24 : 0.30;
    mat.envMapIntensity = 1.25;
  }
  return mat;
}

// ---------- sections per body style ----------
// Each section: { x, hw, yBot, yTop, shoulderY, nz, ny, tuck, topCrown }
function bodySections(def) {
  const B = def.body;
  const L = B.length, W = B.width, H = B.height;
  const hw = W / 2;
  const style = B.style;
  const wedge = style === 'exotic' || style === 'super' ? 0.055 : style === 'muscle' ? 0.012 : 0;
  const boxy = style === 'van' || style === 'truck';
  const wheelR = B.wheelR;
  const axleF = B.wheelbase / 2, axleR = -B.wheelbase / 2;
  const nose = L / 2;
  const sill = 0.24 + (boxy ? 0.10 : 0);
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // how much a fender swells over an axle
  const bump = (x, cx, halfW) => smooth(clamp01(1 - Math.abs(x - cx) / halfW));

  // Cabin derived first: the hood/belt/deck heights all hang off it.
  const belt = Math.max(wheelR * 2 + 0.13, H * (boxy ? 0.50 : 0.62));
  const cabin = cabinSections(def, belt);
  const hoodTop = (x) => {
    const t = clamp01((x - cabin.aX) / Math.max(0.2, nose - cabin.aX));
    const base = Math.max(belt * (boxy ? 0.975 : 0.955), wheelR * 2 + 0.085);
    return base * (1 - 0.07 * t) - wedge * t;
  };
  const deckTop = (x) => {
    const t = clamp01((cabin.cX - x) / Math.max(0.2, cabin.cX + nose));
    return Math.max(belt * (boxy ? 0.995 : 0.972), wheelR * 2 + 0.075) * (1 - 0.03 * t);
  };

  const N = 26;
  const sections = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const x = nose - L * f;
    const inCabin = x <= cabin.aX && x >= cabin.cX;
    let yTop = inCabin ? belt : (x > cabin.aX ? hoodTop(x) : deckTop(x));

    // bumper tuck at both extremes
    const noseT = clamp01((x - (nose - L * 0.055)) / (L * 0.055));
    const tailT = clamp01(((nose - L * 0.945) - x) / (L * 0.055));
    const endTuck = Math.max(noseT, tailT);
    const bumperLine = 0.17 + (boxy ? 0.12 : 0.30);
    const yBot = sill * (1 - endTuck) + bumperLine * endTuck;
    yTop = yTop * (1 - endTuck * 0.10);

    // plan-view taper: nose and tail narrow a little
    let whf = 1.0;
    whf *= 1 - clamp01((f - 0.94) / 0.06) * 0.14;
    whf *= 1 - clamp01((0.05 - f) / 0.05) * 0.10;
    const flare = (bump(x, axleF, B.wheelbase * 0.30) + bump(x, axleR, B.wheelbase * 0.30)) * 0.030;
    whf += flare;

    sections.push({
      x,
      hw: hw * whf,
      yBot,
      yTop: Math.max(yBot + 0.12, yTop),
      shoulderY: yBot + (yTop - yBot) * (boxy ? 0.80 : 0.66),
      nz: inCabin ? 6.0 : 4.4,
      ny: boxy ? 5.0 : inCabin ? 3.0 : 2.2,
      tuck: 0.10 + (boxy ? 0.0 : 0.02),
      topCrown: inCabin ? 0.0 : 0.022,
    });
  }
  const cowl = cabin.aX, cabinEnd = cabin.cX;
  return {
    sections, belt, hw, H, L, W, noseX: L / 2, tailX: -L / 2, sill,
    wheelTop: wheelR * 2, cabin,
    cowlX: cowl, cabinEndX: cabinEnd,
    hoodNoseY: hoodTop(nose), hoodCowlY: hoodTop(cowl), deckY: deckTop(cabinEnd),
    archR: wheelR * 1.10,
    hoodYAt: (x) => (x > cowl ? hoodTop(x) : deckTop(x)),
    // the lofted surface at a given x: top height and half width
    surfaceAt: (x) => {
      let a = sections[0], b = sections[sections.length - 1];
      for (let i = 0; i < sections.length - 1; i++) {
        if (x <= sections[i].x && x >= sections[i + 1].x) { a = sections[i]; b = sections[i + 1]; break; }
      }
      const t = Math.abs(b.x - a.x) < 1e-6 ? 0 : clamp((a.x - x) / (a.x - b.x), 0, 1);
      return {
        yTop: a.yTop + (b.yTop - a.yTop) * t,
        yBot: a.yBot + (b.yBot - a.yBot) * t,
        hw: a.hw + (b.hw - a.hw) * t,
      };
    },
    halfWidthAt: (x) => {
      const sec = sections.reduce((best, cur) => (Math.abs(cur.x - x) < Math.abs(best.x - x) ? cur : best), sections[0]);
      return sec.hw;
    },
  };
}

// The greenhouse as a side profile: windscreen, roof, backlight — extruded
// across a narrow width with strong tumblehome so it reads as glass, not a dome.
function cabinGeometry(def, cabin) {
  const B = def.body;
  const c = cabin;
  const pts = [
    new THREE.Vector2(c.aX, c.belt),
    new THREE.Vector2(c.aX - c.rakeF, c.roofY),
    new THREE.Vector2(c.cX + c.rakeR, c.roofY),
    new THREE.Vector2(c.cX, c.belt),
  ];
  const width = B.width * 0.94;
  const round = 0.22;
  c.baseHalfW = width / 2;
  c.topHalfW = (width / 2) * (1 - round) - 0.02;
  return extrudeProfile(pts, width, {
    bevelSize: 0.03, taperFrom: c.belt, taperSpan: c.glassH,
    round, crown: 0.02, topFrom: 0.8,
  });
}

function cabinSections(def, belt) {
  const B = def.body;
  const boxy = B.style === 'van' || B.style === 'truck';
  // Roof height: a coupe keeps ~2.6 heads of cabin above the belt, a van more.
  const minCabinH = boxy ? 0.72 : 0.36;
  const roofY = Math.max(belt + minCabinH, B.height * (boxy ? 0.99 : 0.975));
  const glassH = roofY - belt;
  // windscreen base sits behind the hood
  const aX = B.length / 2 - B.hoodLen;
  const cabinLen = boxy ? B.cabinLen * 0.60 : Math.min(B.cabinLen, B.length * 0.40);
  const rakeF = boxy ? Math.min(cabinLen * 0.26, glassH * 0.5) : Math.min(cabinLen * 0.40, glassH * 0.95);
  const roofStart = aX - rakeF;
  const roofLen = boxy ? cabinLen * 0.70 : Math.max(cabinLen * 0.30, cabinLen * 0.42);
  const roofEnd = roofStart - roofLen;
  const cX = aX - cabinLen;                      // backlight base
  const rakeR = boxy ? Math.min(glassH * 0.30, cabinLen * 0.22) : Math.max(0, roofEnd - cX);
  return {
    belt, roofY, glassH, aX, cX, rakeF, rakeR, roofLen,
    roofStart, roofEnd,
    roofMidX: (roofStart + roofEnd) / 2,
    roofHalfW: (B.width / 2) * 0.80,
    bX: (aX + cX) / 2 - cabinLen * 0.03,
  };
}

// ---------- wheel ----------
// Built so the axle is the wheel group's local Z: rotating the *parent* about
// Y steers the wheel, and spinning the wheel about Z rolls it. Mounting it on
// the left side mirrors Z (rotation.y = PI), which keeps the rim face outboard
// and makes both sides roll the same way in world space.
function buildWheel(rimIdx, rimScale, tireWidth, wheelRadius, quality) {
  const grp = new THREE.Group();
  const rimDef = PARTS.rims[rimIdx] || PARTS.rims[0];
  const vis = rimDef.vis || {};
  const spokes = vis.spokes ?? 0;
  const style = vis.rimStyle || 'steel';
  const tireR = wheelRadius;
  // rim size changes how much of the wheel is rim vs. sidewall, not the radius
  const rimR = tireR * (0.54 + 0.13 * clamp(rimScale ?? 1, 0.85, 1.2));

  const segs = quality === 'low' ? 12 : 22;
  const tireGeo = new THREE.CylinderGeometry(tireR, tireR, tireWidth, segs, 1);
  // square off the shoulder a little
  const pos = tireGeo.attributes.position;
  const halfW = tireWidth / 2;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(Math.abs(pos.getY(i)) - halfW) < 1e-4) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r > tireR * 0.97) {
        pos.setX(i, pos.getX(i) * 0.965);
        pos.setZ(i, pos.getZ(i) * 0.965);
      }
    }
  }
  tireGeo.computeVertexNormals();
  const tireMat = new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.88, metalness: 0.02 });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.rotation.x = Math.PI / 2;   // cylinder Y axis -> Z (the axle)
  tire.userData.wheelPart = 'tire';
  grp.add(tire);

  const rimColor = style === 'steel' ? '#9aa1a8' : style === 'neon' ? '#d7dee5' : '#c2c9d1';
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor, metalness: style === 'steel' ? 0.65 : 0.95,
    roughness: style === 'steel' ? 0.5 : 0.26,
    emissive: style === 'neon' ? new THREE.Color('#25e0d0') : new THREE.Color('#000000'),
    emissiveIntensity: style === 'neon' ? 0.45 : 0,
  });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tireWidth * 0.84, segs, 1, true), rimMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.userData.wheelPart = 'rim';
  grp.add(barrel);

  // rim face, slightly proud of the tyre's outer sidewall
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.9, 0.035, segs, 1), rimMat);
  face.rotation.x = Math.PI / 2;
  face.position.z = tireWidth * 0.34;
  face.userData.wheelPart = 'rim';
  grp.add(face);

  if (spokes > 0) {
    const spokeLen = rimR * 0.9;
    const spokeW = Math.max(0.03, rimR * (style === 'mesh' ? 0.13 : 0.22));
    const geo = new THREE.BoxGeometry(spokeW, spokeLen, 0.05);
    for (let i = 0; i < spokes; i++) {
      const m = new THREE.Mesh(geo, rimMat);
      const a = (i / spokes) * Math.PI * 2;
      m.position.set(Math.cos(a) * spokeLen * 0.5, Math.sin(a) * spokeLen * 0.5, tireWidth * 0.36);
      m.rotation.z = a - Math.PI / 2;
      m.userData.wheelPart = 'rim';
      grp.add(m);
    }
  }

  // brake disc + caliper
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.62, rimR * 0.62, 0.026, Math.max(8, segs / 2)),
    new THREE.MeshStandardMaterial({ color: '#5c6167', metalness: 0.8, roughness: 0.45 })
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.z = tireWidth * 0.12;
  disc.userData.wheelPart = 'rim';
  grp.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.05),
    new THREE.MeshStandardMaterial({ color: '#c8322a', metalness: 0.5, roughness: 0.5 }));
  cal.position.set(-rimR * 0.55, rimR * 0.25, tireWidth * 0.18);
  cal.userData.wheelPart = 'rim';
  grp.add(cal);

  grp.userData.dispose = () => {
    tireGeo.dispose(); tireMat.dispose(); rimMat.dispose();
    barrel.geometry.dispose(); face.geometry.dispose();
    if (spokes > 0) geo.dispose();
    disc.geometry.dispose(); disc.material.dispose();
    cal.geometry.dispose(); cal.material.dispose();
  };
  return grp;
}

export class CarVisual {
  constructor(def, mods, opts = {}) {
    this.def = def;
    this.mods = mods;
    this.quality = opts.quality || 'high';
    this.opts = opts;
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);
    this.parts = [];
    this.materials = [];
    this.wheels = [];
    this.steer = 0;
    this.wheelSpin = 0;
    this.suspension = [0, 0, 0, 0];
    this.health = 1;
    this.brakeLight = 0;
    this.reverseLight = 0;
    this.nitroActive = false;
    this.lightsOn = false;
    this.build();
  }

  disposeGroup(g) {
    g.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.userData?.shared) { /* keep shared */ }
        else if (o.material && o.material.dispose) o.material.dispose();
      }
    });
  }

  clear() {
    for (const p of this.parts) {
      this.bodyGroup.remove(p);
    }
    this.parts.length = 0;
    for (const w of this.wheels) { this.group.remove(w.grp); w.grp.userData.dispose?.(); }
    this.wheels = [];
    while (this.group.children.length > 1) {
      const c = this.group.children[1];
      this.group.remove(c);
      this.disposeGroup(c);
    }
    if (this.lowBeam) { this.lowBeam.parent?.remove(this.lowBeam); this.lowBeam = null; }
    if (this.underglowLight) { this.underglowLight.parent?.remove(this.underglowLight); this.underglowLight = null; }
  }

  setMods(mods) {
    this.mods = mods;
    this.rebuild();
  }

  rebuild() {
    const lightsWereOn = this.lightsOn;
    this.clear();
    this.build();
    this.setLights(lightsWereOn);   // stop the beams flickering on rebuild
  }

  build() {
    const def = this.def, mods = this.mods, B = def.body;
    const bodyInfo = bodySections(def);
    const { belt, hw, H, L, W } = bodyInfo;
    const beltY = bodyInfo.belt;

    // ---- paint / body ----
    const finish = PARTS.finish[mods.finish]?.vis?.finish || 'gloss';
    const paintCol = mods.paintColor || def.defaultColor;
    const livery = PARTS.livery[mods.livery]?.vis?.livery ?? 0;
    const bodyMat = paintMaterial(paintCol, finish);
    bodyMat.map = livery ? liveryTexture(livery) : null;
    if (bodyMat.map) bodyMat.needsUpdate = true;
    // subtle fresnel-ish rim light via emissive
    bodyMat.emissive = new THREE.Color(paintCol).multiplyScalar(0.06);
    this.bodyMat = bodyMat;

    const profile = { ...bodyInfo, ...bodyInfo.cabin };
    this.profile = profile;
    const bodyGeo = loftBody(bodyInfo.sections, def);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.bodyMesh = body;
    this.bodyGroup.add(body);
    this.parts.push(body);

    // ---- wheel arches: rolled lips + the dark wheel wells behind them ----
    const wheelR = B.wheelR;
    const axleF = B.wheelbase / 2;
    const axleR = -B.wheelbase / 2;
    const lipGeo = archLipGeometry(def);
    const wellMat = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.95, metalness: 0.05 });
    for (const ax of [axleF, axleR]) {
      for (const sgn of [1, -1]) {
        const lip = new THREE.Mesh(lipGeo.clone(), bodyMat);
        lip.position.set(ax, 0, sgn * (hw - 0.035));
        lip.castShadow = true;
        this.bodyGroup.add(lip);
        this.parts.push(lip);
        // a dark half-barrel behind the arch so you cannot see through the car
        const well = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 1.06, wheelR * 1.06, B.wheelW * 1.35, 14, 1, true, Math.PI * 0.5, Math.PI),
          new THREE.MeshStandardMaterial({ color: '#08090b', roughness: 1, metalness: 0, side: THREE.DoubleSide }));
        well.rotation.x = -Math.PI / 2;
        well.position.set(ax, wheelR, sgn * (hw - 0.12));
        this.bodyGroup.add(well);
        this.parts.push(well);
      }
    }

    // ---- greenhouse: raked body pillars + recessed glass panels ----
    // One thin pillar frame around the whole greenhouse keeps it attached to
    // the body, and the glass sits *inside* that frame instead of floating.
    const cabin = cabinSections(def, beltY);
    const hullHalf = hw * 0.90;                     // glass is inset from the flanks
    const roofHalf = hullHalf * 0.86;                // tumblehome at the roof
    const glassInset = 0.035;
    const roundY = (y) => {
      const t = clamp((y - beltY) / Math.max(0.15, cabin.roofY - beltY), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const halfAt = (y) => hullHalf + (roofHalf - hullHalf) * roundY(y);
    const sideGlass = (x1, x2, y1, y2, zSign) => {
      // a quad panel leaning inboard with the tumblehome, in the X-Y plane
      const len = Math.abs(x2 - x1);
      const h = y2 - y1;
      const geo = new THREE.PlaneGeometry(len, h, 1, 3);
      const posA = geo.attributes.position;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      for (let i = 0; i < posA.count; i++) {
        const lx = posA.getX(i) + cx;
        const ly = posA.getY(i) + cy;
        // place the vertex in world-local space and lean it inboard
        posA.setXYZ(i, lx, ly, zSign * (halfAt(ly) - glassInset));
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, glassMat);
      m.position.set(0, 0, 0);
      this.bodyGroup.add(m);
      this.parts.push(m);
    };
    const tint = PARTS.tint[mods.tint]?.vis?.tint ?? 0;
    const glassCol = ['#7d97a8', '#405058', '#131a1f', '#c7d2da'][clamp(tint, 0, 3)];
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: glassCol, metalness: 0.30, roughness: tint >= 2 ? 0.10 : 0.18,
      transparent: true, opacity: tint === 3 ? 0.92 : 0.72, side: THREE.DoubleSide,
      envMapIntensity: 1.4, clearcoat: 1,
    });
    this.glassMat = glassMat;
    const beltTrim = beltY + 0.015;
    // side windows: front door + rear quarter, split by the B pillar
    const bPillarX = cabin.bX;
    for (const sgn of [1, -1]) {
      sideGlass(cabin.aX - cabin.rakeF - 0.02, bPillarX + 0.05, beltTrim, cabin.roofY - 0.045, sgn);
      if (bPillarX - 0.05 > cabin.cX + cabin.rakeR) {
        sideGlass(bPillarX - 0.05, cabin.cX + cabin.rakeR, beltTrim, cabin.roofY - 0.045, sgn);
      }
    }
    // windscreen and backlight (recline with the pillars)
    const rakePanel = (xBase, xTop, yBase, yTop, zHalf) => {
      const geo = new THREE.PlaneGeometry(1, 1, 4, 1);
      const pA = geo.attributes.position;
      for (let i = 0; i < pA.count; i++) {
        const u = pA.getX(i) + 0.5;                 // 0..1 along the panel
        const v = pA.getY(i) + 0.5;                 // 0..1 across the car
        const x = xBase + (xTop - xBase) * u;
        const y = yBase + (yTop - yBase) * u;
        pA.setXYZ(i, x, y, (v - 0.5) * 2 * zHalf);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, glassMat);
      this.bodyGroup.add(m);
      this.parts.push(m);
    };
    rakePanel(cabin.aX + 0.01, cabin.aX - cabin.rakeF, beltTrim, cabin.roofY - 0.02, hullHalf * 0.94);
    rakePanel(cabin.cX - 0.01, cabin.cX + cabin.rakeR, beltTrim, cabin.roofY - 0.02, hullHalf * 0.92);
    // roof skin: slightly proud of the glass, body coloured
    const roofPanel = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.15, cabin.roofLen * 1.02), 0.05, roofHalf * 2.04), bodyMat);
    roofPanel.position.set(cabin.roofMidX, cabin.roofY - 0.012, 0);
    roofPanel.castShadow = true;
    this.bodyGroup.add(roofPanel);
    this.parts.push(roofPanel);
    // pillars: A, B, C — thin posts standing on the body, canted with the glass
    const pillar = (xTop, xBase, yTop, yBase, thick, name) => {
      const len = Math.hypot(xTop - xBase, yTop - yBase) + 0.04;
      for (const sgn of [1, -1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, 0.05), bodyMat);
        m.position.set((xTop + xBase) / 2, (yTop + yBase) / 2, sgn * (halfAt((yTop + yBase) / 2) - glassInset - 0.012));
        m.rotation.z = Math.atan2(yTop - yBase, xTop - xBase) - Math.PI / 2;
        m.rotation.y = -sgn * 0.22;
        m.castShadow = true;
        this.bodyGroup.add(m);
        this.parts.push(m);
      }
    };
    pillar(cabin.aX - cabin.rakeF, cabin.aX, cabin.roofY - 0.01, beltY + 0.02, 0.075, 'A');
    pillar(bPillarX + 0.03, bPillarX - 0.03, cabin.roofY - 0.02, beltY + 0.02, 0.055, 'B');
    pillar(cabin.cX + cabin.rakeR, cabin.cX, cabin.roofY - 0.01, beltY + 0.02, 0.070, 'C');

    // ---- wheels ----
    const rimIdx = mods.rims ?? 1;
    const rimScale = PARTS.rimSize[mods.rimSize]?.vis?.rimScale ?? 1.0;
    const widthMul = PARTS.rims[rimIdx]?.vis?.rimStyle === 'dish' ? 1.12 : 1.0;
    // keep the tyre face flush with (or just proud of) the bodywork
    const flareOut = (mods.frontBumper >= 2 || mods.rearBumper >= 2) ? 0.05 : 0.015;
    const wheelHalfTrack = Math.min(B.track / 2, hw - B.wheelW * 0.60) + flareOut * 0.5;
    const wheelPositions = [
      [axleF, wheelHalfTrack], [axleF, -wheelHalfTrack],
      [axleR, wheelHalfTrack], [axleR, -wheelHalfTrack],
    ];
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2;
      const w = buildWheel(rimIdx, rimScale, B.wheelW * widthMul, wheelR, this.quality);
      const holder = new THREE.Group();
      holder.position.set(wheelPositions[i][0], wheelR, wheelPositions[i][1]);
      holder.add(w);
      // Mirroring Z turns the rim face outboard on the left side. Because the
      // mirror also flips the axle direction, both sides then roll the same way
      // in world space for a single spin value.
      if (wheelPositions[i][1] < 0) w.rotation.y = Math.PI;
      this.group.add(holder);
      this.wheels.push({
        grp: holder, spin: w, isFront,
        side: wheelPositions[i][1] > 0 ? 1 : -1,
        base: holder.position.clone(),
      });
    }

    // ---- lights ----
    const headlightStyle = PARTS.headlights[mods.headlights]?.vis?.headlights ?? 0;
    const headCol = ['#ffe9b8', '#eaf4ff', '#dff0ff', '#bfe2ff'][clamp(headlightStyle, 0, 3)];
    const headMat = new THREE.MeshStandardMaterial({
      color: headCol, emissive: new THREE.Color(headCol),
      emissiveIntensity: this.lightsOn ? 1.6 : 0.35, roughness: 0.2, metalness: 0.3,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#8f0d10', emissive: new THREE.Color('#ff2818'), emissiveIntensity: 0.35, roughness: 0.3,
    });
    const revMat = new THREE.MeshStandardMaterial({
      color: '#dcdcdc', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.3,
    });
    this.headMat = headMat; this.tailMat = tailMat; this.revMat = revMat;

    const surfaceAt = bodyInfo.surfaceAt;
    const lampW = hw * 0.40, lampH = B.height * 0.072, lampD = 0.05;
    const noseX = B.length / 2;
    // lamps live on the bumper faces, so query the shell just inboard of each end
    const noseSurf = surfaceAt(noseX - 0.30);
    const tailSurf = surfaceAt(-noseX + 0.30);
    const headY = noseSurf.yBot + (noseSurf.yTop - noseSurf.yBot) * 0.62 + lampH * 0.5;
    const tailY = tailSurf.yBot + (tailSurf.yTop - tailSurf.yBot) * 0.58 + lampH * 0.5;
    for (const sgn of [1, -1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.07, lampH, lampW), headMat);
      hl.position.set(noseX - 0.16, headY, sgn * noseSurf.hw * 0.58);
      this.bodyGroup.add(hl); this.parts.push(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, lampH, lampW * 1.1), tailMat);
      tl.position.set(-noseX + 0.14, tailY, sgn * tailSurf.hw * 0.56);
      this.bodyGroup.add(tl); this.parts.push(tl);
      // reverse lamp
      const rv = new THREE.Mesh(new THREE.BoxGeometry(0.05, lampH * 0.30, lampW * 0.24), revMat);
      rv.position.set(-noseX + 0.13, tailY - lampH * 0.02, sgn * tailSurf.hw * 0.24);
      this.bodyGroup.add(rv); this.parts.push(rv);
    }
    // third brake light
    const chmsl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, hw * 0.7), tailMat);
    chmsl.position.set(-noseX + 0.20, profile.deckY + 0.02, 0);
    this.bodyGroup.add(chmsl); this.parts.push(chmsl);

    // ---- grille + bumper aero ----
    // the aero parts must sit on the actual panels, not at the belt line
    const hoodYAt = (x) => profile.hoodYAt(x);
    const deckTop = profile.deckY;
    const fbStyle = PARTS.frontBumper[mods.frontBumper]?.vis?.frontBumper ?? 0;
    const rbStyle = PARTS.rearBumper[mods.rearBumper]?.vis?.rearBumper ?? 0;
    const trimMat = new THREE.MeshStandardMaterial({ color: '#14171b', roughness: 0.55, metalness: 0.35 });
    const carbonMat = new THREE.MeshPhysicalMaterial({ color: '#0c0e10', roughness: 0.3, metalness: 0.6, clearcoat: 1 });

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, B.height * 0.13, noseSurf.hw * 0.86), trimMat);
    grille.position.set(noseX - 0.05, headY - lampH * 0.55, 0);
    this.bodyGroup.add(grille); this.parts.push(grille);

    // front lip / splitter
    if (fbStyle >= 1) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.38 + fbStyle * 0.06, 0.05, hw * 1.92), trimMat);
      lip.position.set(noseX - 0.18, 0.12 + B.rideHeight * 0.2, 0);
      this.bodyGroup.add(lip); this.parts.push(lip);
    }
    if (fbStyle >= 2) {
      // widebody front flares
      for (const sgn of [1, -1]) {
        const flare = new THREE.Mesh(new THREE.BoxGeometry(B.hoodLen * 0.75, 0.16, 0.10), bodyMat);
        flare.position.set(noseX - B.hoodLen * 0.55, wheelR + profile.archR * 0.72, sgn * (hw + 0.02));
        this.bodyGroup.add(flare); this.parts.push(flare);
      }
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, hw * 2.05), carbonMat);
      splitter.position.set(noseX - 0.12, 0.10, 0);
      this.bodyGroup.add(splitter); this.parts.push(splitter);
    }
    if (fbStyle >= 3) {
      for (const sgn of [1, -1]) {
        const canard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.16), carbonMat);
        canard.position.set(noseX - 0.3, 0.42, sgn * hw * 0.86);
        canard.rotation.z = sgn * 0.18;
        this.bodyGroup.add(canard); this.parts.push(canard);
      }
      // intercooler
      const ic = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, hw * 0.8),
        new THREE.MeshStandardMaterial({ color: '#7f868d', metalness: 0.9, roughness: 0.4 }));
      ic.position.set(noseX - 0.02, beltY * 0.38, 0);
      this.bodyGroup.add(ic); this.parts.push(ic);
    }
    // rear diffuser
    if (rbStyle >= 1) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, hw * 1.7), trimMat);
      d.position.set(-noseX + 0.14, 0.13, 0);
      this.bodyGroup.add(d); this.parts.push(d);
    }
    if (rbStyle >= 2) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, hw * 1.9), carbonMat);
      d.position.set(-noseX + 0.18, 0.19, 0);
      this.bodyGroup.add(d); this.parts.push(d);
      for (const sgn of [1, -1]) {
        const flare = new THREE.Mesh(new THREE.BoxGeometry(B.cabinLen * 0.5, 0.16, 0.10), bodyMat);
        flare.position.set(-noseX + B.cabinLen * 0.32, wheelR + profile.archR * 0.72, sgn * (hw + 0.02));
        this.bodyGroup.add(flare); this.parts.push(flare);
      }
    }

    // ---- side skirts ----
    const skStyle = PARTS.skirts[mods.skirts]?.vis?.skirts ?? 0;
    if (skStyle >= 1) {
      for (const sgn of [1, -1]) {
        const sk = new THREE.Mesh(new THREE.BoxGeometry(B.wheelbase * 0.98, 0.09 + skStyle * 0.03, 0.12), skStyle >= 2 ? carbonMat : trimMat);
        sk.position.set(0.02, 0.17, sgn * (hw * 0.99));
        this.bodyGroup.add(sk); this.parts.push(sk);
      }
    }

    // ---- spoiler ----
    const spStyle = PARTS.spoiler[mods.spoiler]?.vis?.spoiler ?? 0;
    if (spStyle >= 1) {
      const rearX = -noseX + 0.22;
      if (spStyle === 1) {
        const duck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, hw * 1.5), bodyMat);
        duck.position.set(rearX, deckTop + 0.05, 0);
        duck.rotation.z = 0.22;
        this.bodyGroup.add(duck); this.parts.push(duck);
      } else {
        const h = spStyle === 2 ? 0.26 : 0.34;
        for (const sgn of [1, -1]) {
          const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.05), carbonMat);
          stand.position.set(rearX + 0.05, deckTop + h * 0.5, sgn * hw * 0.62);
          this.bodyGroup.add(stand); this.parts.push(stand);
        }
        const planeW = hw * (spStyle === 2 ? 1.85 : 2.0);
        const plane = new THREE.Mesh(new THREE.BoxGeometry(spStyle === 3 ? 0.36 : 0.30, 0.035, planeW), carbonMat);
        plane.position.set(rearX + 0.02, deckTop + h + 0.02, 0);
        plane.rotation.z = spStyle === 3 ? -0.12 : -0.06;
        this.bodyGroup.add(plane); this.parts.push(plane);
        if (spStyle === 3) {
          for (const sgn of [1, -1]) {
            const end = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.03), carbonMat);
            end.position.set(rearX + 0.02, deckTop + h - 0.02, sgn * planeW * 0.5);
            this.bodyGroup.add(end); this.parts.push(end);
          }
        }
      }
    }

    // ---- hood vents ----
    const hoodStyle = PARTS.hood[mods.hood]?.vis?.hood ?? 0;
    if (hoodStyle >= 1) {
      const hoodX = noseX - B.hoodLen * 0.52;
      const mat = hoodStyle === 1 ? trimMat : carbonMat;
      for (const sgn of [1, -1]) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(B.hoodLen * 0.3, 0.03, hw * 0.36), mat);
        vent.position.set(hoodX, hoodYAt(hoodX) + 0.005, sgn * hw * 0.42);
        this.bodyGroup.add(vent); this.parts.push(vent);
      }
      if (hoodStyle >= 2) {
        const hoodPanel = new THREE.Mesh(new THREE.BoxGeometry(B.hoodLen * 0.92, 0.02, hw * 1.72), carbonMat);
        hoodPanel.position.set(noseX - B.hoodLen * 0.5, hoodYAt(noseX - B.hoodLen * 0.5) + 0.018, 0);
        this.bodyGroup.add(hoodPanel); this.parts.push(hoodPanel);
      }
      if (hoodStyle >= 3) {
        for (const sgn of [1, -1]) {
          for (const off of [-0.25, 0.25]) {
            const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6), trimMat);
            pin.position.set(noseX - B.hoodLen * (0.62 + off * 0.25), hoodYAt(noseX - B.hoodLen * 0.62) + 0.035, sgn * hw * 0.65);
            this.bodyGroup.add(pin); this.parts.push(pin);
          }
        }
      }
    }

    // ---- mirrors: mounted on the belt line just behind the A pillar ----
    const mirX = clamp(cabin.aX - 0.10, -noseX + 0.3, noseX - 0.3);
    const mirSurf = surfaceAt(mirX);
    for (const sgn of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.09), trimMat);
      arm.position.set(mirX, beltY + 0.045, sgn * (mirSurf.hw * 0.97));
      this.bodyGroup.add(arm); this.parts.push(arm);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.15), bodyMat);
      mir.position.set(mirX - 0.02, beltY + 0.075, sgn * (mirSurf.hw * 0.97 + 0.055));
      this.bodyGroup.add(mir); this.parts.push(mir);
    }

    // ---- exhaust tips ----
    const etStyle = PARTS.exhaustTip[mods.exhaustTip]?.vis?.exhaustTip ?? 0;
    if (etStyle >= 1) {
      const tipMat = new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 1, roughness: 0.22 });
      const count = etStyle === 1 ? 1 : etStyle === 2 ? 2 : 4;
      const spacing = hw * 0.35;
      for (let i = 0; i < count; i++) {
        const z = count === 1 ? -hw * 0.55 : (i - (count - 1) / 2) * spacing;
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.22, 10), tipMat);
        tip.rotation.z = Math.PI / 2;
        tip.position.set(-noseX + 0.04, Math.max(0.19, tailSurf.yBot + 0.06), z);
        this.bodyGroup.add(tip); this.parts.push(tip);
      }
    }

    // ---- interior (visible through glass) ----
    const interiorCol = PARTS.interiorColor[mods.interiorColor]?.vis?.interior || '#1b1d20';
    const interiorMat = new THREE.MeshStandardMaterial({ color: interiorCol, roughness: 0.8, metalness: 0.1 });
    const seatsStyle = PARTS.seats[mods.seats]?.vis?.seats ?? 0;
    // Seats must fit *under* the roof: the backrest height is capped by the
    // cabin height, otherwise the headrests poke through the roof skin.
    const seatTopMax = cabin.roofY - 0.075;
    const backH = Math.min(seatsStyle === 2 ? 0.46 : 0.38, Math.max(0.18, seatTopMax - (beltY - 0.02)));
    const seatH = Math.max(0.12, Math.min(0.34, seatTopMax - (beltY - 0.02) - 0.05));
    const seatX = clamp(cabin.bX + 0.06, cabin.cX + 0.25, cabin.aX - 0.32);
    for (const sgn of [1, -1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.40, seatH, 0.42),
        seatsStyle === 1 ? new THREE.MeshStandardMaterial({ color: interiorCol, roughness: 0.6 }) : interiorMat);
      seat.position.set(seatX, beltY - 0.02 + seatH * 0.5, sgn * hw * 0.36);
      this.bodyGroup.add(seat); this.parts.push(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.10, backH, 0.40), interiorMat);
      back.position.set(seatX - 0.22, beltY - 0.02 + backH * 0.5, sgn * hw * 0.36);
      this.bodyGroup.add(back); this.parts.push(back);
    }
    // steering wheel
    const wheelStyle = PARTS.wheel[mods.wheel]?.vis?.wheel ?? 0;
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 12),
      new THREE.MeshStandardMaterial({ color: wheelStyle === 2 ? '#151719' : '#22262b', metalness: 0.3, roughness: 0.7 }));
    sw.position.set(clamp(cabin.aX - 0.42, cabin.cX + 0.2, noseX), beltY + 0.13, hw * 0.34);
    sw.rotation.y = Math.PI / 2;
    this.bodyGroup.add(sw); this.parts.push(sw);
    // dash
    const dashStyle = PARTS.dash[mods.dash]?.vis?.dash ?? 0;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, hw * 1.5), interiorMat);
    dash.position.set(clamp(cabin.aX - 0.26, cabin.cX + 0.1, noseX), beltY + 0.04, 0);
    this.bodyGroup.add(dash); this.parts.push(dash);
    if (dashStyle >= 1) {
      const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.2),
        new THREE.MeshStandardMaterial({ color: '#0a0c0e', emissive: new THREE.Color('#25e0d0'), emissiveIntensity: 0.7 }));
      gauge.position.set(clamp(cabin.aX - 0.34, cabin.cX + 0.14, noseX), beltY + 0.15, hw * 0.34);
      this.bodyGroup.add(gauge); this.parts.push(gauge);
    }

    // ---- underglow ----
    const ugCol = PARTS.underglow[mods.underglow]?.vis?.underglow;
    if (ugCol) {
      const ug = new THREE.Mesh(new THREE.PlaneGeometry(B.length * 1.05, W * 1.15),
        new THREE.MeshBasicMaterial({ color: ugCol, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      ug.rotation.x = -Math.PI / 2;
      ug.position.y = 0.035;
      this.group.add(ug);
      this.parts.push(ug);
      const light = new THREE.PointLight(ugCol, 1.6, 7, 2);
      light.position.set(0, 0.2, 0);
      this.group.add(light);
      this.underglowLight = light;
    }

    // ---- headlight beams (real light, so night driving is possible) ----
    // Two spots aimed forward: a wide low beam plus a narrow thrower. They are
    // only switched on at night / in fog by setLights().
    this.beamLights = [];
    const beamY = beltY * 0.72;
    for (const sgn of this.quality === 'low' ? [] : [1, -1]) {
      const near = new THREE.SpotLight('#ffe6bd', 0, 46, 0.62, 0.55, 1.6);
      near.position.set(noseX - 0.10, beamY, sgn * hw * 0.55);
      near.target.position.set(noseX + 26, -1.4, sgn * hw * 1.5);
      this.bodyGroup.add(near, near.target);
      this.beamLights.push(near);
    }
    if (this.quality !== 'low') {
      const thrower = new THREE.SpotLight('#f2f6ff', 0, 105, 0.30, 0.42, 1.35);
      thrower.position.set(noseX - 0.10, beamY + 0.05, 0);
      thrower.target.position.set(noseX + 70, -2.5, 0);
      this.bodyGroup.add(thrower, thrower.target);
      this.beamLights.push(thrower);
    }
    this.setLights(this.lightsOn);

    // ---- contact shadow blob (keeps the car grounded) ----
    const shadowGeo = new THREE.PlaneGeometry(B.length * 1.15, W * 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const c2 = canvas.getContext('2d');
    const grd = c2.createRadialGradient(64, 64, 6, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.42)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    c2.fillStyle = grd; c2.fillRect(0, 0, 128, 128);
    if (!CarVisual._blobTex) {
      CarVisual._blobTex = new THREE.CanvasTexture(canvas);
      CarVisual._blobTex.colorSpace = THREE.SRGBColorSpace;
    }
    const blob = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      map: CarVisual._blobTex, transparent: true, depthWrite: false, opacity: 0.9,
    }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.renderOrder = 1;
    this.group.add(blob);
    this.blob = blob;

    this.rideHeightOffset = (B.rideHeight || 0.28) + (PARTS.ride[mods.ride]?.vis?.rideHeight ?? 0) * -1 * 0 + (mods && PARTS.ride[mods.ride]?.stats?.rideHeight || 0);
    this.camber = PARTS.camber[mods.camber]?.stats?.camber || 0;
    this.applyStance();
  }

  applyStance() {
    const B = this.def.body;
    const ride = PARTS.ride[this.mods.ride]?.stats?.rideHeight || 0;
    const camber = PARTS.camber[this.mods.camber]?.stats?.camber || 0;
    const baseY = B.wheelR;
    for (const w of this.wheels) {
      w.grp.position.y = baseY;
      // camber tilts the whole wheel inwards at the top: rotate about the
      // longitudinal (X) axis, never about the spin axis
      w.grp.rotation.x = camber * (w.isFront ? 1 : 0.6) * w.side;
    }
    this.bodyGroup.position.y = ride + (this.bodyDrop ?? 0);
    this.bodyGroup.position.y = 0;
    // apply ride height to the body itself (wheels independent)
    this.rideY = ride;
  }

  setLights(on) {
    this.lightsOn = on;
    if (this.headMat) this.headMat.emissiveIntensity = on ? 1.7 : 0.35;
    if (this.tailMat && !this.brakeLight) this.tailMat.emissiveIntensity = on ? 0.55 : 0.3;
    if (this.beamLights && this.beamLights.length === 3) {
      const [l1, l2, thrower] = this.beamLights;
      l1.intensity = on ? 26 : 0;
      l2.intensity = on ? 26 : 0;
      thrower.intensity = on ? 34 : 0;
      l1.visible = l2.visible = thrower.visible = !!on;
    }
  }

  setBrake(v) {
    this.brakeLight = v;
    if (this.tailMat) this.tailMat.emissiveIntensity = v ? 2.4 : (this.lightsOn ? 0.55 : 0.3);
  }
  setReverse(v) {
    this.reverseLight = v;
    if (this.revMat) this.revMat.emissiveIntensity = v ? 2.0 : 0.1;
  }

  update(dt, state) {
    // state: {steer, wheelSpin, speed, suspension:[4], health, pitch, roll, lightsOn}
    if (!this.wheels.length) return;
    const B = this.def.body;
    const steerTarget = state.steer || 0;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 12);
    this.wheelSpin += state.wheelDelta || 0;

    // spin sign: rolling forward must make the tyre surface move backwards at
    // the contact patch, i.e. the rim turns the other way around +Z.
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      // +steer (from the physics) turns left, and +rotation.y is left here
      w.grp.rotation.y = w.isFront ? this.steer * 0.9 : 0;
      w.spin.rotation.z = -this.wheelSpin;
      const sus = state.suspension ? state.suspension[i] : 0;
      const ride = PARTS.ride[this.mods.ride]?.stats?.rideHeight || 0;
      const bump = sus * 0.055;
      w.grp.position.y = B.wheelR + bump;
      w.grp.position.x = w.base.x + (state.wheelOffset ? state.wheelOffset[i] : 0);
    }
    // body attitude
    this.bodyGroup.position.y = (PARTS.ride[this.mods.ride]?.stats?.rideHeight || 0) * 0.55;
    this.bodyGroup.rotation.z = state.pitch || 0;
    this.bodyGroup.rotation.x = state.roll || 0;
    if (this.blob) this.blob.position.y = 0.02;
  }

  dispose() {
    this.clear();
    CarVisual._blobTex = CarVisual._blobTex || null;
  }
}

// Build a fast "traffic" car — simplified but still shaped properly
export function buildTrafficCar(def, color, quality = 'low') {
  const mods = {
    paintColor: color, finish: 0, tint: 1, rims: 0, rimSize: 0,
    frontBumper: 0, rearBumper: 0, skirts: 0, spoiler: 0, hood: 0,
    headlights: 0, exhaustTip: 0, livery: 0, underglow: 0,
    wheel: 0, seats: 0, dash: 0, interiorColor: 0, tires: 0,
    engine: 0, turbo: 0, ecu: 0, intake: 0, exhaust: 0, cooling: 0,
    gearbox: 0, clutch: 0, diff: 0, final: 0,
    suspension: 0, ride: 0, camber: 0,
  };
  return new CarVisual(def, mods, { quality });
}
