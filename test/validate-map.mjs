// ============================================================
// Map validator — guarantees every landmark, checkpoint and spawn is
// reachable and not buried in geometry. Run: node test/validate-map.mjs
// ============================================================
const cvs = () => {
  const ctx = {
    canvas: { width: 256, height: 256 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 10 }),
  };
  for (const m of ['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate',
    'rotate', 'scale', 'drawImage', 'fillText', 'putImageData', 'setTransform', 'clip']) ctx[m] = () => {};
  return { width: 256, height: 256, style: {}, getContext: () => ctx };
};
global.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 };
global.document = {
  createElement: (t) => (t === 'canvas' ? cvs() : { style: {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
};

const THREE = await import('three');
const { City } = await import('../src/world/city.js');
const { Settings } = await import('../src/core/settings.js');
const { EVENTS, POIS, LOTS, GAS_STATIONS, spawnPoint, GRID, ROAD_HW, RING, RING_HW, blockCenters, canyonRoad } = await import('../src/world/layout.js');

const city = new City(new THREE.Scene(), new Settings());
city._events = EVENTS;
city.build();

let problems = [];
const report = (msg) => problems.push(msg);

function collidersAt(x, z, pad = 0.6) {
  const out = [];
  for (const c of city.colliderList) {
    if (c.disabled) continue;
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) out.push(c);
  }
  return out;
}

// ---- overlaps between colliders (buildings intersecting) ----
let overlaps = 0;
const step = 6;
for (let x = -480; x <= 480; x += step) {
  for (let z = -480; z <= 480; z += step) {
    const hits = collidersAt(x, z, 0);
    if (hits.length > 1) overlaps++;
  }
}
console.log(`colliders: ${city.colliderList.length}, overlapping sample points: ${overlaps}`);

// ---- every POI / lot must be reachable ----
for (const key of Object.keys(POIS)) {
  const p = POIS[key];
  const blockers = collidersAt(p.x, p.z, 0.4);
  if (blockers.length) report(`POI ${p.name} (${p.x},${p.z}) is inside ${blockers.length} collider(s) [${blockers.map((b) => `${b.minX.toFixed(0)}..${b.maxX.toFixed(0)}`).join(',')}]`);
}
for (const lot of LOTS) {
  const blockers = collidersAt(lot.x, lot.z, 0.4);
  if (blockers.length) report(`LOT ${lot.id} is blocked`);
}

// ---- event start lines + checkpoints need a clear radius ----
// Street furniture (lamp posts, signs, traffic-light poles) is a prop: you can
// clip a wing mirror on it, but it does not make a venue unreachable. Only
// buildings count as blockers.
function clearRadius(x, z, r) {
  for (const c of city.colliderList) {
    // anything with a base height is an elevated structure (the overpass
    // parapet): the street runs underneath it, so it never blocks a route
    if (c.disabled || c.height < 0.5 || c.kind === 'prop' || (c.baseY || 0) > 0.5) continue;
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    if (Math.hypot(x - cx, z - cz) < r) return c;
  }
  return null;
}
for (const ev of EVENTS) {
  if (clearRadius(ev.x, ev.z, 7.5)) report(`event ${ev.id} start is blocked`);
  const pts = [[ev.x, ev.z], ...ev.route];
  for (const [x, z] of pts) {
    const b = clearRadius(x, z, 7.0);
    if (b) report(`event ${ev.id} point (${x},${z}) blocked by collider ${b.kind} ${b.minX.toFixed(0)}..${b.maxX.toFixed(0)} x ${b.minZ.toFixed(0)}..${b.maxZ.toFixed(0)}`);
  }
  // route legs must not cut through buildings
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / 4);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const b = clearRadius(x, z, 3.2);
      if (b) { report(`event ${ev.id} route leg ${i} passes through a collider at (${x.toFixed(0)},${z.toFixed(0)})`); break; }
    }
  }
}

// ---- spawn ----
const sp = spawnPoint();
if (clearRadius(sp.x, sp.z, 3.5)) report('player spawn is blocked');

// ---- roads must be clear of buildings (props like palms/cones don't count) ----
function clearOfBuildings(x, z, r) {
  for (const c of city.colliderList) {
    if (c.disabled || c.kind === 'prop' || (c.baseY || 0) > 0.5) continue;
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    if (Math.hypot(x - cx, z - cz) < r) return c;
  }
  return null;
}
let roadBlocked = 0;
let firstRoadBlock = null;
for (const g of GRID) {
  for (let t = -480; t <= 480; t += 4) {
    for (const [x, z] of [[g, t], [t, g]]) {
      const b = clearOfBuildings(x, z, 3.0);
      if (b) { roadBlocked++; if (!firstRoadBlock) firstRoadBlock = [x, z, b]; }
    }
  }
}
if (roadBlocked) {
  const [x, z, b] = firstRoadBlock;
  report(`${roadBlocked} points on the city grid streets are obstructed, e.g. (${x},${z}) by ${b.kind} x ${b.minX.toFixed(0)}..${b.maxX.toFixed(0)} z ${b.minZ.toFixed(0)}..${b.maxZ.toFixed(0)}`);
}

// ring highway
let ringBlocked = 0;
for (let t = -RING; t <= RING; t += 4) {
  for (const [x, z] of [[RING, t], [-RING, t], [t, RING], [t, -RING]]) {
    if (clearRadius(x, z, 2.0)) ringBlocked++;
  }
}
if (ringBlocked) report(`${ringBlocked} points on the ring highway are obstructed`);

// canyon road
let canyonBlocked = 0;
const cr = canyonRoad();
for (let i = 0; i < cr.length - 1; i++) {
  const a = cr[i], b = cr[i + 1];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(len / 4);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (clearRadius(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 5.0)) canyonBlocked++;
  }
}
if (canyonBlocked) report(`${canyonBlocked} points on the canyon road are obstructed`);
if (cr.some((p) => Math.abs(p.x) > 495 || Math.abs(p.z) > 495)) report('canyon road leaves the playable bound');

// gas stations
for (const g of GAS_STATIONS) if (clearRadius(g.x, g.z, 7)) report(`gas station (${g.x},${g.z}) blocked`);

console.log('');
if (problems.length) {
  console.log(`MAP PROBLEMS (${problems.length}):`);
  problems.slice(0, 60).forEach((p) => console.log(' - ' + p));
  if (problems.length > 60) console.log(` ... and ${problems.length - 60} more`);
  process.exitCode = 1;
} else {
  console.log('MAP OK — every landmark, checkpoint and road is reachable.');
}
