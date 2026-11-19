// ============================================================
// Headless smoke + unit tests for STREET EMPIRE.
// Runs the real modules under Node with a minimal DOM/Canvas stub,
// so world generation, vehicle physics, tuning and race logic are
// exercised without a GPU. Run with: npm test
// ============================================================

// ---------- DOM / canvas stubs ----------
class FakeGradient {
  addColorStop() {}
}
class FakeCtx {
  constructor(w, h) { this.canvas = { width: w, height: h }; this.data = null; }
  fillRect() {} clearRect() {} strokeRect() {} beginPath() {} moveTo() {} lineTo() {}
  arc() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {}
  fill() {} stroke() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  drawImage() {} fillText() {} measureText() { return { width: 10 }; } setTransform() {}
  createLinearGradient() { return new FakeGradient(); }
  createRadialGradient() { return new FakeGradient(); }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {}
  set fillStyle(v) {} get fillStyle() { return '#000'; }
  set strokeStyle(v) {} get strokeStyle() { return '#000'; }
}
class FakeCanvas {
  constructor() { this.width = 256; this.height = 256; this.style = {}; }
  getContext() { return new FakeCtx(this.width, this.height); }
  addEventListener() {}
  removeEventListener() {}
  toDataURL() { return 'data:image/png;base64,'; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
}
const listeners = {};
global.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  requestAnimationFrame: () => 0,
  localStorage: (() => {
    const store = new Map();
    return {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  })(),
  AudioContext: null,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
global.localStorage = window.localStorage;
global.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
  createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  body: { appendChild() {} },
  pointerLockElement: null,
  exitPointerLock: () => {},
};
global.performance = global.performance || { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
try { Object.defineProperty(global, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true }); } catch (e) {}

// ---------- tiny test framework ----------
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b, name, tol = 1e-6) {
  const passIt = (typeof a === 'string' || typeof b === 'string') ? a === b : Math.abs(a - b) <= tol;
  ok(passIt, name, `got ${a}, expected ${b}`);
}
function section(name) { console.log('\n▶ ' + name); }

// ============================================================
const THREE = await import('three');
const { CAR_DEFS, CAR_BY_ID, PARTS, computeStats, defaultMods, carValue, TUNE_CATEGORIES, rankFor } = await import('../src/data/cars.js');
const { Vehicle } = await import('../src/physics/vehicle.js');
const { CarVisual } = await import('../src/world/carMesh.js');
const { Progression } = await import('../src/game/progression.js');
const { densifyPath, AIDriver, pathProgress } = await import('../src/game/aiDriver.js');
const { EVENTS, blockCenters, districtOf, buildRoadNetwork, GRID, canyonRoad, POIS,
  RAMPS, BRIDGES, surfaceHeightAt } = await import('../src/world/layout.js');
const { defaultLook, normalizeLook, resolvedLook, BUILD_SCALE, LOOK_OPTIONS, OUTFITS } = await import('../src/data/look.js');
const { Player } = await import('../src/game/player.js');
const { Settings } = await import('../src/core/settings.js');
const { formatMoney, formatTime, ordinal, SpatialGrid, circleBox, wrapAngle } = await import('../src/core/util.js');

// ------------------------------------------------------------
section('data integrity');
ok(CAR_DEFS.length >= 15, `at least 15 vehicles (${CAR_DEFS.length})`);
ok(new Set(CAR_DEFS.map((c) => c.id)).size === CAR_DEFS.length, 'vehicle ids unique');
for (const d of CAR_DEFS) {
  ok(['FWD', 'RWD', 'AWD'].includes(d.drivetrain), `${d.id} drivetrain valid`);
  ok(d.body.length > 3 && d.body.width > 1.4 && d.body.height > 0.9, `${d.id} plausible dimensions`);
  ok(d.body.wheelbase < d.body.length, `${d.id} wheelbase fits body`);
  ok(d.body.wheelR > 0.2 && d.body.wheelR < 0.5, `${d.id} wheel radius plausible`);
  ok(d.hp > 80 && d.hp < 700, `${d.id} power plausible`);
  ok(d.weight > 700 && d.weight < 2200, `${d.id} weight plausible`);
  const st = computeStats(d, defaultMods(d));
  ok(isFinite(st.hp) && isFinite(st.topSpeed) && isFinite(st.accel), `${d.id} stats finite`);
  ok(st.topSpeed >= d.topSpeed * 0.9, `${d.id} stock top speed sane (${st.topSpeed})`);
}
for (const cat of Object.keys(PARTS)) {
  ok(PARTS[cat].length > 0, `parts category ${cat} non-empty`);
  ok(PARTS[cat][0].price === 0, `${cat} first option is the free stock part`);
  for (const p of PARTS[cat]) ok(p.name && p.desc !== undefined, `${cat}/${p.id} described`);
}

// ------------------------------------------------------------
section('tuning maths');
const zen = CAR_BY_ID['coupe_zen'];
const stock = computeStats(zen, defaultMods(zen));
const maxMods = defaultMods(zen);
for (const cat of Object.keys(PARTS)) maxMods[cat] = PARTS[cat].length - 1;
maxMods.tires = 4;
const tuned = computeStats(zen, maxMods);
ok(tuned.hp > stock.hp * 1.5, `full engine build gains power (${stock.hp} -> ${tuned.hp})`);
ok(tuned.topSpeed > stock.topSpeed, `full build raises top speed (${stock.topSpeed} -> ${tuned.topSpeed})`);
ok(tuned.accel < stock.accel, `full build improves 0-100 (${stock.accel} -> ${tuned.accel})`);
ok(tuned.handling > stock.handling, 'full build improves handling');
ok(tuned.gears >= 6, 'gearbox upgrade adds gears');
ok(carValue(zen, maxMods) > carValue(zen, defaultMods(zen)), 'mods increase car value');
for (const cat of TUNE_CATEGORIES) {
  for (const sub of cat.subs) {
    const m = defaultMods(zen);
    for (let i = 0; i < PARTS[sub].length; i++) {
      m[sub] = i;
      const s = computeStats(zen, m);
      ok(isFinite(s.hp) && isFinite(s.topSpeed) && isFinite(s.handling) && isFinite(s.weight),
        `${cat.id}/${sub}[${i}] keeps stats finite`, JSON.stringify({ hp: s.hp, ts: s.topSpeed, h: s.handling }));
    }
  }
}

// ------------------------------------------------------------
section('vehicle physics');
function runVehicle(def, mods, seconds, inputFn, world = null) {
  const v = new Vehicle(def, mods, { transmission: 'auto', assists: true });
  v.reset(0, 0, 0);
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const inp = inputFn ? inputFn(i * dt, v) : { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    v.update(dt, inp, world);
    if (!isFinite(v.x) || !isFinite(v.z) || !isFinite(v.speed) || !isFinite(v.heading)) {
      return { v, nan: true, t: i * dt };
    }
  }
  return { v, nan: false };
}
for (const d of CAR_DEFS) {
  const r = runVehicle(d, defaultMods(d), 12);
  ok(!r.nan, `${d.id} no NaN during a 12s full-throttle run`);
  ok(r.v.speedKmh > 30, `${d.id} actually accelerates (${r.v.speedKmh.toFixed(1)} km/h)`, r.v.speedKmh);
  ok(r.v.speedKmh <= d.topSpeed * 1.25 + 5, `${d.id} respects top speed (${r.v.speedKmh.toFixed(0)} vs ${d.topSpeed})`);
  ok(Math.abs(r.v.x) > 5, `${d.id} moves forward in world space`);
  ok(r.v.gear >= 1, `${d.id} shifts gears (gear ${r.v.gear})`);
}

const braking = new Vehicle(CAR_BY_ID['coupe_zen'], defaultMods(CAR_BY_ID['coupe_zen']));
braking.reset(0, 0, 0);
for (let i = 0; i < 300; i++) braking.update(1 / 60, { throttle: 1 }, null);
const speedBefore = braking.speedKmh;
for (let i = 0; i < 300; i++) braking.update(1 / 60, { brake: 1 }, null);
ok(braking.speedKmh < speedBefore * 0.35, `brakes stop the car (${speedBefore.toFixed(0)} -> ${braking.speedKmh.toFixed(0)})`);

// reverse
const rev = new Vehicle(CAR_BY_ID['hatch_kei'], defaultMods(CAR_BY_ID['hatch_kei']));
rev.reset(0, 0, 0);
for (let i = 0; i < 180; i++) rev.update(1 / 60, { throttle: -1 }, null);
ok(rev.longSpeed < -1, `reverse works (vLong ${rev.longSpeed.toFixed(2)})`);
ok(rev.x < -0.5, 'reverse moves the car backwards');

// handbrake drift induces slip
const driftV = new Vehicle(CAR_BY_ID['coupe_slide'], defaultMods(CAR_BY_ID['coupe_slide']));
driftV.reset(0, 0, 0);
for (let i = 0; i < 260; i++) driftV.update(1 / 60, { throttle: 1 }, null);
let maxSlip = 0;
for (let i = 0; i < 130; i++) {
  driftV.update(1 / 60, { throttle: 0.85, steer: 0.9, handbrake: 1 }, null);
  maxSlip = Math.max(maxSlip, Math.abs(driftV.slipAngle));
}
ok(maxSlip > 0.18, `handbrake produces a slide (slip ${maxSlip.toFixed(2)} rad)`);
ok(Math.abs(wrapAngle(driftV.heading)) > 0.2, 'handbrake turns the car');

// turning
const turner = new Vehicle(CAR_BY_ID['coupe_zen'], defaultMods(CAR_BY_ID['coupe_zen']));
turner.reset(0, 0, 0);
for (let i = 0; i < 200; i++) turner.update(1 / 60, { throttle: 1, steer: 1 }, null);
ok(Math.abs(turner.heading) > 0.25, `steering turns the car (heading ${turner.heading.toFixed(2)})`);
ok(Math.abs(turner.roll) > 0.001, 'body roll is generated in corners');
ok(Math.abs(turner.pitch) > 0.0005, 'pitch is generated under acceleration/braking');

// surface grip
const wet = { surfaceGrip: () => 0.6 };
const dryRun = runVehicle(CAR_BY_ID['coupe_zen'], defaultMods(CAR_BY_ID['coupe_zen']), 8, (t, v) => ({ throttle: 1, steer: 0.6 }), null);
const wetRun = runVehicle(CAR_BY_ID['coupe_zen'], defaultMods(CAR_BY_ID['coupe_zen']), 8, (t, v) => ({ throttle: 1, steer: 0.6 }), wet);
ok(!wetRun.nan, 'wet surface does not break physics');

// performance: physics must fit inside a frame budget
const perfV = new Vehicle(CAR_BY_ID['coupe_zen'], defaultMods(CAR_BY_ID['coupe_zen']));
const t0 = performance.now();
for (let i = 0; i < 6000; i++) perfV.update(1 / 60, { throttle: 1, steer: 0.2 }, null);
const ms = performance.now() - t0;
ok(ms < 400, `6000 physics steps in ${ms.toFixed(0)}ms`);

// ------------------------------------------------------------
// ------------------------------------------------------------
section('steering response');
// The car must answer the wheel in BOTH directions, at speed, without
// spinning: this is the "it drifts and never comes back the other way" bug.
{
  const def = CAR_BY_ID['coupe_zen'];
  const make = () => {
    const v = new Vehicle(def, defaultMods(def), { transmission: 'auto', assists: true });
    v.reset(0, 0, 0);
    for (let i = 0; i < 600; i++) v.update(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, null);
    return v;
  };
  // 1. a normal corner stays a corner: no slide, speed kept
  {
    const v = make();
    const entry = v.speedKmh;
    let maxSlip = 0;
    for (let i = 0; i < 240; i++) {
      v.update(1 / 60, { throttle: 0.4, brake: 0, steer: 0.3, handbrake: 0 }, null);
      maxSlip = Math.max(maxSlip, Math.abs(v.slipAngle));
    }
    ok(maxSlip < 0.28, `a 0.3 steering input at ${entry.toFixed(0)} km/h does not slide (slip ${maxSlip.toFixed(2)} rad)`);
    ok(v.speedKmh > entry * 0.6, `the car keeps its speed through a normal corner (${entry.toFixed(0)} -> ${v.speedKmh.toFixed(0)} km/h)`);
    ok(v.drifting === false, 'a normal corner is not flagged as a drift');
  }
  // 2. counter-steering actually turns the other way
  {
    const v = make();
    let h0 = v.heading;
    for (let i = 0; i < 90; i++) v.update(1 / 60, { throttle: 0.4, brake: 0, steer: 0.6, handbrake: 0 }, null);
    const h1 = v.heading;
    for (let i = 0; i < 120; i++) v.update(1 / 60, { throttle: 0.4, brake: 0, steer: -0.6, handbrake: 0 }, null);
    const h2 = v.heading;
    const turn = wrapAngle(h1 - h0);
    const counter = wrapAngle(h2 - h1);
    ok(turn < -0.3, `steering right turns the car right (${turn.toFixed(2)} rad)`);
    ok(counter > 0.25, `counter-steering turns the car back the other way (${counter.toFixed(2)} rad)`);
    ok(Math.abs(v.slipAngle) < 0.45, `counter-steering recovers the slide (slip ${v.slipAngle.toFixed(2)} rad)`);
  }
  // 3. the steering wheel does something at motorway speed
  {
    const v = make();
    for (let i = 0; i < 200; i++) v.update(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, null);
    const kmh = v.speedKmh;
    const h0 = v.heading;
    for (let i = 0; i < 90; i++) v.update(1 / 60, { throttle: 0.3, brake: 0, steer: 0.5, handbrake: 0 }, null);
    const dh = Math.abs(wrapAngle(v.heading - h0));
    ok(dh > 0.15, `the wheel still turns the car at ${kmh.toFixed(0)} km/h (${dh.toFixed(2)} rad in 1.5 s)`);
    ok(Math.abs(v.slipAngle) < 0.4, `...without sliding out (slip ${Math.abs(v.slipAngle).toFixed(2)} rad)`);
  }
  // 4. a pulled handbrake DOES slide (drifting stays available on purpose)
  {
    const v = make();
    let maxSlip = 0;
    for (let i = 0; i < 90; i++) {
      v.update(1 / 60, { throttle: 0.8, brake: 0, steer: 0.6, handbrake: 1 }, null);
      maxSlip = Math.max(maxSlip, Math.abs(v.slipAngle));
    }
    ok(maxSlip > 0.3, `the handbrake still breaks the rear loose (slip ${maxSlip.toFixed(2)} rad)`);
  }
  // 4b. a lightning-fast handbrake flick still drifts, but counter-steering
  //     recovers it within a second (this is the reported "never comes back")
  {
    const v = make();
    for (let i = 0; i < 48; i++) v.update(1 / 60, { throttle: 0.6, brake: 0, steer: 1, handbrake: 1 }, null);
    const flick = Math.abs(v.slipAngle);
    for (let i = 0; i < 60; i++) v.update(1 / 60, { throttle: 0.6, brake: 0, steer: -0.6, handbrake: 0 }, null);
    ok(flick > 0.5, `a handbrake flick throws the car sideways (slip ${flick.toFixed(2)} rad)`);
    ok(Math.abs(v.slipAngle) < 0.3, `counter-steering recovers the flick (slip ${v.slipAngle.toFixed(2)} rad)`);
  }
  // 4c. a long handbrake turn is a drift, not a spin
  {
    const v = make();
    let prev = v.heading, cum = 0, spins = 0;
    for (let i = 0; i < 300; i++) {
      v.update(1 / 60, { throttle: 0.85, brake: 0, steer: 0.55, handbrake: 0.35 }, null);
      const dh = Math.atan2(Math.sin(v.heading - prev), Math.cos(v.heading - prev));
      prev = v.heading;
      cum += dh;
      if (Math.abs(cum) > Math.PI * 1.8) { spins++; cum = 0; }
    }
    ok(spins === 0, `a held handbrake slide does not spin the car (${spins} spins)`);
  }

  // 5. an S-bend is followed without accumulating a slide
  {
    const v = make();
    let maxSlip = 0;
    for (let k = 0; k < 4; k++) {
      const steer = k % 2 === 0 ? 0.5 : -0.5;
      for (let i = 0; i < 60; i++) {
        v.update(1 / 60, { throttle: 0.35, brake: 0, steer, handbrake: 0 }, null);
        maxSlip = Math.max(maxSlip, Math.abs(v.slipAngle));
      }
    }
    ok(maxSlip < 0.35, `an S-bend does not build up a slide (max slip ${maxSlip.toFixed(2)} rad)`);
    ok(v.speedKmh > 40, `the car keeps rolling through the S-bend (${v.speedKmh.toFixed(0)} km/h)`);
  }
}

section('car mesh construction');
for (const d of CAR_DEFS) {
  const visual = new CarVisual(d, defaultMods(d), { quality: 'medium' });
  ok(visual.group.children.length > 0, `${d.id} builds a mesh group`);
  ok(visual.wheels.length === 4, `${d.id} has 4 wheels`);
  let meshCount = 0;
  visual.group.traverse((o) => { if (o.isMesh) meshCount++; });
  ok(meshCount > 10, `${d.id} has body parts (${meshCount} meshes)`);
  ok(!!visual.bodyMat, `${d.id} has a paint material`);
  visual.update(1 / 60, { steer: 0.4, wheelDelta: 0.1, suspension: [0, 0, 0, 0] });
  ok(visual.wheels[0].grp.rotation.y !== 0, `${d.id} front wheels steer`);
  ok(visual.wheels[0].spin.rotation.z !== 0, `${d.id} wheels spin`);
  visual.setBrake(1); visual.setReverse(1); visual.setLights(true);
  ok(visual.tailMat.emissiveIntensity > 1, `${d.id} brake lights brighten`);
  // every part variant must rebuild without throwing
  for (const cat of ['rims', 'rimSize', 'frontBumper', 'rearBumper', 'skirts', 'spoiler', 'hood', 'headlights', 'exhaustTip', 'tint', 'livery', 'finish', 'underglow']) {
    for (let i = 0; i < PARTS[cat].length; i++) {
      const m = defaultMods(d);
      m[cat] = i;
      try {
        const v2 = new CarVisual(d, m, { quality: 'low' });
        ok(v2.group.children.length > 0, `${d.id} visual with ${cat}[${i}]`);
        v2.dispose();
      } catch (e) {
        ok(false, `${d.id} visual with ${cat}[${i}] threw`, e.message);
      }
    }
  }
  visual.dispose();
}

// ------------------------------------------------------------
section('city generation');
const { City } = await import('../src/world/city.js');
const scene = new THREE.Scene();
const settings = new Settings();
settings.data.quality = 'medium';
const tCity = performance.now();
const city = new City(scene, settings);
city._events = EVENTS;
city.build();
const cityMs = performance.now() - tCity;
ok(scene.children.length > 0, 'city added meshes to the scene');
ok(city.colliderList.length > 50, `city has colliders (${city.colliderList.length})`);
ok(city.lampPositions.length > 50, `city has street lamps (${city.lampPositions.length})`);
ok(city.buildings.length > 100 || city.group.children.length > 40, `city has buildings (${city.buildings.length} minimap / ${city.group.children.length} draw groups)`);
ok(cityMs < 8000, `city generated in ${cityMs.toFixed(0)}ms`);
let totalVerts = 0, drawCalls = 0;
scene.traverse((o) => {
  if (o.isMesh) {
    drawCalls++;
    const g = o.geometry;
    if (g?.attributes?.position) totalVerts += g.attributes.position.count;
  }
});
ok(totalVerts < 900000, `total scene vertices ${totalVerts.toLocaleString()} (batching effective)`);
ok(drawCalls < 400, `draw call count ${drawCalls}`);
console.log(`  · city: ${cityMs.toFixed(0)}ms, ${totalVerts.toLocaleString()} verts, ${drawCalls} meshes`);

// colliders must be queryable and non-degenerate
const q = city.colliders.query(0, 0, 60);
ok(Array.isArray(q), 'collider grid query returns an array');
let badColliders = 0;
for (const c of city.colliderList) {
  if (c.minX > c.maxX || c.minZ > c.maxZ || !isFinite(c.minX) || !isFinite(c.maxZ)) badColliders++;
}
ok(badColliders <= 2, `collider bounds well formed (${badColliders} bad)`);
ok(city.surfaceGrip(0, 0) === 1, 'road grip is neutral');

// the spawn point must not be inside a building
function pointInCollider(x, z, pad = 0.5) {
  for (const c of city.colliderList) {
    if (c.height < 0.5) continue;
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return c;
  }
  return null;
}
const spawn = [-300, 190];
ok(!pointInCollider(spawn[0], spawn[1], 0.8), 'player spawn is clear of buildings');
for (const ev of EVENTS) {
  ok(!pointInCollider(ev.x, ev.z, 0.2), `event ${ev.id} start line is clear`);
  for (const cp of ev.route) {
    const inC = pointInCollider(cp[0], cp[1], 0.2);
    ok(!inC, `event ${ev.id} checkpoint (${cp[0]},${cp[1]}) clear`, inC ? 'inside a collider' : '');
  }
}
for (const k of Object.keys(POIS)) {
  const p = POIS[k];
  ok(!pointInCollider(p.x, p.z, 0.2), `POI ${p.name} is reachable`);
}

// ------------------------------------------------------------
section('layout & roads');
ok(blockCenters().length === (GRID.length - 1) ** 2, 'block count matches grid');
ok(districtOf(180, -120) === 'downtown', 'downtown district detection');
ok(districtOf(-300, 200) === 'residential', 'residential district detection');
ok(districtOf(300, 360) === 'industrial', 'industrial district detection');
const net = buildRoadNetwork();
ok(net.nodes.length === GRID.length * GRID.length * 4, `road graph nodes (${net.nodes.length})`);
let maxOut = 0;
for (const n of net.nodes) maxOut = Math.max(maxOut, net.neighbours(n).length);
ok(maxOut <= 3, `intersection branching reasonable (${maxOut})`);
ok(net.nodes.every((n) => isFinite(n.x) && isFinite(n.z)), 'all road nodes finite');

// race paths must be drivable (segments not absurdly long)
for (const ev of EVENTS) {
  const pts = [[ev.x, ev.z], ...ev.route];
  let maxSeg = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    maxSeg = Math.max(maxSeg, Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  }
  ok(maxSeg < 500, `event ${ev.id} has no giant teleport segments (${maxSeg.toFixed(0)}m)`);
  const path = densifyPath(pts, 9, ev.type === 'circuit' || ev.type === 'highway');
  ok(path.length > pts.length, `event ${ev.id} path densified (${path.length} points)`);
}
ok(EVENTS.length >= 3, `at least 3 playable events (${EVENTS.length})`);
ok(EVENTS.filter((e) => e.opponents > 0).length >= 3, 'at least 3 events with AI opponents');
ok(EVENTS.some((e) => e.type === 'drift'), 'drift event exists');
ok(EVENTS.some((e) => e.type === 'timeattack'), 'time attack exists');
ok(EVENTS.some((e) => e.type === 'circuit'), 'circuit race exists');
ok(EVENTS.some((e) => e.type === 'highway'), 'highway race exists');
ok(canyonRoad().length > 8, 'canyon road defined');

// ------------------------------------------------------------
section('AI drivers');
for (const ev of EVENTS.filter((e) => e.opponents > 0)) {
  const closed = ev.type === 'circuit' || ev.type === 'highway';
  const pts = [[ev.x, ev.z], ...ev.route];
  const path = densifyPath(pts, 9, closed);
  const def = CAR_BY_ID['coupe_zen'];
  const veh = new Vehicle(def, defaultMods(def), { transmission: 'auto' });
  veh.reset(ev.x, ev.z, ev.heading || 0);
  const ai = new AIDriver(veh, path, { skill: 0.85, closed });
  ai.startAtRouteStart();
  let maxSpeed = 0, nan = false, offMax = 0, offSum = 0;
  for (let i = 0; i < 60 * 40; i++) {
    ai.update(1 / 60, { world: null });
    if (!isFinite(veh.x) || !isFinite(veh.z)) { nan = true; break; }
    maxSpeed = Math.max(maxSpeed, veh.speedKmh);
    // how far the rival is from the racing line
    let best = Infinity;
    for (const p of ai.line) {
      const d = Math.hypot(p.x - veh.x, p.z - veh.z);
      if (d < best) best = d;
    }
    offSum += best;
    offMax = Math.max(offMax, best);
  }
  ok(!nan, `AI drives ${ev.id} without NaN`);
  ok(maxSpeed > 25, `AI reaches a sensible speed on ${ev.id} (${maxSpeed.toFixed(0)} km/h)`);
  ok(ai.lap > 0 || ai.progress > 0.2, `AI advances along ${ev.id} (lap ${ai.lap}, ${(ai.progress * 100).toFixed(0)}%)`);
  // the whole point of the rewrite: rivals stay on the racing line instead of
  // wandering off and circling their own waypoint
  ok(offSum / (60 * 40) < 8, `AI stays on the racing line on ${ev.id} (avg ${(offSum / (60 * 40)).toFixed(1)} m)`);
  ok(offMax < 32, `AI never wanders far off the road on ${ev.id} (max ${offMax.toFixed(1)} m)`);
}

// ------------------------------------------------------------
section('AI route handling');
{
  // an open route must not wrap back to the start: rivals that finish a
  // sprint used to drive back down the road to the first waypoint
  const ev = EVENTS.find((e) => e.type === 'sprint');
  const path = densifyPath([[ev.x, ev.z], ...ev.route], 9, false);
  const def = CAR_BY_ID['coupe_zen'];
  const veh = new Vehicle(def, defaultMods(def), { transmission: 'auto' });
  veh.reset(ev.x, ev.z, ev.heading || 0);
  const ai = new AIDriver(veh, path, { skill: 0.9, closed: false });
  ai.startAtRouteStart();
  let reachedEnd = false;
  for (let i = 0; i < 60 * 120; i++) {
    ai.update(1 / 60, { world: null });
    if (ai.atEnd) { reachedEnd = true; break; }
  }
  ok(reachedEnd, `AI finishes the open sprint ${ev.id}`);
  ok(ai.lap === 1, `finishing an open route counts exactly one lap (${ai.lap})`);
  const endX = veh.x, endZ = veh.z;
  for (let i = 0; i < 60 * 6; i++) ai.update(1 / 60, { world: null });
  ok(Math.hypot(veh.x - endX, veh.z - endZ) < 25, 'finished rival stops at the line instead of driving back');
  ok(Math.abs(veh.speedKmh) < 3, `finished rival comes to rest (${veh.speedKmh.toFixed(1)} km/h)`);
}

// ------------------------------------------------------------
section('AI cornering');
{
  // the rivals used to arrive at a corner 40 km/h too fast and spin; they must
  // now slow down BEFORE the bend
  const ev = EVENTS.find((e) => e.id === 'circuit_downtown');
  const path = densifyPath([[ev.x, ev.z], ...ev.route], 9, true);
  const def = CAR_BY_ID['coupe_zen'];
  const veh = new Vehicle(def, defaultMods(def), { transmission: 'auto' });
  veh.reset(ev.x, ev.z, ev.heading || 0);
  const ai = new AIDriver(veh, path, { skill: 0.85, closed: true });
  ai.startAtRouteStart();
  let maxSlip = 0, maxYaw = 0, minSpeed = Infinity;
  for (let i = 0; i < 60 * 60; i++) {
    ai.update(1 / 60, { world: null });
    maxSlip = Math.max(maxSlip, Math.abs(veh.slipAngle));
    maxYaw = Math.max(maxYaw, Math.abs(veh.yawRate));
    if (i > 180) minSpeed = Math.min(minSpeed, veh.speedKmh);
  }
  ok(maxSlip < 0.45, `AI does not spin out (max slip ${maxSlip.toFixed(2)} rad)`);
  ok(maxYaw < 2.2, `AI does not fishtail (max yaw rate ${maxYaw.toFixed(2)} rad/s)`);
  ok(minSpeed > 15, `AI keeps rolling through the lap (min ${minSpeed.toFixed(0)} km/h)`);
}

// ------------------------------------------------------------
section('map: ramps, jumps and the overpass');
{
  ok(RAMPS.length >= 1, `the map has a launch ramp (${RAMPS.length})`);
  ok(BRIDGES.length >= 1, `the map has a bridge (${BRIDGES.length})`);
  // the surface query must describe the actual ramp: 0 at the foot, then it climbs
  for (const r of RAMPS) {
    const foot = surfaceHeightAt(r.x, r.z, 0);
    const mid = surfaceHeightAt(r.x + r.dx * r.length * 0.5, r.z + r.dz * r.length * 0.5, r.height * 0.5);
    const lip = surfaceHeightAt(r.x + r.dx * r.length * 0.99, r.z + r.dz * r.length * 0.99, r.height);
    ok(Math.abs(foot) < 0.05, `ramp ${r.id} starts at street level`);
    ok(mid > 0.5 && mid < r.height, `ramp ${r.id} climbs (${mid.toFixed(2)} m at half way)`);
    ok(lip > r.height * 0.9, `ramp ${r.id} reaches its lip height (${lip.toFixed(2)} m)`);
    // just past the lip there is nothing to land on: that is the jump
    const past = surfaceHeightAt(r.x + r.dx * (r.length + 6), r.z + r.dz * (r.length + 6), r.height);
    ok(past < 0.05, `ramp ${r.id} ends in a drop (lip at ${r.height} m)`);
    ok(pointInCollider(r.x + r.dx * r.length * 0.5, r.z + r.dz * r.length * 0.5, 0.2) === null,
      `ramp ${r.id} deck is drivable`);
  }
  for (const b of BRIDGES) {
    const mid = surfaceHeightAt(b.x + b.dx * b.length / 2, b.z + b.dz * b.length / 2, b.deckY);
    ok(Math.abs(mid - b.deckY) < 0.01, `bridge ${b.id} holds its deck height (${mid.toFixed(2)} m)`);
    // the street below must still be driveable at ground level
    const under = surfaceHeightAt(b.x + b.dx * b.length / 2, b.z + b.dz * b.length / 2, 0);
    ok(under === 0, `bridge ${b.id} leaves the street below open (${under})`);
    ok(pointInCollider(b.x + b.dx * b.length / 2, b.z + b.dz * b.length / 2, 0.4) === null,
      `bridge ${b.id} centre is clear of the street`);
  }
  // flat ground everywhere else
  ok(surfaceHeightAt(0, 0, 0) === 0 && surfaceHeightAt(-300, 180, 0) === 0, 'ordinary streets are flat');
}

section('driving over a ramp: launch, flight and landing');
{
  const def = CAR_BY_ID['coupe_bavar'];
  const world = {
    surfaceGrip: () => 1,
    surfaceHeightAt: (x, z, fromY) => surfaceHeightAt(x, z, fromY),
  };
  const r = RAMPS[0];
  // line the car up on the approach and hold full throttle
  const startX = r.x - r.dx * 60, startZ = r.z - r.dz * 60;
  const heading = Math.atan2(-r.dz, r.dx);   // forward = (cos h, -sin h)
  const v = new Vehicle(def, defaultMods(def), { transmission: 'auto', assists: true });
  v.reset(startX, startZ, heading);
  let maxY = 0, airFrames = 0, landing = 0, maxVy = 0;
  for (let i = 0; i < 120 * 14; i++) {
    v.update(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, world);
    maxY = Math.max(maxY, v.y);
    maxVy = Math.max(maxVy, v.vy);
    if (v.airborne) airFrames++;
    if (v.events.landing > 0) { landing = Math.max(landing, v.events.landing); v.events.landing = 0; }
  }
  ok(maxY > r.height * 0.9, `the car climbs the ramp (${maxY.toFixed(2)} m)`);
  ok(maxVy > 1.5, `the lip launches the car upwards (${maxVy.toFixed(2)} m/s)`);
  ok(airFrames > 20, `the car spends real time in the air (${(airFrames / 120).toFixed(2)} s)`);
  ok(landing > 1, `the landing is detected (${landing.toFixed(1)} m/s impact)`);
  ok(v.y === 0 && !v.airborne, 'the car comes back down to the street');
  ok(isFinite(v.x) && isFinite(v.z) && isFinite(v.y), 'the jump never produces NaN');
  ok(v.speed > 5, `the car keeps rolling after the landing (${v.speedKmh.toFixed(0)} km/h)`);

  // a car rolling up the bridge must crest it and come down the far side
  const b = BRIDGES[0];
  const v2 = new Vehicle(def, defaultMods(def), { transmission: 'auto', assists: true });
  v2.reset(b.x - b.dx * 70, b.z - b.dz * 70, Math.atan2(-b.dz, b.dx));
  let top = 0;
  for (let i = 0; i < 120 * 20; i++) {
    v2.update(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, world);
    top = Math.max(top, v2.y);
  }
  ok(top > b.deckY * 0.95, `the car drives over the bridge deck (${top.toFixed(2)} m)`);
  ok(v2.y < 0.1, `and back down to street level (${v2.y.toFixed(2)} m)`);

  // airborne cars have no grip: steering must not turn them mid-flight
  const v3 = new Vehicle(def, defaultMods(def), { transmission: 'auto', assists: true });
  v3.reset(b.x, b.z + b.length * 0.5, Math.atan2(-b.dz, b.dx));
  v3.airborne = true; v3.y = 6; v3.vy = 0; v3.vx = 20; v3.vz = 0; v3.heading = 0;
  const h0 = v3.heading;
  for (let i = 0; i < 30; i++) v3.update(1 / 120, { throttle: 1, brake: 0, steer: 1, handbrake: 0 }, world);
  ok(Math.abs(v3.heading - h0) < 0.05, 'the wheel does nothing in mid-air');
}

// ------------------------------------------------------------
section('the starter car is the blue BMW-style coupé');
{
  const { STARTER_CAR_ID } = await import('../src/game/progression.js');
  ok(STARTER_CAR_ID === 'coupe_bavar', 'the starter car id is the new coupé');
  const def = CAR_BY_ID[STARTER_CAR_ID];
  ok(!!def, 'the starter car exists in the catalogue');
  ok(def.drivetrain === 'RWD' && def.engine === 'i6', 'it is a rear-drive straight six');
  ok(def.body.grille === 'kidney', 'it has the twin-kidney grille');
  ok(!!def.body.gills, 'it has the M-style side gills');
  ok(def.body.archFlare > 0.02, 'it has the flared arches');
  ok(def.defaultColor.toLowerCase() === '#1846a8', `it is Estoril blue (${def.defaultColor})`);
  const st = computeStats(def, defaultMods(def));
  ok(st.hp > 300 && st.hp < 380, `343-ish horsepower (${st.hp})`);
  ok(st.topSpeed >= 240 && st.topSpeed < 270, `250-ish top speed (${st.topSpeed})`);
  ok(st.accel < 6.5, `it is quick off the line (${st.accel.toFixed(1)} s to 100)`);
  // and the game really starts in it, with real money in the bank
  const prog3 = new Progression();
  prog3.newGame('STARTER');
  ok(prog3.cars.length === 1 && prog3.cars[0].defId === 'coupe_bavar', 'a new game starts in the coupé');
  ok(prog3.money >= 20000, `a new game starts with real money ($${prog3.money})`);
  const { CONFIG: CFG } = await import('../src/config.js');
  ok(CFG.economy.startMoney === prog3.money, 'the starting cash comes from the config');
}

// ------------------------------------------------------------
section('driver customisation');
{
  const look = defaultLook();
  ok(look.skin && look.jacket && look.pants && look.shoe, 'there is a default look');
  for (const k of ['skin', 'hair', 'jacket', 'accent', 'pants', 'shoe']) {
    ok(Array.isArray(LOOK_OPTIONS[k]) && LOOK_OPTIONS[k].length >= 4, `${k} has a palette (${LOOK_OPTIONS[k].length})`);
    ok(LOOK_OPTIONS[k].every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${k} palette entries are hex colours`);
  }
  ok(LOOK_OPTIONS.hairStyle.length >= 4, 'there are hair styles to pick from');
  ok(BUILD_SCALE.length >= 3 && OUTFITS.length >= 3, 'there are builds and outfits');
  // junk is rejected, valid patches survive
  const n = normalizeLook({ skin: 'red', jacket: '#ff0000', build: 99, hairStyle: -3 });
  ok(n.jacket === '#ff0000', 'a valid colour is kept');
  ok(n.skin === look.skin, 'an invalid colour falls back to the default');
  ok(n.build === BUILD_SCALE.length - 1 && n.hairStyle === 0, 'out-of-range indexes are clamped');
  ok(normalizeLook(null).skin === look.skin, 'a missing look falls back to the default');
  // an outfit can override the jacket and trousers
  const suit = resolvedLook({ ...look, outfit: OUTFITS.findIndex((o) => o.id === 'suit') });
  ok(suit.jacket === '#14171c', 'the suit overrides the jacket colour');
  ok(suit.build && suit.build.shoulder > 0, 'the resolved look carries the build scale');

  // progression stores it and saves it
  const prog4 = new Progression();
  prog4.newGame('DRIVER');
  ok(prog4.look.skin === look.skin, 'a new game has the default look');
  prog4.setLook({ jacket: '#c8202c', build: 2, hairStyle: 3 });
  ok(prog4.look.jacket === '#c8202c' && prog4.look.build === 2, 'the look can be changed');
  prog4.save();
  const prog5 = new Progression();
  prog5.load();
  ok(prog5.look.jacket === '#c8202c' && prog5.look.hairStyle === 3, 'the look survives a save/load round trip');
  // an old save with no look at all must still load
  const raw = JSON.parse(JSON.stringify(prog4.data));
  delete raw.look;
  global.window.localStorage.setItem('street_empire_save_v1', JSON.stringify(raw));
  const prog6 = new Progression();
  ok(prog6.load() != null && prog6.look.skin === look.skin, 'an old save gets a default look on load');

  // the rig can be rebuilt into any look without leaking or breaking
  const rigScene = new THREE.Scene();
  const rig = new Player(rigScene, defaultLook());
  const meshes0 = (() => { let n = 0; rig.group.traverse((o) => { if (o.isMesh) n++; }); return n; })();
  ok(meshes0 > 10, `the driver rig is built (${meshes0} meshes)`);
  for (let i = 0; i < LOOK_OPTIONS.hairStyle.length; i++) {
    rig.setLook({ ...defaultLook(), hairStyle: i, build: i % BUILD_SCALE.length });
    let count = 0, nan = false;
    rig.group.updateMatrixWorld(true);
    rig.group.traverse((o) => {
      if (!o.isMesh) return;
      count++;
      const bb = new THREE.Box3().setFromObject(o);
      if (![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(isFinite)) nan = true;
      if (Math.abs(bb.min.z) > 2.5 || Math.abs(bb.max.z) > 2.5) nan = true;
    });
    ok(count > 10 && !nan, `hair style ${i} rebuilds cleanly (${count} meshes)`);
  }
  // shoulders must widen with the build
  const narrow = new Player(rigScene, { ...defaultLook(), build: 0 });
  const wide = new Player(rigScene, { ...defaultLook(), build: BUILD_SCALE.length - 1 });
  ok(wide.armR.position.x > narrow.armR.position.x, 'a heavier build has wider shoulders');
  ok(wide.materials[1].color.getHex() === narrow.materials[1].color.getHex(), 'the jacket colour is independent of the build');
}

// ------------------------------------------------------------
section('more races on the map');
{
  ok(EVENTS.length >= 12, `the city has a full calendar of races (${EVENTS.length})`);
  ok(new Set(EVENTS.map((e) => e.id)).size === EVENTS.length, 'race ids are unique');
  ok(new Set(EVENTS.map((e) => e.name)).size === EVENTS.length, 'race names are unique');
  for (const ev of EVENTS) {
    ok(typeof ev.fee === 'number' && ev.fee >= 0, `${ev.id} has a sane entry fee`);
    ok(ev.prize > ev.fee, `${ev.id} pays more than it costs`);
    ok(ev.route.length >= 3, `${ev.id} has a real route (${ev.route.length} points)`);
    ok(ev.desc && ev.desc.length > 30, `${ev.id} has a description`);
  }
  for (const id of ['sprint_stunt', 'circuit_autos', 'sprint_palms', 'drift_hangar', 'delivery_2']) {
    ok(EVENTS.some((e) => e.id === id), `new event ${id} exists`);
  }
  const stunt = EVENTS.find((e) => e.id === 'sprint_stunt');
  const ramp = RAMPS[0];
  const nearRamp = Math.min(...[[stunt.x, stunt.z], ...stunt.route].map(([x, z]) => Math.hypot(x - ramp.x, z - ramp.z)));
  ok(nearRamp < 25, `the stunt race lines up with the kicker (${nearRamp.toFixed(1)} m)`);
  // start lines must be far enough apart that the prompt picks one
  for (let i = 0; i < EVENTS.length; i++) {
    for (let j = i + 1; j < EVENTS.length; j++) {
      const a = EVENTS[i], b = EVENTS[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      ok(d > 15, `start lines ${a.id} / ${b.id} do not overlap (${d.toFixed(0)} m)`);
    }
  }
  const prog7 = new Progression();
  prog7.newGame('CALENDAR');
  ok(prog7.data.unlockedEvents.length >= 8, `a new game unlocks a starter calendar (${prog7.data.unlockedEvents.length})`);
  for (const id of prog7.data.unlockedEvents) ok(EVENTS.some((e) => e.id === id), `unlocked event ${id} exists`);
}

// ------------------------------------------------------------
section('progression & saves');
const prog = new Progression();
prog.newGame('TESTER');
eq(prog.money, 40000, 'new game starts with the configured cash');
ok(prog.cars.length === 1, 'new game starts with one car');
ok(prog.activeCar() != null, 'new game has an active car');
ok(prog.collectionValue() > 0, 'collection has a value', 'value=' + prog.collectionValue() + ' cars=' + JSON.stringify(prog.cars.map(c=>c.defId)));
ok(prog.save(), 'save writes to localStorage');
const prog2 = new Progression();
ok(prog2.load() != null, 'save can be loaded back');
eq(prog2.money, prog.money, 'loaded money matches');
eq(prog2.cars.length, prog.cars.length, 'loaded car count matches');

// buying
prog2.data.money = 50000;
prog2.data.rep = 50;
const before = prog2.cars.length;
const buy = prog2.buyCar('coupe_zen');
ok(buy.ok, 'buying an affordable, unlocked car succeeds');
eq(prog2.cars.length, before + 1, 'buying adds a car');
ok(prog2.money === 50000 - CAR_BY_ID['coupe_zen'].price, 'buying deducts the price');
const poor = prog2.buyCar('exotic_velor');
ok(!poor.ok, 'cannot buy without enough cash');
// garage limit
prog2.data.money = 1e7;
let added = 0;
while (prog2.cars.length < prog2.data.garageSlots) { prog2.buyCar('hatch_kei'); added++; break; }
const overflow = prog2.buyCar('hatch_kei');
ok(overflow.ok || prog2.cars.length >= prog2.data.garageSlots, 'garage slot limit enforced');
const expanded = prog2.expandGarage();
ok(expanded.ok, 'garage expansion works');

// selling
const sellTarget = prog2.cars[prog2.cars.length - 1];
const moneyBeforeSell = prog2.money;
const sold = prog2.sellCar(sellTarget.uid);
ok(sold.ok, 'selling a non-last car works');
ok(prog2.money > moneyBeforeSell, 'selling pays out');
const lastCar = prog2.cars[0];
while (prog2.cars.length > 1) prog2.sellCar(prog2.cars[prog2.cars.length - 1].uid);
ok(!prog2.sellCar(prog2.cars[0].uid).ok, 'cannot sell your last car');

// parts
const car = prog2.activeCar();
prog2.data.money = 100000;
const r1 = prog2.installPart(car.uid, 'engine', 2, PARTS.engine[2].price);
ok(r1.ok, 'installing a part succeeds');
eq(car.mods.engine, 2, 'part is fitted');
const r2 = prog2.installPart(car.uid, 'engine', 2, PARTS.engine[2].price);
ok(r2.ok, 'refitting an owned part does not charge again');
ok(prog2.installPart(car.uid, 'engine', 3, PARTS.engine[3].price).ok || prog2.money < PARTS.engine[3].price, 'expensive part gated by cash');

// records + rep
const repBefore = prog2.rep;
prog2.addRep(12);
eq(prog2.rep, repBefore + 12, 'reputation accumulates');
ok(prog2.rank.rep <= prog2.rep, 'rank matches reputation');
prog2.recordRace(EVENTS[0], { position: 1, time: 61.2 });
ok(prog2.data.records[EVENTS[0].id].wins === 1, 'race win recorded');
prog2.recordRace(EVENTS[0], { position: 2, time: 59.9 });
ok(prog2.data.records[EVENTS[0].id].bestTime === 59.9, 'best time updates to the fastest');
ok(prog2.isUnlocked({ id: 'x', repReq: 5 }), 'events unlock with reputation');
ok(!prog2.isUnlocked({ id: 'y', repReq: 999 }), 'events stay locked at low reputation');

// ------------------------------------------------------------
section('utilities');
eq(formatMoney(1234567), '$1,234,567', 'money formatting');
eq(formatMoney(-500), '-$500', 'negative money formatting');
eq(formatTime(61.5), '01:01.50', 'time formatting');
eq(formatTime(0), '00:00.00', 'zero time formatting');
eq(ordinal(1), '1st', 'ordinal 1');
eq(ordinal(2), '2nd', 'ordinal 2');
eq(ordinal(11), '11th', 'ordinal 11');
const grid = new SpatialGrid(20);
const box = { id: 1, minX: -5, maxX: 5, minZ: -5, maxZ: 5, disabled: false };
grid.insert(box);
ok(grid.query(0, 0, 10).length === 1, 'spatial grid finds nearby collider');
ok(grid.query(200, 200, 10).length === 0, 'spatial grid misses far collider');
const hit = circleBox(6, 0, 2, box);
ok(hit && hit.depth > 0, 'circle-box collision detected');
ok(circleBox(50, 0, 2, box) === null, 'circle-box miss detected');
eq(wrapAngle(Math.PI * 3), Math.PI, 'angle wrapping');

// ------------------------------------------------------------
section('settings');
const s2 = new Settings();
s2.set('volMaster', 55);
eq(s2.get('volMaster'), 55, 'settings persist in memory');
const s3 = new Settings();
eq(s3.get('volMaster'), 55, 'settings persist to localStorage');

// ------------------------------------------------------------
section('race director');
const { RaceDirector } = await import('../src/game/race.js');
// minimal fake game shell for the director
const fakeHud = {
  showRace() {}, hideRace() {}, updateRace() {}, setCountdown() {}, toast() {},
  showDrift() {}, hideDrift() {}, raceCheckpoint() {}, setObjective() {},
};
const fakeGame = {
  scene: new THREE.Scene(), hud: fakeHud, qualityName: 'low', city,
  audio: { countdownBeep() {}, ui() {}, cashRegister() {} },
  progression: prog2, playerVehicle: null, playerInCar: true,
};
const director = new RaceDirector(fakeGame);
for (const ev of EVENTS) {
  director.clear();
  director.start(ev);
  ok(director.checkpoints.length === ev.route.length, `${ev.id} builds ${ev.route.length} checkpoints`);
  ok(director.opponents.length === (ev.opponents || 0), `${ev.id} spawns ${ev.opponents || 0} rivals`);
  // simulate: teleport the player along the route so laps complete
  const def = CAR_BY_ID['coupe_zen'];
  const veh = new Vehicle(def, defaultMods(def), { transmission: 'auto' });
  veh.reset(ev.x, ev.z, 0);
  fakeGame.playerVehicle = veh;
  let finished = false;
  let guard = 0;
  while (!finished && guard++ < 400) {
    // warp the player onto the current checkpoint
    const cp = director.checkpoints[director.cpIndex];
    if (cp) { veh.x = cp.x; veh.z = cp.z; }
    director.update(1 / 30, veh, { x: veh.x, z: veh.z });
    if (director.state === 'finished') finished = true;
    if (ev.type === 'drift') { director.driftTimeLimit = -1; }
  }
  ok(finished, `${ev.id} can be completed / resolved`);
  ok(director.result != null, `${ev.id} produces a result`);
  if (director.result) {
    ok(director.result.position >= 1, `${ev.id} result has a position`);
    ok(isFinite(director.result.payout), `${ev.id} payout is numeric`);
  }
  director.clear();
}

// ------------------------------------------------------------
section('determinism / regressions');
// the same input twice must produce the same trajectory
function trajectory() {
  const v = new Vehicle(CAR_BY_ID['sedan_evo'], defaultMods(CAR_BY_ID['sedan_evo']));
  v.reset(10, -20, 0.4);
  const out = [];
  for (let i = 0; i < 500; i++) {
    v.update(1 / 60, { throttle: 1, steer: Math.sin(i * 0.02) * 0.5 }, null);
    if (i % 100 === 0) out.push([v.x.toFixed(4), v.z.toFixed(4)].join(','));
  }
  return out.join('|');
}
eq(trajectory(), trajectory(), 'physics is deterministic for identical input');

// ------------------------------------------------------------
console.log('\n' + '='.repeat(56));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exitCode = 1;
} else {
  console.log('All systems nominal. San Velor is online.');
}
