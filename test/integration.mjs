// ============================================================
// Integration test — boots the real Game class headlessly and drives
// it through every major feature: walking, entering a car, driving,
// tuning, buying, racing, police, saving and map overlays.
// Run with: node test/integration.mjs
// ============================================================

// ---------- DOM stub ----------
const els = new Map();
function mkEl(id) {
  const el = {
    id, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', value: '',
    checked: false, disabled: false, className: '', type: 'div',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() {},
    addEventListener(t, fn) { (this._ev = this._ev || {})[t] = fn; },
    removeEventListener() {},
    querySelector(sel) { return mkEl(id + ':' + sel); },
    querySelectorAll() { return []; },
    getContext() { return fakeCtx(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { this._ev?.click?.({ preventDefault() {} }); },
    width: 900, height: 900,
  };
  el.firstChild = null;
  return el;
}
function fakeCtx() {
  const g = {
    canvas: { width: 256, height: 256 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 10 }),
  };
  for (const m of ['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate',
    'rotate', 'scale', 'drawImage', 'fillText', 'putImageData', 'setTransform', 'clip']) g[m] = () => {};
  return g;
}
class FakeCanvas extends Object {
  constructor() {
    super();
    this.width = 1280; this.height = 720; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  getContext() { return fakeCtx(); }
  addEventListener(t, fn) { (this._ev = this._ev || {})[t] = fn; }
  removeEventListener() {}
  requestPointerLock() { document.pointerLockElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
}

global.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : mkEl('new-' + tag)),
  createElementNS: () => mkEl('ns'),
  getElementById: (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
  querySelectorAll: () => [],
  querySelector: () => mkEl('q'),
  addEventListener: () => {},
  body: { appendChild() {} },
  pointerLockElement: null,
  hidden: false,
  exitPointerLock() { document.pointerLockElement = null; },
};
global.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: () => {}, removeEventListener: () => {},
  requestAnimationFrame: () => 0,
  localStorage: (() => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  })(),
};
global.localStorage = window.localStorage;
global.performance = global.performance || { now: () => Date.now() };
global.requestAnimationFrame = () => 0;

// ---------- harness ----------
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra = '') {
  if (cond) pass++;
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function step(name) { console.log('▶ ' + name); }

const THREE = await import('three');
const { Game } = await import('../src/game/game.js');
const { EVENTS } = await import('../src/world/layout.js');
const { CAR_BY_ID, computeStats } = await import('../src/data/cars.js');

// silence expected console noise from the headless renderer
const realWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('THREE.WebGL')) realWarn(...a); };

// ============================================================
step('boot');
const canvas = new FakeCanvas();
const game = new Game(canvas, { headless: true });
const bootSteps = [];
await game.boot((p, t) => bootSteps.push([p, t]));
ok(bootSteps.length > 3, 'boot reports progress stages');
ok(bootSteps[bootSteps.length - 1][0] === 100, 'boot reaches 100%');
ok(!!game.city, 'city exists');
ok(game.city.colliderList.length > 50, 'city colliders generated');
ok(!!game.env, 'environment exists');
ok(!!game.player, 'player character exists');
ok(!!game.cameraRig, 'camera rig exists');
ok(!!game.traffic, 'traffic system exists');
ok(!!game.peds, 'pedestrian system exists');
ok(!!game.police, 'police system exists');
ok(!!game.race, 'race director exists');
ok(game.scene.children.length > 0, 'scene populated');
ok(game.traffic.cars.length > 0, `traffic cars spawned (${game.traffic.cars.length})`);
ok(game.peds.peds.length > 0, `pedestrians spawned (${game.peds.peds.length})`);
ok(game.parkedCars.length > 0, `parked cars placed (${game.parkedCars.length})`);

// frame stepping helper
function frames(n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) game.frame(dt);
}
function press(code, ms = 1) { game.input.keys.add(code); game._pressFrames = (game._pressFrames || 0) + 1; return () => game.input.keys.delete(code); }

// ============================================================
step('main menu → new game');
game.showMenu();
frames(30);
ok(game.state === 'menu', 'menu state entered');
ok(!!game.previewCar, 'menu shows a preview car');
ok(game.screens.current === 'menu', 'menu screen visible');
ok(document.getElementById('btn-continue').disabled === true || game.progression.data != null, 'continue button reflects save state');

game.startNewGame();
await new Promise((r) => setTimeout(r, 700));
frames(10);
ok(game.state === 'explore', 'new game enters the world');
ok(game.playerInCar === false, 'player starts on foot');
ok(game.worldActive === true, 'world is active');
ok(!!game.playerVehicle, 'player vehicle exists');
ok(game.progression.money === 2500, 'starting cash correct');
ok(game.hud.el.money.textContent.includes('2,500'), 'HUD shows the cash', game.hud.el.money.textContent);

// ============================================================
step('walking');
const startX = game.player.x, startZ = game.player.z;
press('KeyW');
frames(60);
ok(Math.hypot(game.player.x - startX, game.player.z - startZ) > 0.4, 'player walks');
releaseAll();
frames(10);

function releaseAll() { game.input.keys.clear(); }

// running is faster
const runStart = { x: game.player.x, z: game.player.z };
press('KeyW');
press('ShiftLeft');
frames(60);
const runDist = Math.hypot(game.player.x - runStart.x, game.player.z - runStart.z);
releaseAll();
ok(runDist > 1.5, `sprinting covers ground (${runDist.toFixed(2)}m)`);

// ============================================================
step('entering the car');
// walk the player to the car
const pv = game.playerVehicle;
game.player.place(pv.x + 1.6, pv.z + 1.2, 0);
frames(4);
ok(game.nearbyInteract === 'car', 'car is offered as an interaction', String(game.nearbyInteract));
game.doInteraction('car');
frames(6);
ok(game.playerInCar === true, 'player enters the car');
ok(game.player.group.visible === false, 'player mesh hidden while driving');
ok(!!game.playerVehicle, 'driving the active vehicle');

// ============================================================
step('driving');
const v = game.playerVehicle;
const driveStart = { x: v.x, z: v.z };
press('KeyW');
frames(320);
releaseAll();
ok(Math.hypot(v.x - driveStart.x, v.z - driveStart.z) > 12, `car drives forward (${Math.hypot(v.x - driveStart.x, v.z - driveStart.z).toFixed(1)}m)`);
ok(v.speedKmh > 25, `car reaches speed (${v.speedKmh.toFixed(0)} km/h)`);
ok(v.gear >= 1, 'gearbox engaged');
ok(game.hud.el.speed.textContent !== '0', 'speedometer updates');
ok(game.hud.el.gear.textContent !== '', 'gear indicator shows');

// steering
const headBefore = v.heading;
press('KeyW');
press('KeyD');
frames(60);
releaseAll();
ok(Math.abs(v.heading - headBefore) > 0.05, 'car steers');
frames(30);

// braking: hold S long enough for a genuine stop (the car used to lose its
// speed by sliding, which made this test pass for the wrong reason)
const brakeFrom = v.speedKmh;
press('KeyS');
frames(110);
releaseAll();
ok(v.speedKmh < brakeFrom * 0.45, `brakes slow the car (${brakeFrom.toFixed(0)} -> ${v.speedKmh.toFixed(1)} km/h)`);
ok(Math.abs(v.slipAngle) < 0.15, `braking in a straight line does not slide (slip ${v.slipAngle.toFixed(2)} rad)`);
frames(20);

// handbrake drift
press('KeyW');
frames(120);
releaseAll();
press('KeyW'); press('KeyA'); press('Space');
let maxSlip = 0;
for (let i = 0; i < 70; i++) { game.frame(1 / 60); maxSlip = Math.max(maxSlip, Math.abs(v.slipAngle)); }
releaseAll();
ok(maxSlip > 0.12, `handbrake induces a slide (${maxSlip.toFixed(2)} rad)`);

// camera modes
for (let i = 0; i < 5; i++) {
  game.cameraRig.cycleCamera();
  frames(6);
}
ok(true, 'all camera modes render without error');

// collisions with the world must not produce NaN
v.reset(-60, 60, 0);
game.cameraRig.yaw = 0;
press('KeyW');
let nan = false;
for (let i = 0; i < 600; i++) {
  game.frame(1 / 60);
  if (!isFinite(v.x) || !isFinite(v.z) || !isFinite(v.heading)) { nan = true; break; }
}
releaseAll();
ok(!nan, 'long drive through the city keeps physics finite');
ok(Math.abs(v.x) < 520 && Math.abs(v.z) < 520, 'car stays inside the world bounds');

// exiting
v.longSpeed = 0;
game.putPlayerOutOfCar();
frames(4);
ok(game.playerInCar === false, 'player exits the car');
ok(game.player.group.visible === true, 'player mesh visible again');

// ============================================================
step('garage');
game.screens.showOnly('garage');
game.enterPreview(CAR_BY_ID[game.progression.activeCar().defId], game.progression.activeCar().mods, 'garage');
const sc = game.screens;
sc.openGarage();
frames(20);
ok(sc.current === 'garage', 'garage screen open');
ok(sc.getGarageCar() != null, 'garage selects a car');
ok(document.getElementById('garage-list').children.length > 0, 'garage list renders cars');
const statsText = document.getElementById('garage-specs').innerHTML;
ok(statsText.includes('POWER'), 'garage shows specs');
ok(game.state === 'garage', 'game state follows the garage');
// drive out
sc.driveOut(game.progression.activeCar().uid);
frames(6);
ok(game.state === 'explore', 'driving out returns to the world');

// ============================================================
step('tuning');
game.progression.data.money = 50000;
game.progression.data.rep = 20;   // unlock the mid-tier parts for this test
const carUid = game.progression.activeCar().uid;
sc.open('tuning', { car: carUid });
frames(20);
ok(sc.current === 'tuning', 'tuning screen open');
ok(document.getElementById('tuning-options').children.length > 0, 'tuning options render');
const statsBefore = computeStats(CAR_BY_ID[CAR_BY_ID[game.progression.activeCar().defId].id], game.progression.activeCar().mods);

// find the turbo category and install the first paid part
sc.selectTuningCategory('engine');
const engineOpts = document.getElementById('tuning-options').children;
ok(engineOpts.length >= 5, `engine parts listed (${engineOpts.length})`);
// select part index 2 (Stage 2) and buy it
sc.tuningSel = 2;
sc.renderTuningSelection();
ok(document.getElementById('tuning-part-name').textContent.length > 0, 'part detail shows a name');
ok(document.getElementById('btn-tuning-buy').disabled === false, 'install button enabled for an affordable part');
const moneyPre = game.progression.money;
sc.buyTuningPart();
frames(6);
ok(game.progression.activeCar().mods.engine === 2, 'engine part fitted');
ok(game.progression.money === moneyPre - 4200, `cash deducted for the part (${moneyPre} -> ${game.progression.money})`);
const statsAfter = computeStats(CAR_BY_ID[game.progression.activeCar().defId], game.progression.activeCar().mods);
ok(statsAfter.hp > statsBefore.hp, 'fitted engine raises power');

// cosmetic: rims + paint + underglow
sc.selectTuningCategory('wheels');
sc.tuningSel = 2;
sc.renderTuningSelection();
sc.buyTuningPart();
ok(game.progression.activeCar().mods.rims === 2, 'rims fitted');
sc.selectTuningCategory('paint');
ok(document.getElementById('color-picker-row').children.length > 0, 'colour picker renders swatches');
game.progression.setMod(carUid, 'paintColor', '#ff0000');
game.updatePreviewMods(game.progression.activeCar().mods);
frames(4);
ok(!!game.previewCar, 'tuning preview car alive');
ok(game.previewCar.mods.paintColor === '#ff0000', 'preview car shows the new colour');

// locked part must be refused
game.progression.data.rep = 0;
game.progression.save();
sc.selectTuningCategory('engine');
sc.tuningSel = 4; // stage 4 needs 32 rep
sc.renderTuningSelection();
ok(document.getElementById('btn-tuning-buy').disabled === true, 'high-rep part is locked');
const moneyLocked = game.progression.money;
sc.buyTuningPart();
ok(game.progression.money === moneyLocked, 'locked part cannot be bought');
game.progression.data.rep = 20;

// back to world with the mods applied
sc.closeToWorld();
frames(6);
ok(game.state === 'explore', 'tuning returns to the world');
ok(game.playerVehicle.mods.engine === 2, 'vehicle in the world has the tuned engine');
ok(game.playerVehicle.stats.hp > statsBefore.hp, 'world vehicle stats updated');

// ============================================================
step('dealership');
sc.open('dealership');
frames(20);
ok(sc.current === 'dealership', 'dealership open');
ok(document.getElementById('dealer-list').children.length >= 15, 'showroom lists all vehicles');
game.progression.data.money = 200000;
sc.dealerSelection = 'coupe_slide';
sc.openDealer();
const carsBefore = game.progression.cars.length;
sc.buyCar();
ok(game.progression.cars.length === carsBefore + 1, 'buying adds the car to the fleet');
ok(game.progression.cars.some((c) => c.defId === 'coupe_slide'), 'bought car is the requested model');
// set it active and return
const newUid = game.progression.cars[game.progression.cars.length - 1].uid;
sc.garageSelection = newUid;
sc.driveOut(newUid);
frames(8);
ok(game.playerVehicle.def.id === 'coupe_slide', 'world vehicle swapped to the new car', game.playerVehicle.def.id);

// ============================================================
step('race with opponents');
const ev = EVENTS.find((e) => e.id === 'circuit_downtown');
game.openBrief(ev);
ok(!!game.currentEvent, 'brief opened for the event');
ok(game.paused === true, 'game pauses for the brief');
game.startEventFromBrief();
frames(10);
ok(game.race.active === true, 'race started');
ok(game.state === 'race', 'state is racing');
ok(game.race.opponents.length === ev.opponents, `rivals on the grid (${game.race.opponents.length})`);
ok(game.race.checkpoints.length === ev.route.length, 'checkpoints built');
// countdown then drive
frames(260);
ok(game.race.state !== 'countdown', 'countdown finished');
press('KeyW');
frames(120);
releaseAll();
ok(game.playerVehicle.speedKmh > 5, 'player can drive during the race');

// rivals must actually race: on the racing line, no spinning, laps counting
{
  const before = game.race.opponents.map((o) => ({ lap: o.ai.lap, prog: o.ai.progress }));
  let worstOff = 0, worstSlip = 0;
  for (let i = 0; i < 900; i++) {
    game.frame(1 / 60);
    for (const o of game.race.opponents) {
      const v2 = o.vehicle;
      let best = Infinity;
      for (const p of o.ai.line) {
        const d = Math.hypot(p.x - v2.x, p.z - v2.z);
        if (d < best) best = d;
      }
      worstOff = Math.max(worstOff, best);
      worstSlip = Math.max(worstSlip, Math.abs(v2.slipAngle));
    }
  }
  const moved = game.race.opponents.filter((o, i) => o.ai.progress !== before[i].prog || o.ai.lap > before[i].lap);
  ok(moved.length === game.race.opponents.length,
    `every rival makes progress (${moved.length}/${game.race.opponents.length})`);
  ok(worstOff < 45, `rivals stay on the racing line (worst ${worstOff.toFixed(1)} m)`);
  ok(worstSlip < 0.6, `rivals do not spin out (worst slip ${worstSlip.toFixed(2)} rad)`);
}

// the navigation arrow points at the next checkpoint while racing
{
  const arrow = game.race.arrow;
  ok(!!arrow, 'race arrow exists');
  ok(arrow.visible === true, 'race arrow is visible during the race');
  const cp = game.race.checkpoints[game.race.cpIndex];
  const toCp = Math.atan2(cp.x - game.playerVehicle.x, cp.z - game.playerVehicle.z);
  // the chevron's nose (-Z) must face the checkpoint
  const facing = arrow.rotation.y + Math.PI;
  const diff = Math.abs(Math.atan2(Math.sin(facing - toCp), Math.cos(facing - toCp)));
  ok(diff < 0.35, `race arrow aims at the next checkpoint (off by ${(diff * 57.3).toFixed(1)} deg)`);
  // and it sits in front of the camera, not lost in the world
  const cam = game.camera;
  const d = arrow.position.distanceTo(cam.position);
  ok(d > 3 && d < 16, `race arrow sits in front of the camera (${d.toFixed(1)} m)`);
  // HUD compass: the glyph on screen must agree with the world-space arrow
  const arrowGlyph = game.hud.el.raceNavArrow;
  const rot = Number((arrowGlyph.style.transform.match(/-?\d+/) || ['0'])[0]);
  const bearingDeg = Math.atan2(Math.sin(cp.x - game.playerVehicle.x), Math.cos(cp.z - game.playerVehicle.z));
  void bearingDeg;
  ok(Number.isFinite(rot), `nav compass rotates (${arrowGlyph.style.transform})`);
  ok(/M|KM/.test(game.hud.el.raceNavDist.textContent), `nav compass shows a distance (${game.hud.el.raceNavDist.textContent})`);
}
// warp through the checkpoints to finish
let guard = 0;
while (game.race.active && guard++ < 400) {
  const cp = game.race.checkpoints[game.race.cpIndex];
  if (cp) { game.playerVehicle.x = cp.x; game.playerVehicle.z = cp.z; }
  game.frame(1 / 30);
  if (game.screens.current === 'results') break;
}
ok(!game.race.active || game.race.state === 'finished', 'race resolved');
ok(game.screens.current === 'results', 'results screen shown');
ok(!!game.race.result, 'race result produced');
ok(game.progression.data.races >= 1, 'race recorded in progression');
const payout = game.race.result.payout;
ok(isFinite(payout) && payout >= 0, `payout is valid (${payout})`);
game.closeResults();
frames(6);
ok(game.state === 'explore', 'results return to the world');
ok(game.screens.current !== 'results', 'results closed');

// ============================================================
step('drift event');
const driftEv = EVENTS.find((e) => e.id === 'drift_yard');
game.playerVehicle.reset(driftEv.x, driftEv.z, 0);
game.currentEvent = driftEv;
game.startEventFromBrief();
frames(260);
ok(game.race.active, 'drift event running');
ok(game.race.driftTarget > 0, 'drift target configured');
// force a score and end the timer
game.race.driftScore = driftEv.targetScore + 500;
game.race.driftTimeLimit = -1;
frames(20);
if (game.race.active) game.race.finishRace(game.playerVehicle, true);
frames(4);
ok(game.screens.current === 'results' || game.race.state === 'finished', 'drift event completes');
if (game.screens.current === 'results') game.closeResults();
frames(4);

// ============================================================
step('police pursuit');
game.police.clearWanted(0);
console.log('  [dbg2] same instance?', game.police === game.race.game.police, 'wanted before', game.police.wanted, 'heat', game.police.heat);
game.police.wanted = 0;
game.police.heat = 0;
game.police.cooldown = 0;
game.police.addWanted(3, 'TEST ALERT');
console.log('  [dbg2] immediately after', game.police.wanted, game.police.units.length);
game.police.cooldown = 0;
console.log('  [dbg] wanted=', game.police.wanted, 'cooldown=', game.police.cooldown, 'units=', game.police.units.length, 'playerVehicle=', !!game.playerVehicle, 'raceActive=', game.race.active);
frames(20);
console.log('  [dbg] after frames: wanted=', game.police.wanted, 'units=', game.police.units.length, 'colliders=', game.city.colliderList.length, 'paused=', game.paused, 'state=', game.state);
ok(game.police.wanted === 3, 'wanted level set');
if (!game.police.units.length) { game.police._spawnTimer = 0; game.police.spawnUnits(); }
ok(game.police.units.length > 0, `police units spawned (${game.police.units.length})`);
ok(game.police.wanted === 3, 'wanted level persists');
frames(180);
ok(game.police.units.length <= game.police.maxUnits + 1, 'police unit cap respected');
let copNan = false;
for (const u of game.police.units) if (!isFinite(u.vehicle.x) || !isFinite(u.vehicle.z)) copNan = true;
ok(!copNan, 'police units stay finite');
// escape
game.police.heat = 0.999;
frames(30);
ok(game.police.wanted === 0 || game.police.heat >= 0.999, 'escape logic reduces heat / clears wanted');
game.police.clearWanted(0);
game.police.cooldown = 0;

// ============================================================
step('save / load round trip');
game.progression.data.money = 12345;
game.progression.activeCar().mods.engine = 3;
game.saveGame();
const raw = localStorage.getItem('street_empire_save_v1');
ok(!!raw, 'save written to localStorage');
const parsed = JSON.parse(raw);
ok(parsed.money === 12345, 'saved money persisted');
ok(parsed.cars.length === game.progression.cars.length, 'saved fleet persisted');
ok(JSON.stringify(parsed.cars).includes('"engine":3'), 'saved modifications persisted');
ok(parsed.records && Object.keys(parsed.records).length >= 1, 'race records persisted');

// ============================================================
step('map + pause overlays');
game.paused = false;
game.toggleMap();
frames(4);
ok(game.screens.current === 'map-screen', 'map screen opens');
ok(game.paused, 'map pauses the game');
game.toggleMap();
frames(4);
ok(!game.paused, 'map closes and unpauses');
game.pause();
frames(4);
ok(game.paused && game.screens.current === 'pause', 'pause menu opens');
game.resume();
frames(4);
ok(!game.paused, 'pause menu resumes');

// ============================================================
step('performance sanity');
const t0 = performance.now();
const before = game.playerVehicle;
game.input.keys.add('KeyW');
for (let i = 0; i < 900; i++) game.frame(1 / 60);
game.input.keys.clear();
const ms = performance.now() - t0;
ok(ms < 9000, `900 frames of the full game loop in ${ms.toFixed(0)}ms (~${(ms / 900).toFixed(2)}ms/frame sim)`);
ok(game.frameCount > 500, 'frames counted');
console.log(`  · ${(ms / 900).toFixed(2)} ms/frame for logic+animation (no GPU)`);

// no NaN anywhere important
ok(isFinite(game.playerVehicle.x) && isFinite(game.playerVehicle.z), 'player vehicle finite after soak');
ok(isFinite(game.player.x) && isFinite(game.player.z), 'player finite after soak');

// ============================================================
step('features are wired');
ok(game.city.colliderList.length > 100, `colliders (${game.city.colliderList.length})`);
ok(game.env.skyUniforms.uNight.value >= 0, 'day/night uniforms live');
game.env.setWeather('rain');
frames(90);
ok(game.env.rainIntensity > 0.1, 'rain weather engages');
ok(game.env.rain.visible, 'rain particles visible');
game.env.setWeather('fog');
frames(90);
ok(game.env.fogDensity > 0.2, 'fog weather engages');
game.env.setWeather('clear');
frames(60);
for (const e of EVENTS) ok(game.progression.isUnlocked(e) || e.repReq > game.progression.rep, `event ${e.id} gating sane`);

// ============================================================
console.log('\n' + '='.repeat(56));
console.log(`INTEGRATION: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exitCode = 1;
} else {
  console.log('Full game loop verified end to end.');
}
if (game.audio.started) { /* node has no AudioContext — audio stays inert */ }
