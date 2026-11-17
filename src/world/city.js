// ============================================================
// SAN VELOR — world assembly
// Grid city + ring highway + canyon + harbor + props + colliders
// ============================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { RNG, SpatialGrid, clamp } from '../core/util.js';
const clamp01 = (v) => clamp(v, 0, 1);
import { GRID, ROAD_HW, PAD, PAD_H, RING, RING_HW, BOUND, CANYON_GATE, blockCenters, districtOf, POIS, LOTS, GAS_STATIONS, canyonRoad } from './layout.js';
const BOUND_X = 560;
const BOUND_Z = 540;
import { GeoBatch, MATS, initMaterials, buildTower, buildShop, buildHouse, buildWarehouse, buildContainer,
  buildGasStation, buildMeetLot, buildDealership, buildTuneShop, buildCrane, buildShip, buildPalm,
  buildLampPost, buildTrafficLight, buildMountain, applyBoxUV, gableRoof } from './buildings.js';
import * as TEX from './textures.js';

const rng = new RNG(20040711);

export class City {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.colliders = new SpatialGrid(40);
    this.colliderList = [];
    this.lampPositions = [];
    this.trafficLights = [];
    this.wetZones = [];
    this.buildings = [];          // for minimap
    this.neonLights = [];
    this.meshes = [];
    this.decals = [];
    this._id = 0;
  }

  collider(minX, maxX, minZ, maxZ, height = 24, kind = 'building') {
    const fit = this._fitCollider(minX, maxX, minZ, maxZ, kind);
    if (!fit) return;
    minX = fit.minX; maxX = fit.maxX; minZ = fit.minZ; maxZ = fit.maxZ; kind = fit.kind;
    const c = { id: this._id++, minX, maxX, minZ, maxZ, height, kind, disabled: false };
    this.colliderList.push(c);
    this.colliders.insert(c);
    return c;
  }

  // Classify + fit a collider before it enters the world.
  //  - buildings are clamped to the block pad they belong to (so nothing ever
  //    sits on the carriageway);
  //  - a collider whose *own footprint* blocks the ring freeway, the canyon
  //    circuit or a race line is split: the part inside its block is kept and
  //    the violating part is dropped. If nothing survives, the object gets no
  //    collider at all (it is pure scenery);
  //  - small posts/poles are 'prop': the player can brush past them.
  _fitCollider(minX, maxX, minZ, maxZ, kind) {
    // barriers and the world edge are never trimmed or dropped
    if (kind === 'boundary' || kind === 'rail') return { minX, maxX, minZ, maxZ, kind };
    const w0 = maxX - minX, d0 = maxZ - minZ;
    if (w0 <= 1.3 && d0 <= 1.3) return { minX, maxX, minZ, maxZ, kind: 'prop' };
    // the block this collider belongs to (nearest pad centre)
    let bl = null, bestD = 1e9;
    for (const b of this._blockCache || (this._blockCache = blockCenters())) {
      const dd = Math.max(Math.abs((minX + maxX) / 2 - b.cx), Math.abs((minZ + maxZ) / 2 - b.cz));
      if (dd < bestD) { bestD = dd; bl = b; }
    }
    if (!bl) return { minX, maxX, minZ, maxZ, kind };
    const pad = bl.size / 2 + 3.2;
    const bx1 = bl.cx - pad, bx2 = bl.cx + pad, bz1 = bl.cz - pad, bz2 = bl.cz + pad;
    const x1 = Math.max(minX, bx1), x2 = Math.min(maxX, bx2);
    const z1 = Math.max(minZ, bz1), z2 = Math.min(maxZ, bz2);
    if (x2 - x1 < 1.2 || z2 - z1 < 1.2) return null;   // nothing inside its block
    const w = x2 - x1, d = z2 - z1;
    const big = Math.max(w, d);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const onCanyon = this._canyonOnTrack || (() => false);
    if (onCanyon(cx, cz, big / 2 + 1.5)) return null;
    if (Math.abs(Math.abs(cx) - RING) < RING_HW + 3 || Math.abs(Math.abs(cz) - RING) < RING_HW + 3) return null;
    for (const ev of this._events || []) {
      if (Math.hypot(cx - ev.x, cz - ev.z) < 7 + big / 2) return null;
      const pts = [[ev.x, ev.z], ...(ev.route || [])];
      for (const [px, pz] of pts) if (Math.hypot(cx - px, cz - pz) < 7 + big / 2) return null;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / l2));
        if (Math.hypot(cx - (ax + dx * t), cz - (az + dz * t)) < 7 + big / 2) return null;
      }
    }
    return { minX: x1, maxX: x2, minZ: z1, maxZ: z2, kind: kind === 'prop' && w > 3 && d > 3 ? 'building' : (kind || 'building') };
  }

  // merge a batch's colliders into the city grid (they're generated per-batch)
  _absorb(batch) {
    for (const c of batch.colliders) {
      // the landmass beyond the ring highway is scenery only: no collision,
      // otherwise the outer skyline boxes would sit on the coastal road
      if (c.maxX < -BOUND_X || c.minX > BOUND_X || c.maxZ < -BOUND_Z || c.minZ > BOUND_Z) continue;
      const fit = this._fitCollider(c.minX, c.maxX, c.minZ, c.maxZ, c.height >= 3 ? 'building' : 'prop');
      if (!fit) continue;
      const col = {
        id: this._id++, minX: fit.minX, maxX: fit.maxX, minZ: fit.minZ, maxZ: fit.maxZ,
        height: c.height ?? 20, kind: fit.kind, disabled: false,
      };
      this.colliderList.push(col);
      this.colliders.insert(col);
      if (col.kind === 'building') this._recordSilent(col);
    }
    batch.colliders.length = 0;
    return this;
  }

  build() {
    initMaterials();
    // compute canyon clearance first: every later pass consults it
    this._canyonTrack = canyonRoad();
    this._canyonOnTrack = this._makeCanyonTest();
    this._ground();
    this._roads();
    this._ring();
    this._blocks();
    this._harbor();
    this._canyon();
    this._mountains();
    this._props();
    this._floodLights();
    this._buildLampHalos();
    this._mapDebug();
    return this;
  }

  // ---------- ground / base terrain -------------------------------------
  _ground() {
    const b = new GeoBatch();
    const S = 1500;
    // base desert ground
    const g = new THREE.PlaneGeometry(S, S, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 70, uv.getY(i) * 70);
    b.push('dirt', g);

    // ocean plane
    const ocean = new THREE.PlaneGeometry(1500, 620, 1, 1);
    ocean.rotateX(-Math.PI / 2);
    const ouv = ocean.attributes.uv;
    for (let i = 0; i < ouv.count; i++) ouv.setXY(i, ouv.getX(i) * 30, ouv.getY(i) * 12);
    ocean.translate(0, -0.55, 470);
    b.push('water', ocean);

    // beach strip
    const beach = new THREE.PlaneGeometry(1100, 46);
    beach.rotateX(-Math.PI / 2);
    const buv = beach.attributes.uv;
    for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 40, buv.getY(i) * 2);
    beach.translate(0, 0.02, 438);
    b.push('concrete', beach);

    // grass patches in the hills
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PlaneGeometry(rng.range(70, 160), rng.range(70, 160));
      p.rotateX(-Math.PI / 2);
      const puv = p.attributes.uv;
      for (let k = 0; k < puv.count; k++) puv.setXY(k, puv.getX(k) * 12, puv.getY(k) * 12);
      p.translate(rng.range(-620, -300), 0.03, rng.range(-520, -120));
      b.push('grass', p);
    }
    b.build(this.group, { shadowKeys: new Set() });
    this._absorb(b);
  }

  // ---------- asphalt grid ----------------------------------------------
  _roads() {
    const b = new GeoBatch();
    const G = GRID;
    const halfW = ROAD_HW;
    const span = RING + 40;
    const sidewalkMat = 'sidewalk';

    // one plane per street (much cheaper than tiling quads)
    for (const x of G) {
      const g = new THREE.PlaneGeometry(span * 2, CONFIG.world.roadWidth);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (span * 2 / 12), uv.getY(i));
      g.translate(0, 0.01, x);
      b.push('asphalt', g);
    }
    for (const z of G) {
      const g = new THREE.PlaneGeometry(CONFIG.world.roadWidth, span * 2);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (span * 2 / 12));
      g.translate(z, 0.011, 0);
      b.push('asphalt', g);
    }
    // intersections (slightly above to avoid z-fighting)
    for (const x of G) for (const z of G) {
      const g = new THREE.PlaneGeometry(CONFIG.world.roadWidth, CONFIG.world.roadWidth);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * 1.4);
      g.translate(x, 0.012, z);
      b.push('asphalt', g);
    }

    // road markings: dashed centre lines along each street
    const mark = (axis, pos) => {
      const g = new THREE.PlaneGeometry(span * 2, 0.5);
      g.rotateX(-Math.PI / 2);
      if (axis === 'x') g.translate(0, 0.03, pos);
      else { g.translate(0, 0, 0); g.rotateY(Math.PI / 2); g.translate(pos, 0.03, 0); }
      return g;
    };
    // sidewalks + curbs around each block
    const blocks = blockCenters();
    for (const bl of blocks) {
      const s = bl.size + CONFIG.world.roadWidth;
      // pad
      const p = new THREE.BoxGeometry(s - 6.4, PAD_H, s - 6.4);
      applyBoxUV(p, s - 6.4, PAD_H, s - 6.4, 8, 8);
      p.translate(bl.cx, PAD_H / 2, bl.cz);
      b.push('sidewalk', p);
      // kerb outline
      const kc = new THREE.BoxGeometry(s - 6.0, PAD_H * 0.9, s - 6.0);
      kc.translate(bl.cx, PAD_H * 0.45, bl.cz);
      b.push('concrete', kc);
      // re-add the top surface above the kerb block
      const top = new THREE.PlaneGeometry(s - 6.4, s - 6.4);
      top.rotateX(-Math.PI / 2);
      const tuv = top.attributes.uv;
      for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * ((s - 6.4) / 8), tuv.getY(i) * ((s - 6.4) / 8));
      top.translate(bl.cx, PAD_H + 0.002, bl.cz);
      b.push('sidewalk', top);
    }

    // crosswalks at the 16 central intersections
    for (let i = 2; i < GRID.length - 2; i++) {
      for (let j = 2; j < GRID.length - 2; j++) {
        const x = GRID[i], z = GRID[j];
        for (const sgn of [1, -1]) {
          for (let s = 0; s < 3; s++) {
            const off = s * 0.9;
            const cw1 = new THREE.PlaneGeometry(0.6, CONFIG.world.roadWidth * 0.86);
            cw1.rotateX(-Math.PI / 2);
            cw1.translate(x + sgn * (halfW + 2 + off), 0.02, z);
            b.push('paintWhite', cw1);
            const cw2 = new THREE.PlaneGeometry(CONFIG.world.roadWidth * 0.86, 0.6);
            cw2.rotateX(-Math.PI / 2);
            cw2.translate(x, 0.02, z + sgn * (halfW + 2 + off));
            b.push('paintWhite', cw2);
          }
        }
      }
    }

    // street lamps along roads (outside the pad, on the kerb)
    const onCanyonLamp = this._canyonOnTrack || (() => false);
    for (const x of GRID) {
      for (let z = -RING; z <= RING; z += 52) {
        if (GRID.some((gz) => Math.abs(gz - z) < 14)) continue;
        if (onCanyonLamp(x - ROAD_HW - 1.5, z, 3) || onCanyonLamp(x + ROAD_HW + 1.5, z + 26, 3)) continue;
        buildLampPost(b, x - ROAD_HW - 1.5, z, -Math.PI / 2, this.lampPositions);
        buildLampPost(b, x + ROAD_HW + 1.5, z + 26, Math.PI / 2, this.lampPositions);
      }
    }
    for (const z of GRID) {
      for (let x = -RING; x <= RING; x += 52) {
        if (GRID.some((gx) => Math.abs(gx - x) < 14)) continue;
        if (onCanyonLamp(x, z - ROAD_HW - 1.5, 3) || onCanyonLamp(x + 26, z + ROAD_HW + 1.5, 3)) continue;
        buildLampPost(b, x, z - ROAD_HW - 1.5, Math.PI, this.lampPositions);
        buildLampPost(b, x + 26, z + ROAD_HW + 1.5, 0, this.lampPositions);
      }
    }
    // traffic lights at the main intersections
    for (let i = 2; i < GRID.length - 2; i++) {
      for (let j = 2; j < GRID.length - 2; j++) {
        const x = GRID[i], z = GRID[j];
        const rot = Math.PI;
        if (onCanyonLamp(x, z, 4)) continue;
        buildTrafficLight(b, x - ROAD_HW - 1.2, z - ROAD_HW - 1.2, rot, this.trafficLights);
        buildTrafficLight(b, x + ROAD_HW + 1.2, z + ROAD_HW + 1.2, 0, this.trafficLights);
      }
    }

    b.build(this.group, { shadowKeys: new Set(['sidewalk', 'concrete', 'asphalt']) });
    this._absorb(b);
  }

  // ---------- ring freeway ----------------------------------------------
  _ring() {
    const b = new GeoBatch();
    const R = RING, HW = RING_HW;
    const W = R + HW;
    // ring carriageway as four long planes with an inner hole (use boxes)
    const segs = [
      { x: 0, z: -W, w: W * 2 + HW * 2, d: HW * 2 },
      { x: 0, z: W, w: W * 2 + HW * 2, d: HW * 2 },
      { x: -W, z: 0, w: HW * 2, d: W * 2 },
      { x: W, z: 0, w: HW * 2, d: W * 2 },
    ];
    for (const s of segs) {
      const g = new THREE.PlaneGeometry(s.w, s.d);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (s.w / 12), uv.getY(i) * (s.d / 12));
      g.translate(s.x, 0.008, s.z);
      b.push('asphalt', g);
    }
    // guard rails + median barriers along the ring
    const rail = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      const g = new THREE.BoxGeometry(len, 0.85, 0.4);
      g.rotateY(-ang);
      g.translate((x1 + x2) / 2, 0.42, (z1 + z2) / 2);
      b.push('paintWhite', g);
      // collision (rails are long thin barriers: they must never be trimmed)
      this.collider(Math.min(x1, x2) - 0.3, Math.max(x1, x2) + 0.3, Math.min(z1, z2) - 0.3, Math.max(z1, z2) + 0.3, 1, 'rail');
    };
    // guard rails, with gaps where the city streets and the canyon road
    // actually cross the ring so the player can leave / rejoin the freeway
    const GAP = ROAD_HW + 4;
    const runs = (from, to, cuts) => {
      let segs2 = [[from, to]];
      for (const c of cuts) {
        // a cut is either a point (street) or an explicit [x1, x2] opening
        const lo = Array.isArray(c) ? c[0] : c - GAP;
        const hi = Array.isArray(c) ? c[1] : c + GAP;
        segs2 = segs2.flatMap(([a, b]) => {
          if (hi <= a || lo >= b) return [[a, b]];
          const out = [];
          if (lo > a) out.push([a, lo]);
          if (hi < b) out.push([hi, b]);
          return out;
        });
      }
      return segs2;
    };
    const inner = R - HW - 1.6, outer = R + HW + 1.6;
    const cutsX = [...GRID, [CANYON_GATE.x1, CANYON_GATE.x2]];
    const cutsZ = [...GRID, [CANYON_GATE.x1, CANYON_GATE.x2]];
    for (const [a, b] of runs(-inner, inner, cutsX)) rail(a, -inner, b, -inner);
    for (const [a, b] of runs(-inner, inner, cutsX)) rail(a, inner, b, inner);
    for (const [a, b] of runs(-inner, inner, cutsZ)) rail(-inner, a, -inner, b);

    for (const [a, b] of runs(-inner, inner, cutsZ)) rail(inner, a, inner, b);

    // outer world boundary walls (invisible-ish concrete barriers)
    this.collider(-560, 560, -520, -512, 6, 'boundary');
    this.collider(-560, 560, 512, 520, 6, 'boundary');
    this.collider(-560, -552, -520, 520, 6, 'boundary');
    this.collider(552, 560, -520, 520, 6, 'boundary');

    // overpasses at ring/grid intersections
    for (const x of [-180, 180]) {
      for (const z of [R, -R]) {
        const g = new THREE.BoxGeometry(22, 1.1, HW * 2 + 4);
        applyBoxUV(g, 22, 1.1, HW * 2 + 4, 10, 10);
        g.translate(x, 5.4, z);
        b.push('concrete', g);
        for (const sx of [-8, 8]) for (const sz of [-HW - 1, HW + 1]) {
          b.box('concrete', 1.6, 5.4, 1.6, x + sx, 0, z + sz);
          this.collider(x + sx - 0.8, x + sx + 0.8, z + sz - 0.8, z + sz + 0.8, 5.4);
        }
      }
    }
    // ring lamps
    for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const x = Math.cos(a) * (R + HW + 2.6), z = Math.sin(a) * (R + HW + 2.6);
      if (Math.abs(x) > 540 || Math.abs(z) > 540) continue;
      b.cyl('darkMetal', 0.13, 0.18, 9, x, 0, z, 5);
      const head = new THREE.BoxGeometry(0.9, 0.18, 0.4);
      head.translate(x, 8.9, z);
      b.push('lampHead', head);
      this.lampPositions.push({ x, z, y: 8.8 });
    }
    b.build(this.group, { shadowKeys: new Set(['concrete']) });
    this._absorb(b);
  }

  // ---------- blocks & buildings ----------------------------------------
  _blocks() {
    const b = new GeoBatch();
    const blocks = blockCenters();
    // land use by district
    for (const bl of blocks) {
      const dist = districtOf(bl.cx, bl.cz);
      if (this._blockIsOpen(bl)) { this._lotBlock(b, bl, dist); continue; }
      const pad = bl.size - 6.4;
      const half = pad / 2;
      if (dist === 'downtown') this._downtownBlock(b, bl, half);
      else if (dist === 'nightlife') this._nightlifeBlock(b, bl, half);
      else if (dist === 'industrial') this._industrialBlock(b, bl, half);
      else if (dist === 'hills') this._hillsBlock(b, bl, half);
      else if (dist === 'residential') this._resBlock(b, bl, half);
      else if (dist === 'harbor') this._harborBlock(b, bl, half);
      else if (dist === 'autos') this._autosBlock(b, bl, half);
      else this._midtownBlock(b, bl, half);
      // palms along the block edges
      if (dist !== 'downtown' && dist !== 'industrial') {
        const n = 2;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          buildPalm(b, bl.cx - half - 1.6, bl.cz - half + pad * t, bl.street ** 2 + i);
          buildPalm(b, bl.cx + half + 1.6, bl.cz - half + pad * t, bl.street ** 2 + i + 7);
        }
      }
    }
    b.build(this.group, { shadowKeys: new Set(['facade:glass1', 'facade:office1', 'facade:brick1']) });
    this._absorb(b);
  }

  // A block stays open (paved, no buildings) only when a landmark, event start
  // or route checkpoint genuinely sits inside it. Keeping this strict matters:
  // an over-eager test here paves the whole city.
  _blockIsOpen(bl) {
    const inner = bl.size / 2 - 2;               // the buildable core of the block
    const inside = (x, z) => Math.abs(x - bl.cx) <= inner && Math.abs(z - bl.cz) <= inner;
    for (const key of Object.keys(POIS)) { const p = POIS[key]; if (inside(p.x, p.z)) return true; }
    for (const l of LOTS) if (inside(l.x, l.z)) return true;
    for (const g of GAS_STATIONS) if (inside(g.x, g.z)) return true;
    for (const ev of this._events || []) {
      if (inside(ev.x, ev.z)) return true;
      const pts = [[ev.x, ev.z], ...(ev.route || [])];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          if (inside(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
        }
      }
    }
    return false;
  }

  // inside a named lot (plus margin)? used to keep scatter props out of them
  _inLot(x, z, pad = 0) {
    for (const l of LOTS) {
      if (Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(z - l.z) < l.d / 2 + pad) return true;
    }
    return false;
  }

  _record(bld) { this.buildings.push(bld); }

  // keep the minimap footprint list in sync with the real collision geometry
  _recordSilent(col) {
    const w = col.maxX - col.minX, d = col.maxZ - col.minZ;
    if (w < 4 || d < 4) return;
    const key = `${Math.round(col.minX)},${Math.round(col.minZ)},${Math.round(w)},${Math.round(d)}`;
    if (this._bpKeys && this._bpKeys.has(key)) return;
    (this._bpKeys || (this._bpKeys = new Set())).add(key);
    this.buildings.push({
      x: (col.minX + col.maxX) / 2, z: (col.minZ + col.maxZ) / 2,
      w, d, h: col.height, kind: 'building', color: col.height > 40 ? '#3b4a58' : '#4a443c',
    });
  }

  _downtownBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    const lots = [[-half / 2, -half / 2], [half / 2, -half / 2], [-half / 2, half / 2], [half / 2, half / 2]];
    let idx = 0;
    for (const [ox, oz] of lots) {
      const w = half * rng.range(0.72, 0.95);
      const d = half * rng.range(0.72, 0.95);
      const h = rng.range(34, 108) * (1 - Math.hypot(ox, oz) / (half * 3));
      const x = cx + ox, z = cz + oz;
      const kind = rng.chance(0.55) ? 'glass' : 'office';
      const top = buildTower(b, x, z, w, d, Math.max(22, h), 300 + idx + bl.i * 13 + bl.j * 29, kind);
      this._record({ x, z, w: w * 0.95, d: d * 0.95, h: top, kind: 'building', color: kind === 'glass' ? '#2d404f' : '#3b3d42' });
      idx++;
      if (rng.chance(0.55)) {
        // small shop podium on the corner
        buildShop(b, cx + ox * 1.55, cz + oz * 1.55, 12, 9, 5.5, 100 + idx + bl.i, 'neon');
      }
    }
  }

  _nightlifeBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    // two big neon-fronted venues per block
    const venues = [
      { x: cx - half * 0.5, z: cz - half * 0.3, w: half * 0.92, d: half * 0.8 },
      { x: cx + half * 0.52, z: cz + half * 0.34, w: half * 0.8, d: half * 0.72 },
    ];
    for (const v of venues) {
      const h = rng.range(9, 20);
      buildShop(b, v.x, v.z, v.w, v.d, h, 210 + Math.round(v.x) + Math.round(v.z), 'neon');
      this._record({ x: v.x, z: v.z, w: v.w, d: v.d, h, kind: 'building', color: '#3a2a42' });
      // roof neon sign
      const cols = ['neon:pink', 'neon:cyan', 'neon:purple', 'neon:amber'];
      const tip = new THREE.Mesh(new THREE.BoxGeometry(v.w * 0.6, 1.8, 0.3), MATS.neonGlow[cols[Math.abs(Math.round(v.x)) % 4].slice(5)]);
      tip.position.set(v.x, h + 1.6, v.z - v.d / 2 - 0.2);
      this.group.add(tip);
      this._neonLight(v.x, h + 1.6, v.z - v.d / 2 - 1, cols[Math.abs(Math.round(v.x)) % 4].slice(5));
      // canopy
      b.boxAt('darkMetal', v.w * 0.7, 0.2, 3, v.x, 4.0, v.z + v.d / 2 + 1.4);
      // queue barrier posts
      for (let i = 0; i < 5; i++) b.cyl('metal', 0.06, 0.06, 1.0, v.x - 4 + i * 2, 0.17, v.z + v.d / 2 + 3, 5);
    }
    buildPalm(b, cx - half - 1.5, cz + half * 0.6, 91);
    buildPalm(b, cx + half + 1.5, cz - half * 0.6, 92);
  }

  _industrialBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    const w = half * rng.range(1.3, 1.7), d = half * rng.range(1.0, 1.5);
    const x = cx + rng.range(-4, 4), z = cz + rng.range(-4, 4);
    const h = rng.range(7, 14);
    buildWarehouse(b, x, z, w, d, h, 500 + bl.i * 7 + bl.j * 11);
    this._record({ x, z, w, d, h, kind: 'building', color: '#4a453c' });
    // open yard with containers
    const yardX = cx + (rng.chance(0.5) ? -1 : 1) * half * 0.75;
    for (let i = 0; i < 5; i++) {
      const cw = 3.2, cd = 7.5;
      const px = yardX + rng.range(-8, 8), pz = cz + rng.range(-half * 0.8, half * 0.8);
      if (this._inLot(px, pz, 6)) continue;
      buildContainer(b, px, pz, cw, cd, 2.6, i, bl.i + i);
      if (rng.chance(0.4)) buildContainer(b, px, pz, cw, cd, 2.6, i + 9, bl.j + i, 2.6);
    }
    b.plane('concrete', half * 2.1, half * 2.0, cx, PAD_H + 0.01, cz);
  }

  _hillsBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    // sparse canyon-side houses + rocks
    for (let i = 0; i < 3; i++) {
      const x = cx + rng.range(-half * 0.7, half * 0.7);
      const z = cz + rng.range(-half * 0.7, half * 0.7);
      buildHouse(b, x, z, rng.range(8, 12), rng.range(8, 12), 700 + bl.i * 3 + i + bl.j * 17, rng.range(-0.3, 0.3));
      this._record({ x, z, w: 10, d: 10, h: 4, kind: 'building', color: '#5c5246' });
    }
    for (let i = 0; i < 6; i++) {
      const s = rng.range(1.2, 3.4);
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.translate(cx + rng.range(-half, half), s * 0.6, cz + rng.range(-half, half));
      b.push('rock', g);
    }
  }

  _resBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    // 4 houses around a small court
    const positions = [
      [-half * 0.5, -half * 0.45], [half * 0.5, -half * 0.45],
      [-half * 0.5, half * 0.45], [half * 0.5, half * 0.45],
    ];
    let i = 0;
    for (const [ox, oz] of positions) {
      const x = cx + ox, z = cz + oz;
      buildHouse(b, x, z, rng.range(8.5, 12), rng.range(8, 11), 800 + bl.i * 5 + i + bl.j * 3);
      this._record({ x, z, w: 10, d: 10, h: 4.5, kind: 'building', color: '#6a5c4c' });
      i++;
    }
    buildPalm(b, cx, cz, 61 + bl.i);
  }

  _harborBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    if (cz < 320) {
      // warehouse + containers
      buildWarehouse(b, cx, cz, half * 1.5, half * 1.3, rng.range(8, 13), 900 + bl.i * 4 + bl.j);
      this._record({ x: cx, z: cz, w: half * 1.4, d: half * 1.2, h: 10, kind: 'building', color: '#4c4a44' });
      for (let i = 0; i < 6; i++) buildContainer(b, cx + rng.range(-half, half), cz + rng.range(-half * 0.9, half * 0.9), 3.2, 7.5, 2.6, i, i + bl.i);
    } else {
      // quay-side container stacks
      for (let i = 0; i < 10; i++) {
        const px = cx + Math.round(rng.range(-half, half) / 3.4) * 3.4;
        const pz = cz + rng.range(-half * 0.85, half * 0.85);
        for (let lvl = 0; lvl < (rng.chance(0.5) ? 2 : 1); lvl++) {
          buildContainer(b, px, pz, 3.2, 7.5, 2.6, i + lvl, i + lvl + bl.i);
        }
      }
      b.plane('concrete', half * 2.1, half * 2.0, cx, PAD_H + 0.02, cz);
    }
  }

  _autosBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    // auto parts stores, tyre shops, small showrooms
    const styles = ['neon', 'neon', 'stucco'];
    const kinds = ['facade:warehouse1', 'facade:stucco2', 'facade:neon2'];
    const x = cx - half * 0.35, z = cz - half * 0.3;
    const h = rng.range(6, 10);
    buildShop(b, x, z, half * 1.2, half * 0.9, h, 1100 + bl.i * 7 + bl.j * 5, 'neon');
    this._record({ x, z, w: half * 1.2, d: half * 0.9, h, kind: 'building', color: '#3c3640' });
    // big sign
    b.boxAt('darkMetal', half * 0.9, 3.2, 0.5, x, h + 1.6, z);
    b.boxAt('neon:cyan', half * 0.7, 1.4, 0.1, x, h + 1.8, z + 0.32);
    // tyre stacks in the yard
    for (let i = 0; i < 7; i++) {
      const tx = cx + rng.range(-half, half * 0.2), tz = cz + half * 0.45 + rng.range(-3, 3);
      for (let l = 0; l < rng.int(1, 3); l++) {
        const tg = new THREE.TorusGeometry(0.42, 0.16, 5, 10);
        tg.rotateX(Math.PI / 2);
        tg.translate(tx, 0.32 + l * 0.34, tz);
        b.push('tire', tg);
      }
    }
    b.plane('concrete', half * 1.8, half * 0.8, cx, PAD_H + 0.01, cz + half * 0.5);
  }

  _midtownBlock(b, bl, half) {
    const cx = bl.cx, cz = bl.cz;
    const x = cx, z = cz;
    const w = half * rng.range(1.0, 1.4), d = half * rng.range(0.9, 1.3);
    const h = rng.range(12, 32);
    const kind = rng.chance(0.5) ? 'office' : 'brick';
    buildTower(b, x, z, w, d, h, 1300 + bl.i * 11 + bl.j * 7, kind);
    this._record({ x, z, w, d, h, kind: 'building', color: kind === 'brick' ? '#5b4034' : '#3f4247' });
    // second smaller structure
    if (rng.chance(0.7)) {
      buildShop(b, cx - half * 0.7, cz + half * 0.7, half * 0.6, half * 0.5, 5, 1400 + bl.i, 'neon');
    }
  }

  _lotBlock(b, bl, dist) {
    const cx = bl.cx, cz = bl.cz;
    const half = (bl.size - 6.4) / 2;
    b.plane('concrete', half * 2, half * 2, cx, PAD_H + 0.015, cz);
  }

  // ---------- named lots & landmarks ------------------------------------
  _props() {
    const b = new GeoBatch();
    const mk = (id, fn) => fn(POIS[id]);

    // home garage
    const hg = POIS.homeGarage;
    // the building sits north of the lot, the forecourt faces the street
    buildTuneShop(b, hg.x, hg.z + 24, 26, 18, 6, 4242);
    this._record({ x: hg.x, z: hg.z + 24, w: 26, d: 18, h: 7, kind: 'building', color: '#4c4a44' });
    // interior bay floor
    b.plane('concrete', 24, 16, hg.x, PAD_H + 0.02, hg.z - 4);
    // driveway
    b.plane('concrete', 16, 22, hg.x, 0.03, hg.z + 8);
    // tool benches
    b.box('darkMetal', 3, 0.9, 0.7, hg.x + 8, 0.15, hg.z - 16);
    b.box('rustMetal', 2.4, 1.8, 0.6, hg.x - 9, 0.15, hg.z - 16);
    // garage neon
    b.boxAt('neon:teal' === 'neon:teal' ? 'neon:cyan' : 'neon:cyan', 12, 1.1, 0.18, hg.x, 6.2, hg.z - 17.1);
    this._neonLight(hg.x, 5.5, hg.z - 14, 'cyan', 3.0);

    // tuner shop (Torque Lab)
    const ts = POIS.tuneShop;
    const tuneW = 26, tuneD = 14;
    buildTuneShop(b, ts.x, ts.z + 20, tuneW, tuneD, 5, 555);
    this._record({ x: ts.x, z: ts.z + 20, w: tuneW, d: tuneD, h: 7, kind: 'building', color: '#4a4640' });
    b.plane('concrete', 34, 34, ts.x, 0.02, ts.z + 22);
    // display cars outside
    b.box('darkMetal', 6, 0.2, 3, ts.x + 12, 0.17, ts.z + 24);
    b.boxAt('neon:amber', 10, 0.9, 0.16, ts.x, 7.2, ts.z + 11.2);
    this._neonLight(ts.x, 6.5, ts.z + 14, 'amber', 4);

    // dealership
    const dl = POIS.dealer;
    buildDealership(b, dl.x, dl.z - 12, 34, 26, 77);
    this._record({ x: dl.x, z: dl.z - 12, w: 34, d: 26, h: 6, kind: 'building', color: '#33383e' });
    b.plane('concrete', 36, 26, dl.x, 0.02, dl.z + 14);
    this._neonLight(dl.x, 5, dl.z + 4, 'cyan', 5);

    // gas stations
    for (let i = 0; i < GAS_STATIONS.length; i++) {
      const gs = GAS_STATIONS[i];
      buildGasStation(b, gs.x, gs.z, 30 + i);
      this._record({ x: gs.x, z: gs.z, w: 20, d: 14, h: 5, kind: 'building', color: '#5a5a58' });
      this._neonLight(gs.x, 5, gs.z, 'red', 6);
      this.wetZones.push({ x: gs.x, z: gs.z, r: 11, grip: 0.985 });
    }

    // meets — the dock meet sits on the quay clear of the harbor sheds
    const meetDockLot = LOTS.find((l) => l.id === 'meetDockLot');
    buildMeetLot(b, meetDockLot.x, meetDockLot.z, meetDockLot.w, meetDockLot.d, 31);
    this._neonLight(meetDockLot.x, 9, meetDockLot.z, 'pink', 6);
    b.plane('concrete', meetDockLot.w + 8, meetDockLot.d + 8, meetDockLot.x, PAD_H + 0.01, meetDockLot.z);
    const meetPalm = LOTS.find((l) => l.id === 'meetPalmLot');
    buildMeetLot(b, meetPalm.x, meetPalm.z, meetPalm.w, meetPalm.d, 41);
    this._neonLight(meetPalm.x, 9, meetPalm.z, 'purple', 6);
    b.plane('concrete', meetPalm.w + 8, meetPalm.d + 8, meetPalm.x, PAD_H + 0.01, meetPalm.z);

    // drift yard
    const dyl = LOTS.find((l) => l.id === 'driftLot');
    b.plane('concrete', dyl.w, dyl.d, dyl.x, PAD_H + 0.02, dyl.z);
    for (let i = 0; i < 26; i++) {
      const coneX = dyl.x + rng.range(-dyl.w * 0.45, dyl.w * 0.45);
      const coneZ = dyl.z + rng.range(-dyl.d * 0.42, dyl.d * 0.42);
      b.cyl('neon:amber', 0.05, 0.22, 0.7, coneX, PAD_H + 0.02, coneZ, 6);
      // tyre stacks marking the course
      if (i % 4 === 0) {
        for (let l = 0; l < 2; l++) {
          const tg = new THREE.TorusGeometry(0.44, 0.17, 5, 10);
          tg.rotateX(Math.PI / 2);
          tg.translate(coneX, PAD_H + 0.32 + l * 0.34, coneZ);
          b.push('tire', tg);
        }
        this.collider(coneX - 0.6, coneX + 0.6, coneZ - 0.6, coneZ + 0.6, 0.8, 'prop');
      }
    }
    this._neonLight(dyl.x, 4, dyl.z, 'amber', 4);

    // parking garage (multi-deck)
    const pg = LOTS.find((l) => l.id === 'parkGarage');
    for (let lvl = 0; lvl < 3; lvl++) {
      const y = lvl * 3.2;
      b.box('concrete', pg.w, 0.4, pg.d, pg.x, y, pg.z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.box('concrete', 1.0, 3.2, 1.0, pg.x + sx * (pg.w / 2 - 1), y, pg.z + sz * (pg.d / 2 - 1));
      }
      // low walls
      b.box('concrete', pg.w, 0.9, 0.4, pg.x, y + 0.4, pg.z - pg.d / 2 + 0.2);
      b.box('concrete', pg.w, 0.9, 0.4, pg.x, y + 0.4, pg.z + pg.d / 2 - 0.2);
      if (lvl === 2) {
        b.box('concrete', pg.w, 0.3, pg.d, pg.x, y + 3.2, pg.z);
      }
      // fluorescent strips
      b.boxAt('neon:white', pg.w * 0.7, 0.12, 0.3, pg.x, y + 3.0, pg.z);
    }
    this.collider(pg.x - pg.w / 2, pg.x - pg.w / 2 + 1.4, pg.z - pg.d / 2, pg.z + pg.d / 2, 10);
    this.collider(pg.x + pg.w / 2 - 1.4, pg.x + pg.w / 2, pg.z - pg.d / 2, pg.z + pg.d / 2, 10);
    this.collider(pg.x - pg.w / 2, pg.x + pg.w / 2, pg.z - pg.d / 2, pg.z - pg.d / 2 + 1.4, 10);
    this.collider(pg.x - pg.w / 2, pg.x + pg.w / 2, pg.z + pg.d / 2 - 1.4, pg.z + pg.d / 2, 10);
    // ground level parking = empty entrance on +x side
    b.boxAt('neon:cyan', 6, 0.8, 0.2, pg.x, 3.4, pg.z + pg.d / 2 + 0.1);

    // event start markers get physical arches
    this._eventArches(b);

    // world trees in the park-like areas
    const onCanyon = this._canyonOnTrack || (() => false);
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-480, 480), z = rng.range(-480, 480);
      if (this._onRoad(x, z) || this._nearBlock(x, z) || onCanyon(x, z, 4)) continue;
      buildPalm(b, x, z, 9000 + i);
    }
    b.build(this.group, { shadowKeys: new Set(['concrete']) });
    this._absorb(b);
  }

  _eventArches(b) {
    // EVENTS imported lazily to avoid an import cycle at module load
    const events = this._events || [];
    const onCanyon = this._canyonOnTrack || (() => false);
    for (const ev of events) {
      // the canyon run gets its own start gantry, built with the road surface
      if (onCanyon(ev.x, ev.z, 6)) continue;
      const rot = ev.heading || 0;
      for (const sgn of [1, -1]) {
        const ox = Math.cos(rot) * 0 + Math.sin(rot) * sgn * 7.5;
        const oz = Math.cos(rot) * sgn * 7.5;
        b.cyl('darkMetal', 0.22, 0.3, 7.5, ev.x + ox, 0.02, ev.z + oz, 8);
        this.collider(ev.x + ox - 0.4, ev.x + ox + 0.4, ev.z + oz - 0.4, ev.z + oz + 0.4, 7.5, 'prop');
      }
      const banner = new THREE.BoxGeometry(0.2, 1.4, 15.5);
      banner.rotateY(rot);
      banner.translate(ev.x, 6.9, ev.z);
      b.push('neon:amber', banner);
      this._neonLight(ev.x, 6.5, ev.z, 'amber', 3.5);
    }
  }

  _harbor() {
    const b = new GeoBatch();
    const MEET = LOTS.find((l) => l.id === 'meetDockLot');
    // the quay strip around the meet and the harbor streets must stay open
    const keepClear = (x, z, pad = 10) =>
      Math.abs(x - MEET.x) < MEET.w / 2 + pad && Math.abs(z - MEET.z) < MEET.d / 2 + pad;
    // piers
    for (const px of [-330, -120, 90, 300]) {
      const g = new THREE.BoxGeometry(26, 1.2, 110);
      applyBoxUV(g, 26, 1.2, 110, 12, 12);
      g.translate(px, 0.2, 468);
      b.push('concrete', g);
      // pilings
      for (let i = 0; i < 9; i++) {
        for (const s of [-1, 1]) {
          b.cyl('rustMetal', 0.35, 0.4, 10, px + s * 11, -5, 420 + i * 12, 6);
        }
      }
    }
    // dock cranes
    buildCrane(b, -260, 400, 11);
    buildCrane(b, 0, 420, 12);
    buildCrane(b, 260, 410, 13);
    // moored ships
    buildShip(b, -420, 470, 150, 26, 21);
    buildShip(b, 420, 478, 130, 24, 22);
    // warehouses along the quay + collision
    for (const x of [-360, -240, -120, 0, 120, 360]) {
      if (Math.abs(x - POIS.meetDock.x) < 100) continue;
      buildWarehouse(b, x, 356, 52, 34, 12, 6100 + Math.round(x));
      this._record({ x, z: 356, w: 52, d: 34, h: 12, kind: 'building', color: '#4c4a44' });
    }
    // shipping container maze on the quay edge (outside the meet apron and
    // clear of the coastal street at z = 420)
    for (let i = 0; i < 34; i++) {
      const x = rng.range(-460, 460);
      const z = rng.range(432, 448);
      if (keepClear(x, z, 6) || GRID.some((g) => Math.abs(x - g) < ROAD_HW + 8)) continue;
      buildContainer(b, x, z, 3.4, 8, 2.7, i, i);
      if (rng.chance(0.5)) buildContainer(b, x, z, 3.4, 8, 2.7, i + 3, i + 2, 2.7);
    }
    // breakwater
    for (let i = 0; i < 40; i++) {
      const x = -560 + i * 28;
      const g = new THREE.DodecahedronGeometry(rng.range(3, 6), 0);
      g.translate(x, rng.range(0, 2), 512);
      b.push('rock', g);
    }
    b.build(this.group, { shadowKeys: new Set(['concrete']) });
    this._absorb(b);
  }

  // is (x,z) on (or within pad of) the canyon carriageway?
  _makeCanyonTest() {
    const pts = this._canyonTrack || canyonRoad();
    return (x, z, pad = 0) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1];
        const dx = c.x - a.x, dz = c.z - a.z;
        const len2 = dx * dx + dz * dz || 1;
        let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + dx * t, pz = a.z + dz * t;
        if (Math.hypot(x - px, z - pz) < 8.5 + pad) return true;
      }
      return false;
    };
  }

  _canyon() {
    const b = new GeoBatch();
    const pts = this._canyonTrack || canyonRoad();
    const onTrack = this._canyonOnTrack;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const len = Math.hypot(c.x - a.x, c.z - a.z) + 2;
      const ang = Math.atan2(c.z - a.z, c.x - a.x);
      const g = new THREE.PlaneGeometry(len, 15);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / 12), uv.getY(k) * 1.2);
      g.rotateY(-ang);
      g.translate((a.x + c.x) / 2, 0.05, (a.z + c.z) / 2);
      b.push('asphalt', g);
      // apron / runoff so the joins between segments read as one surface
      const apron = new THREE.CircleGeometry(9, 10);
      apron.rotateX(-Math.PI / 2);
      apron.translate(a.x, 0.048, a.z);
      b.push('asphalt', apron);
      // guard rail on the outside
      const rg = new THREE.BoxGeometry(len, 0.7, 0.3);
      rg.rotateY(-ang);
      const nx = -Math.sin(ang) * 8, nz = Math.cos(ang) * 8;
      rg.translate((a.x + c.x) / 2 + nx, 0.45, (a.z + c.z) / 2 + nz);
      b.push('paintWhite', rg);
      // cliff wall on the inside — placed well clear of the carriageway
      for (let k = 0; k < 2; k++) {
        const t = k / 2;
        const s = rng.range(4, 8);
        const push = 12 + s * 0.8;
        const px = a.x + (c.x - a.x) * t - nx * (push / 8);
        const pz = a.z + (c.z - a.z) * t - nz * (push / 8);
        if (onTrack(px, pz, 1.5)) continue;
        const geo = new THREE.DodecahedronGeometry(s, 0);
        geo.scale(1, rng.range(0.8, 1.8), 1);
        geo.translate(px, s * 0.3, pz);
        b.push('rock', geo);
        this.collider(px - s * 0.42, px + s * 0.42, pz - s * 0.42, pz + s * 0.42, s, 'prop');
      }
    }
    // link apron joining the canyon mouth to the ring highway
    const g2 = new THREE.PlaneGeometry(46, 16);
    g2.rotateX(-Math.PI / 2);
    g2.rotateY(Math.PI / 2);
    g2.translate(-431, 0.045, -470);
    b.push('asphalt', g2);
    b.build(this.group, { shadowKeys: new Set() });
    this._absorb(b);
  }

  _mountains() {
    const b = new GeoBatch();
    const onCanyon = this._canyonOnTrack || (() => false);
    const spots = [
      [-600, -560, 150, 170], [-720, -720, 210, 250], [-450, -800, 180, 210],
      [-250, -860, 200, 230], [-820, -300, 190, 200], [-900, -620, 240, 300],
      [700, -700, 200, 220], [900, -380, 180, 190], [860, 120, 160, 170],
      [-880, 260, 170, 180], [200, -900, 220, 250], [500, -880, 180, 200],
    ];
    let i = 0;
    for (const [x, z, r, h] of spots) {
      // keep the drivable canyon road out of the mountains' footprint
      if (onCanyon(x, z, r)) continue;
      buildMountain(b, x, z, r, h, 3000 + i);
      i++;
    }
    // distant ridge silhouettes
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const r = 1050;
      buildMountain(b, Math.cos(a) * r, Math.sin(a) * r, rng.range(120, 220), rng.range(120, 260), 4000 + k);
    }
    b.build(this.group, { shadowKeys: new Set() });
    this._absorb(b);
  }

  _floodLights() {
    // a pool of point lights near the player, recycled as they move
    this.lampLights = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight('#ffcf8a', 0, 40, 1.7);
      l.visible = false;
      this.scene.add(l);
      this.lampLights.push(l);
    }
    // neon accent lights at fixed landmarks (few, always on at night)
    this.neonLights.forEach(({ pos, color, intensity }) => {
      // positioned already; no actual THREE light to save budget
    });
  }

  _neonLight(x, y, z, colorName, intensity = 4) {
    const colors = { cyan: '#25e0d0', pink: '#ff2f92', amber: '#ffb300', purple: '#a56bff', red: '#ff3b30', white: '#e8f4ff' };
    this.neonLights.push({ pos: new THREE.Vector3(x, y, z), color: colors[colorName] || '#ffffff', intensity });
    // glow sprite for the sign itself
    const spr = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        color: colors[colorName] || '#ffffff', transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    spr.position.set(x, y, z);
    spr.userData.billboard = true;
    this.group.add(spr);
    this._neonSprites = this._neonSprites || [];
    this._neonSprites.push(spr);
  }

  _mapDebug() {}

  // ---------- helpers ---------------------------------------------------
  _onRoad(x, z) {
    for (const g of GRID) if (Math.abs(x - g) < ROAD_HW + 2 || Math.abs(z - g) < ROAD_HW + 2) return true;
    if (Math.abs(x) > RING - RING_HW - 6 && Math.abs(x) < RING + RING_HW + 6) return true;
    if (Math.abs(z) > RING - RING_HW - 6 && Math.abs(z) < RING + RING_HW + 6) return true;
    return false;
  }

  _nearBlock(x, z) {
    for (const bl of blockCenters()) {
      const h = bl.size / 2 + 10;
      if (Math.abs(x - bl.cx) < h && Math.abs(z - bl.cz) < h) return true;
    }
    return false;
  }

  surfaceGrip(x, z) {
    // harbour quay, sand and wet zones have less grip
    if (z > 424) return 0.94;
    for (const w of this.wetZones) {
      if (Math.hypot(x - w.x, z - w.z) < w.r) return w.grip;
    }
    return 1;
  }

  // dynamic light recycling for street lamps
  updateLights(night, camera, qualityLampCount = 4) {
    if (!this.lampLights) return;
    // the visible halo around each lamp head, so the light has a source
    if (this._lampHalo) {
      this._lampHalo.visible = night > 0.25;
      this._lampHalo.material.opacity = 0.10 + night * 0.34;
    }
    // windows light up after dusk (the emissive maps are baked per facade)
    const glow = clamp01((night - 0.12) / 0.6);
    if (this._facadeGlow !== glow) {
      this._facadeGlow = glow;
      const facades = MATS.facades || {};
      for (const k in facades) {
        facades[k].emissiveIntensity = glow * 1.35;
        facades[k].needsUpdate = false;
      }
      if (MATS.lampHead) MATS.lampHead.emissiveIntensity = 0.5 + glow * 1.6;
      for (const m of [MATS.tlRed, MATS.tlGreen, MATS.tlAmber]) {
        if (m) m.emissiveIntensity = 0.55 + glow * 1.1;
      }
    }
    const camX = camera.position.x, camZ = camera.position.z;
    if (night < 0.35) {
      for (const l of this.lampLights) l.visible = false;
      return;
    }
    // nearest lamps
    const n = qualityLampCount;
    if (!this._lampSorted || this._lampFrame++ % 12 === 0) {
      this._lampFrame = 1;
      const arr = [];
      const lamps = this.lampPositions;
      const step = Math.max(1, Math.floor(lamps.length / 220));
      for (let i = 0; i < lamps.length; i += step) {
        const l = lamps[i];
        const d = (l.x - camX) ** 2 + (l.z - camZ) ** 2;
        arr.push({ l, d });
      }
      arr.sort((a, b) => a.d - b.d);
      this._lampSorted = arr.slice(0, n).map((a) => a.l);
    }
    for (let i = 0; i < this.lampLights.length; i++) {
      const light = this.lampLights[i];
      const src = this._lampSorted[i];
      if (src && i < n) {
        light.position.set(src.x, src.y || 6.8, src.z);
        light.intensity = night * 6.5;
        light.distance = 40;
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  }

  // one batched additive quad per lamp head: reads as a glow at night
  _buildLampHalos() {
    const lamps = this.lampPositions;
    if (!lamps.length) return;
    const geo = new THREE.PlaneGeometry(2.4, 2.4);
    const pos = new Float32Array(lamps.length * 3);
    const uv = new Float32Array(lamps.length * 2);
    const index = [];
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      pos[i * 3] = l.x; pos[i * 3 + 1] = (l.y || 6.9) + 0.1; pos[i * 3 + 2] = l.z;
      uv[i * 2] = 0; uv[i * 2 + 1] = 0;
    }
    // instanced quads are simpler and cheaper than merging: one InstancedMesh
    const inst = new THREE.InstancedMesh(geo, MATS.lampGlow, lamps.length);
    const m = new THREE.Matrix4();
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      m.makeTranslation(l.x, (l.y || 6.9) + 0.12, l.z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    inst.visible = false;
    this.group.add(inst);
    this._lampHalo = inst;
  }

  update(dt, camera) {
    // billboard neon sprites
    if (this._neonSprites && camera) {
      for (const s of this._neonSprites) s.lookAt(camera.position);
    }
  }
}
