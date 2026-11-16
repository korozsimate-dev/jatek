// ============================================================
// Procedural vehicle geometry.
// A vehicle is lofted from cross-sections so the silhouette reads
// as a real car, then dressed with wheels, glass, lamps, aero and
// livery decals driven by the tuning state.
// ============================================================

import * as THREE from 'three';
import { PARTS } from '../data/cars.js';
import { clamp } from '../core/util.js';

const CIRC = 16; // cross-section resolution

// ---------- material helpers ----------
export function makeEnv(renderer, scene) {
  // procedural sky/ground environment used for paint reflections
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

// ---------- lofted body ----------
// A "dome" section: flat at y0, rounded above — used for the greenhouse so the
// glass never bulges out below the belt line.
function superellipse(hw, y0, y1, n, topNarrow, out, base, dome = false, edgeLift = 0) {
  if (dome) {
    for (let i = 0; i < CIRC; i++) {
      const t = (i / CIRC) * Math.PI * 2;
      const ct = Math.cos(t), st = Math.sin(t);
      const e = 2 / n;
      let z = Math.sign(ct) * Math.pow(Math.abs(ct), e) * hw;
      const up = Math.max(0, st);
      let y = y0 + Math.pow(up, e) * (y1 - y0);
      const tn = topNarrow * up * up;
      z *= 1 - tn;
      // lift the outer edges (fender crowning over the hood/trunk)
      if (edgeLift) y += edgeLift * Math.pow(Math.abs(z) / Math.max(0.001, hw), 2) * up;
      out[base + i * 3] = z;
      out[base + i * 3 + 1] = y;
    }
    return;
  }
  const cy = (y0 + y1) * 0.5;
  const ry = (y1 - y0) * 0.5;
  for (let i = 0; i < CIRC; i++) {
    const t = (i / CIRC) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    const e = 2 / n;
    let z = Math.sign(ct) * Math.pow(Math.abs(ct), e) * hw;
    let y = cy + Math.sign(st) * Math.pow(Math.abs(st), e) * ry;
    if (st > 0) z *= 1 - topNarrow * st * st;
    out[base + i * 3] = z;
    out[base + i * 3 + 1] = y;
  }
}

function loft(sections, opts = {}) {
  // sections: [{x, hw, y0, y1, n, topNarrow}]
  const S = sections.length;
  const verts = new Float32Array(S * CIRC * 3);
  for (let s = 0; s < S; s++) {
    const sec = sections[s];
    const arr = [];
    superellipse(sec.hw, sec.y0, sec.y1, sec.n ?? 3.2, sec.topNarrow ?? 0.1, arr, 0, sec.dome, sec.edgeLift ?? 0);
    for (let i = 0; i < CIRC; i++) {
      const vi = s * CIRC + i;
      verts[vi * 3] = sec.x;
      verts[vi * 3 + 1] = arr[i * 3 + 1];
      verts[vi * 3 + 2] = arr[i * 3];
    }
  }
  const idx = [];
  for (let s = 0; s < S - 1; s++) {
    for (let i = 0; i < CIRC; i++) {
      const a = s * CIRC + i;
      const b = s * CIRC + ((i + 1) % CIRC);
      const c = (s + 1) * CIRC + i;
      const d = (s + 1) * CIRC + ((i + 1) % CIRC);
      idx.push(a, c, b, b, c, d);
    }
  }
  // end caps
  const capStart = idx.length;
  for (let i = 0; i < CIRC; i++) {
    // front cap (s=0)
    const a = i, b = (i + 1) % CIRC;
    idx.push(a, b, 'cap0');
  }
  // build geometry manually with caps as fans
  const pos = [];
  const uvs = [];
  const index = [];
  const push = (x, y, z, u, v) => { pos.push(x, y, z); uvs.push(u, v); return pos.length / 3 - 1; };
  const map = [];
  for (let s = 0; s < S; s++) {
    const sec = sections[s];
    const u = s / (S - 1);
    const row = [];
    for (let i = 0; i < CIRC; i++) {
      row.push(push(verts[(s * CIRC + i) * 3], verts[(s * CIRC + i) * 3 + 1], verts[(s * CIRC + i) * 3 + 2], u, i / CIRC));
    }
    map.push(row);
  }
  for (let s = 0; s < S - 1; s++) {
    for (let i = 0; i < CIRC; i++) {
      const i2 = (i + 1) % CIRC;
      index.push(map[s][i], map[s + 1][i], map[s][i2]);
      index.push(map[s][i2], map[s + 1][i], map[s + 1][i2]);
    }
  }
  // caps
  const capN = (sections[0].y0 + sections[0].y1) * 0.5;
  for (const which of [0, S - 1]) {
    const cIdx = push(sections[which].x, capN, 0, which ? 1 : 0, 0.5);
    for (let i = 0; i < CIRC; i++) {
      const i2 = (i + 1) % CIRC;
      if (which === 0) index.push(cIdx, map[0][i2], map[0][i]);
      else index.push(cIdx, map[S - 1][i], map[S - 1][i2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---------- side-profile body with real wheel arches ----------
// The lower body is a side silhouette (hood → belt → deck → sills → bumpers)
// extruded across the car, with semicircular wheel-arch cut-outs in the
// underside. That is what makes the wheels read as *in* the car instead of
// hidden behind a slab.
function bodyProfile(info, def) {
  const B = def.body;
  const L = B.length, belt = info.belt;
  const nose = L / 2, tail = -L / 2;
  const axleF = B.wheelbase / 2, axleR = -B.wheelbase / 2;
  const wheelR = B.wheelR;
  const cowlX = nose - B.hoodLen;
  const cabinEndX = cowlX - B.cabinLen;
  const boxy = B.style === 'van' || B.style === 'truck';
  const sillY = 0.26 + (boxy ? 0.10 : 0);
  const bumperY = sillY + 0.07;
  const hoodNoseY = belt * (boxy ? 0.94 : 0.74);
  const hoodCowlY = belt * (boxy ? 0.99 : 0.93);
  const deckY = belt * (boxy ? 0.99 : 0.84);
  const archR = Math.min(wheelR * 1.10, Math.abs(axleF - cowlX) + 0.2, Math.abs(axleR - tail) - 0.18);
  const archTop = wheelR + archR;

  const pts = [];
  const P = (x, y) => pts.push(new THREE.Vector2(x, y));
  // --- top, front to rear ---
  P(nose, bumperY + 0.03);
  P(nose - 0.02, hoodNoseY * 0.86);
  P(nose - 0.06, hoodNoseY);
  P(nose - L * 0.09, hoodNoseY * 1.01);
  P(cowlX - (nose - cowlX) * 0.42, (hoodNoseY + hoodCowlY) * 0.5);
  P(cowlX, hoodCowlY);
  P(cowlX, belt);                    // scuttle step up to the belt line
  P(cabinEndX, belt);                // belt / door line
  P(cabinEndX - (cabinEndX - tail) * 0.18, deckY);   // step down to the deck
  P(tail + L * 0.05, deckY);
  P(tail + 0.015, deckY * 0.97);
  P(tail, bumperY + 0.03);
  // --- underside, rear to front, with an arch over each axle ---
  P(axleR - archR, sillY);
  const arch = (cx, steps) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = Math.PI * (1 - t);            // pi -> 0 : rear edge to front edge
      P(cx + Math.cos(a) * archR, sillY + Math.sin(a) * (archTop - sillY));
    }
  };
  arch(axleR, 9);
  P(axleF - archR, sillY);
  arch(axleF, 9);
  P(nose - 0.02, bumperY + 0.03);
  return { pts, nose, tail, belt, cowlX, cabinEndX, hoodCowlY, hoodNoseY, deckY, sillY, bumperY, archR, axleF, axleR, hw: B.width / 2, L, wheelR };
}

// Extrude a side-profile shape across the car with optional tumblehome:
// sides taper inward with height and the top edges are crowned.
function extrudeProfile(shapePts, width, opts = {}) {
  const shape = new THREE.Shape(shapePts);
  const { bevelSize = 0.045, taperFrom = 0, taperSpan = 0.4, taper = 0.11, crown = 0.055, topFrom = 0.55, round = 0 } = opts;
  const depth = Math.max(0.2, width - bevelSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.035, bevelSize,
    bevelSegments: 1, curveSegments: 3, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const pos = geo.attributes.position;
  const hw0 = width / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    const t = clamp((y - taperFrom) / Math.max(0.15, taperSpan), 0, 1);
    const zf = Math.min(1, Math.abs(z) / hw0);
    // round off the shoulder: pull the top corners in slightly, keep the flank flat
    const r = round * Math.pow(t, 3);
    pos.setZ(i, z * (1 - r));
    // crown the middle of the hood/deck upwards — the outer edges stay put so
    // the side panels remain perfectly flat (no diagonal shading creases)
    if (y > taperFrom + taperSpan * topFrom) pos.setY(i, y + crown * (1 - zf * zf) * t);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function bodyExtrudeGeometry(profile, def) {
  const shape = new THREE.Shape(profile.pts);
  const bevelSize = 0.045;
  const depth = Math.max(0.2, def.body.width - bevelSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 4,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  // Shape the slab into a car: tumblehome (sides lean in near the belt) and a
  // crowned top surface, so the hood and deck are not flat planks.
  const pos = geo.attributes.position;
  const hw0 = def.body.width / 2;
  const { sillY, belt } = profile;
  const span = Math.max(0.15, belt - sillY);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = clamp((y - sillY) / span, 0, 1);
    const zf = Math.min(1, Math.abs(z) / hw0);
    // shoulders lean in above the sill
    pos.setZ(i, z * (1 - 0.11 * t * t));
    // top surfaces crown downward at the edges
    if (y > sillY + span * 0.55) pos.setY(i, y - 0.055 * zf * zf * (0.4 + 0.6 * t));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
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
  return mat;
}

// ---------- sections per body style ----------
function bodySections(def) {
  const B = def.body;
  const L = B.length, W = B.width, H = B.height;
  const hw = W / 2;
  const style = B.style;
  const wedge = style === 'exotic' || style === 'super' ? 0.075 : style === 'muscle' ? 0.02 : 0;
  const boxy = style === 'van' || style === 'truck' ? 0.15 : 0;
  const wheelR = B.wheelR;
  const axleF = B.wheelbase / 2, axleR = -B.wheelbase / 2;
  const nose = L / 2;
  const cowlX = nose - B.hoodLen;
  const cabinEndX = cowlX - B.cabinLen;
  const wheelTop = wheelR * 2;
  const sill = 0.26 + boxy * 0.35;
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const bump = (x, cx, halfW) => smooth(clamp01(1 - Math.abs(x - cx) / halfW));

  // The centre-line height of the shoulder. The fenders are lifted separately
  // via edgeLift so the hood can still sit low like a real coupe.
  const shoulderHood = Math.max(wheelTop + 0.07, H * 0.545);
  const shoulderDoor = Math.max(wheelTop + 0.10, H * 0.655);
  const shoulderDeck = Math.max(wheelTop + 0.085, H * 0.625);

  const N = 22;
  const sections = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const x = nose - L * f;
    let top, edgeLift = 0;

    if (x > cowlX) {
      // hood: slopes down toward the nose, fenders crown up at the axle
      const t = clamp01((x - cowlX) / Math.max(0.2, nose - cowlX));
      top = shoulderHood * (1.0 - 0.10 * t) - wedge * 0.10;
      edgeLift = 0.055 + bump(x, axleF, B.wheelbase * 0.40) * 0.085 + t * 0.02;
    } else if (x > cabinEndX) {
      top = shoulderDoor;
      edgeLift = 0.02 + (bump(x, axleF, B.wheelbase * 0.34) + bump(x, axleR, B.wheelbase * 0.34)) * 0.055;
    } else {
      const t = clamp01((cabinEndX - x) / Math.max(0.2, nose - B.hoodLen - B.cabinLen + nose));
      top = shoulderDeck * (1.0 - 0.07 * t) - wedge * 0.25;
      edgeLift = 0.05 + bump(x, axleR, B.wheelbase * 0.36) * 0.075;
    }
    // bumper tuck at both extremes
    const noseT = clamp01((x - (nose - L * 0.05)) / (L * 0.05));
    const tailT = clamp01(((nose - L * 0.945) - x) / (L * 0.05));
    top *= 1 - noseT * 0.12 - tailT * 0.08;

    let bottom = sill - (x > cowlX ? 0.012 : 0);
    const endTuck = Math.max(noseT, tailT);
    const bumperLine = 0.185 + boxy * 0.12;
    bottom = bottom * (1 - endTuck) + bumperLine * endTuck;

    let whf = 1.0;
    whf *= 1 - clamp01((f - 0.93) / 0.07) * 0.16;
    whf *= 1 - clamp01((0.045 - f) / 0.045) * 0.12;
    whf += (bump(x, axleF, B.wheelbase * 0.30) + bump(x, axleR, B.wheelbase * 0.30)) * 0.028;

    const n = x > cowlX ? 3.4 : x > cabinEndX ? 4.2 : 3.8;
    sections.push({
      x, hw: hw * whf, y0: bottom, y1: Math.max(bottom + 0.10, top),
      n, topNarrow: x > cowlX ? 0.05 : 0.022, edgeLift,
    });
  }
  return { sections, belt: shoulderDoor + 0.055, hw, H, L, W, noseX: L / 2, tailX: -L / 2, sill, wheelTop };
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
  const roofY = Math.max(belt + 0.20, B.height * (B.style === 'van' || B.style === 'truck' ? 1.0 : 0.985));
  const glassH = roofY - belt;
  const aX = B.length / 2 - B.hoodLen + 0.02;          // windscreen base
  // vans and trucks are cab-plus-box: only the front third is glass
  const boxy = B.style === 'van' || B.style === 'truck';
  const cabinLen = boxy ? B.cabinLen * 0.62 : B.cabinLen;
  // windscreen rake (how far forward the roof starts relative to the base)
  const rakeF = boxy ? Math.min(cabinLen * 0.30, glassH * 0.55) : Math.min(cabinLen * 0.42, glassH * 1.15);
  const roofStart = aX - rakeF;
  const roofLen = boxy ? cabinLen * 0.72 : Math.max(cabinLen * 0.34, cabinLen * 0.46);
  const roofEnd = roofStart - roofLen;
  const cX = aX - cabinLen;                            // backlight base
  const rakeR = boxy ? glassH * 0.25 : Math.max(0, roofEnd - cX);
  return {
    belt, roofY, glassH, aX, cX, rakeF, rakeR, roofLen,
    roofMidX: (roofStart + roofEnd) / 2,
    roofHalfW: (B.width / 2) * 0.94 * 0.76,
    bX: (aX + cX) / 2 - cabinLen * 0.03,
  };
}

// ---------- wheel ----------
function buildWheel(rimIdx, rimScale, tireWidth, wheelRadius, quality) {
  const grp = new THREE.Group();
  const rimDef = PARTS.rims[rimIdx] || PARTS.rims[0];
  const vis = rimDef.vis || {};
  const spokes = vis.spokes ?? 0;
  const style = vis.rimStyle || 'steel';
  const tireR = wheelRadius;
  const rimR = tireR * 0.66 * (rimScale / 1.0);

  const segs = quality === 'low' ? 12 : 20;
  const tireGeo = new THREE.CylinderGeometry(tireR, tireR, tireWidth, segs, 1);
  // square off the shoulder a little
  const pos = tireGeo.attributes.position;
  const halfW = tireWidth / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(Math.abs(y) - halfW) < 1e-4) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r > tireR * 0.97) {
        const k = 0.965;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
    }
  }
  tireGeo.computeVertexNormals();
  const tireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, metalness: 0.02 });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.rotation.z = Math.PI / 2; // axis along X? we want axis along Z
  tire.rotation.set(0, 0, 0);
  tire.rotation.x = Math.PI / 2;
  grp.add(tire);

  const rimColor = style === 'steel' ? '#8b9198' : style === 'neon' ? '#cfd6dd' : '#b9c1c9';
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor, metalness: style === 'steel' ? 0.6 : 0.95,
    roughness: style === 'steel' ? 0.55 : 0.24,
    emissive: style === 'neon' ? new THREE.Color('#25e0d0') : new THREE.Color('#000000'),
    emissiveIntensity: style === 'neon' ? 0.35 : 0,
  });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tireWidth * 0.82, segs, 1, true), rimMat);
  barrel.rotation.x = Math.PI / 2;
  grp.add(barrel);

  const faceGeo = [];
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.9, 0.03, segs, 1), rimMat);
  face.rotation.x = Math.PI / 2;
  face.position.z = tireWidth * 0.40;
  grp.add(face);

  if (spokes > 0) {
    const spokeLen = rimR * 0.92;
    const spokeW = Math.max(0.028, rimR * (style === 'mesh' ? 0.10 : 0.20));
    const geo = new THREE.BoxGeometry(spokeW, spokeLen, 0.045);
    for (let i = 0; i < spokes; i++) {
      const m = new THREE.Mesh(geo, rimMat);
      const a = (i / spokes) * Math.PI * 2;
      m.rotation.z = a - Math.PI / 2;
      const off = style === 'dish' ? spokeLen * 0.5 + 0.02 : spokeLen * 0.5;
      m.position.set(Math.cos(a + Math.PI / 2) * off * 0 + Math.sin(a) * off * 0, Math.cos(a) * off, tireWidth * 0.40);
      m.position.x = -Math.sin(a) * off;
      m.position.y = Math.cos(a) * off;
      m.position.z = tireWidth * 0.40;
      grp.add(m);
    }
  }
  // brake disc
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.62, rimR * 0.62, 0.025, Math.max(8, segs / 2)),
    new THREE.MeshStandardMaterial({ color: '#5c6167', metalness: 0.8, roughness: 0.45 })
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.z = tireWidth * 0.2;
  grp.add(disc);
  // caliper
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.05),
    new THREE.MeshStandardMaterial({ color: '#c8322a', metalness: 0.5, roughness: 0.5 }));
  cal.position.set(-rimR * 0.55, rimR * 0.25, tireWidth * 0.22);
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

// ============================================================
//  CarVisual
// ============================================================
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
    this.clear();
    this.build();
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

    const profile = bodyProfile(bodyInfo, def);
    this.profile = profile;
    const bodyGeo = bodyExtrudeGeometry(profile, def);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.bodyMesh = body;
    this.bodyGroup.add(body);
    this.parts.push(body);

    // ---- greenhouse / glass ----
    const cabin = cabinSections(def, beltY);
    const cabinGeo = cabinGeometry(def, cabin);
    const tint = PARTS.tint[mods.tint]?.vis?.tint ?? 0;
    const glassCol = ['#7d97a8', '#405058', '#131a1f', '#c7d2da'][clamp(tint, 0, 3)];
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: glassCol, metalness: 0.35, roughness: tint >= 2 ? 0.12 : 0.22,
      transparent: true, opacity: tint === 3 ? 1 : 0.82, side: THREE.DoubleSide,
      envMapIntensity: 1.3, clearcoat: 1,
    });
    const glass = new THREE.Mesh(cabinGeo, glassMat);
    glass.castShadow = false;
    this.bodyGroup.add(glass);
    this.parts.push(glass);
    this.glassMat = glassMat;
    // dark cabin interior: without it you see straight through the greenhouse
    const interior = new THREE.Mesh(new THREE.BoxGeometry(
      Math.max(0.2, cabin.roofLen * 0.92), cabin.glassH * 0.5, B.width * 0.50
    ), new THREE.MeshStandardMaterial({ color: '#14171a', roughness: 0.95, metalness: 0.05 }));
    interior.position.set(cabin.roofMidX, beltY + cabin.glassH * 0.26, 0);
    this.bodyGroup.add(interior);
    this.parts.push(interior);
    // seats (visible through the glass)
    const seatMat = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.85 });
    for (const sgn of [1, -1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, cabin.glassH * 0.40, 0.28), seatMat);
      seat.position.set(cabin.bX + 0.10, beltY + cabin.glassH * 0.20, sgn * B.width * 0.13);
      this.bodyGroup.add(seat);
      this.parts.push(seat);
    }

    // roof skin + pillars sit exactly on the extruded greenhouse
    const roofY = cabin.roofY;
    const roofLen = cabin.roofLen;
    const roofMidX = cabin.roofMidX;
    let roofHalfW = cabin.roofHalfW;   // follows the tumblehome of the glass
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(roofLen * 1.02, 0.06, roofHalfW * 2.06), bodyMat);
    roofPanel.position.set(roofMidX, roofY - 0.022, 0);
    roofPanel.castShadow = true;
    this.bodyGroup.add(roofPanel);
    this.parts.push(roofPanel);
    // Pillars: simple body-colour slabs following the glass rake, tilted in
    // with the tumblehome so they stay flush with the greenhouse.
    const pillarMat = bodyMat;
    const pillarBaseZ = cabin.baseHalfW * 0.99;
    const pillarTopZ = cabin.topHalfW * 0.99;
    roofHalfW = cabin.topHalfW;
    const lean = Math.atan2(pillarBaseZ - pillarTopZ, Math.max(0.15, cabin.glassH));
    const pillar = (x1, y1, x2, y2, thick, wide) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      for (const sgn of [1, -1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, wide), pillarMat);
        m.position.set((x1 + x2) / 2, (y1 + y2) / 2, sgn * (pillarBaseZ + pillarTopZ) / 2);
        m.rotation.z = angle;
        m.rotation.x = -sgn * lean;
        m.castShadow = true;
        this.bodyGroup.add(m);
        this.parts.push(m);
      }
    };
    pillar(cabin.aX, beltY + 0.03, cabin.aX - cabin.rakeF, roofY - 0.02, 0.055, 0.05);   // A
    pillar(cabin.cX, beltY + 0.03, cabin.cX + cabin.rakeR, roofY - 0.02, 0.065, 0.05);   // C
    pillar(cabin.bX + 0.05, beltY + 0.03, cabin.bX + 0.01, roofY - 0.03, 0.040, 0.045);  // B

    // ---- floor pan (closes the underside between the sills) ----
    const pan = new THREE.Mesh(
      new THREE.BoxGeometry(B.wheelbase * 1.5, 0.16, hw * 1.55),
      new THREE.MeshStandardMaterial({ color: '#0a0b0d', roughness: 0.95, metalness: 0.1 })
    );
    pan.position.set(0.02, 0.30, 0);
    this.bodyGroup.add(pan);
    this.parts.push(pan);

    // ---- wheels ----
    const wheelR = B.wheelR;
    const rimIdx = mods.rims ?? 1;
    const rimScale = PARTS.rimSize[mods.rimSize]?.vis?.rimScale ?? 1.0;
    const widthMul = PARTS.rims[rimIdx]?.vis?.rimStyle === 'dish' ? 1.12 : 1.0;
    const axleF = B.wheelbase / 2;
    const axleR = -B.wheelbase / 2;
    // keep the tyre face flush with (or just proud of) the bodywork
    const flareOut = (mods.frontBumper >= 2 || mods.rearBumper >= 2) ? 0.06 : 0.025;
    const wheelHalfTrack = Math.max(B.track / 2, hw - B.wheelW * 0.50) + flareOut * 0.5;
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
      // mirror the rim so it faces outward on both sides
      if (wheelPositions[i][1] < 0) w.rotation.y = Math.PI;
      this.group.add(holder);
      this.wheels.push({ grp: holder, spin: w, isFront, side: wheelPositions[i][1] > 0 ? 1 : -1, base: holder.position.clone() });
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

    const lampW = hw * 0.42, lampH = B.height * 0.075, lampD = 0.05;
    const noseX = B.length / 2;
    const headY = beltY * 0.66;
    for (const sgn of [1, -1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.07, lampH, lampW), headMat);
      hl.position.set(noseX - 0.20, headY, sgn * hw * 0.60);
      this.bodyGroup.add(hl); this.parts.push(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, lampH, lampW * 1.15), tailMat);
      tl.position.set(-noseX + 0.115, headY + 0.06, sgn * hw * 0.58);
      this.bodyGroup.add(tl); this.parts.push(tl);
      // reverse lamp
      const rv = new THREE.Mesh(new THREE.BoxGeometry(0.05, lampH * 0.30, lampW * 0.26), revMat);
      rv.position.set(-noseX + 0.10, headY - lampH * 0.05, sgn * hw * 0.26);
      this.bodyGroup.add(rv); this.parts.push(rv);
    }
    // third brake light
    const chmsl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, hw * 0.7), tailMat);
    chmsl.position.set(-noseX + 0.16, beltY + 0.10, 0);
    this.bodyGroup.add(chmsl); this.parts.push(chmsl);

    // ---- grille + bumper aero ----
    // the aero parts must sit on the actual panels, not at the belt line
    const hoodYAt = (x) => {
      const t = clamp((x - (noseX - B.hoodLen)) / Math.max(0.2, B.hoodLen), 0, 1);
      return profile.hoodNoseY + (profile.hoodCowlY - profile.hoodNoseY) * (1 - t);
    };
    const deckTop = profile.deckY;
    const fbStyle = PARTS.frontBumper[mods.frontBumper]?.vis?.frontBumper ?? 0;
    const rbStyle = PARTS.rearBumper[mods.rearBumper]?.vis?.rearBumper ?? 0;
    const trimMat = new THREE.MeshStandardMaterial({ color: '#14171b', roughness: 0.55, metalness: 0.35 });
    const carbonMat = new THREE.MeshPhysicalMaterial({ color: '#0c0e10', roughness: 0.3, metalness: 0.6, clearcoat: 1 });

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, B.height * 0.14, hw * 0.9), trimMat);
    grille.position.set(noseX - 0.06, beltY * 0.52, 0);
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

    // ---- mirrors ----
    for (const sgn of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), trimMat);
      arm.position.set(noseX - B.hoodLen + 0.06, beltY + 0.14, sgn * (hw * 0.92 + 0.05));
      this.bodyGroup.add(arm); this.parts.push(arm);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), bodyMat);
      mir.position.set(noseX - B.hoodLen + 0.04, beltY + 0.17, sgn * (hw * 0.92 + 0.13));
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
        tip.position.set(-noseX - 0.02, 0.20, z);
        this.bodyGroup.add(tip); this.parts.push(tip);
      }
    }

    // ---- interior (visible through glass) ----
    const interiorCol = PARTS.interiorColor[mods.interiorColor]?.vis?.interior || '#1b1d20';
    const interiorMat = new THREE.MeshStandardMaterial({ color: interiorCol, roughness: 0.8, metalness: 0.1 });
    const seatsStyle = PARTS.seats[mods.seats]?.vis?.seats ?? 0;
    for (const sgn of [1, -1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, seatsStyle === 2 ? 0.5 : 0.44, 0.44),
        seatsStyle === 1 ? new THREE.MeshStandardMaterial({ color: interiorCol, roughness: 0.6 }) : interiorMat);
      seat.position.set(-B.cabinLen * 0.12, beltY - 0.02, sgn * hw * 0.42);
      this.bodyGroup.add(seat); this.parts.push(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.10, seatsStyle === 2 ? 0.52 : 0.46, 0.42), interiorMat);
      back.position.set(-B.cabinLen * 0.12 - 0.24, beltY + 0.16, sgn * hw * 0.42);
      this.bodyGroup.add(back); this.parts.push(back);
    }
    // steering wheel
    const wheelStyle = PARTS.wheel[mods.wheel]?.vis?.wheel ?? 0;
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 12),
      new THREE.MeshStandardMaterial({ color: wheelStyle === 2 ? '#151719' : '#22262b', metalness: 0.3, roughness: 0.7 }));
    sw.position.set(noseX - B.hoodLen - 0.5, beltY + 0.16, hw * 0.42);
    sw.rotation.y = Math.PI / 2;
    this.bodyGroup.add(sw); this.parts.push(sw);
    // dash
    const dashStyle = PARTS.dash[mods.dash]?.vis?.dash ?? 0;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, hw * 1.5), interiorMat);
    dash.position.set(noseX - B.hoodLen - 0.30, beltY + 0.06, 0);
    this.bodyGroup.add(dash); this.parts.push(dash);
    if (dashStyle >= 1) {
      const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.2),
        new THREE.MeshStandardMaterial({ color: '#0a0c0e', emissive: new THREE.Color('#25e0d0'), emissiveIntensity: 0.7 }));
      gauge.position.set(noseX - B.hoodLen - 0.38, beltY + 0.18, hw * 0.42);
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
      // lowered cars: body drops, wheels stay
      w.spin.rotation.z = camber * (w.isFront ? 1 : 0.6) * w.side;
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

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.grp.rotation.y = w.isFront ? this.steer * 0.55 : 0;
      w.spin.rotation.x = this.wheelSpin;
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
