// ============================================================
// City layout data for SAN VELOR.
// Pure data + generation helpers, consumed by city.js so both the
// 3D world and the minimap read from the same source of truth.
// ============================================================

import { CONFIG } from '../config.js';
import { RNG } from '../core/util.js';

export const GRID = CONFIG.grid;              // x/z centres of the road grid
export const ROAD_HW = CONFIG.world.roadWidth / 2;
export const PAD = 108;                       // block pad footprint
export const PAD_H = 0.16;                    // sidewalk height
export const RING = 470;                      // ring highway centre line
export const RING_HW = 13;

export const BOUND = { minX: -492, maxX: 492, minZ: -492, maxZ: 500 };

export function blockCenters() {
  const out = [];
  for (let j = 0; j < GRID.length - 1; j++) {
    for (let i = 0; i < GRID.length - 1; i++) {
      out.push({
        i, j,
        cx: (GRID[i] + GRID[i + 1]) / 2,
        cz: (GRID[j] + GRID[j + 1]) / 2,
        size: GRID[i + 1] - GRID[i] - CONFIG.world.roadWidth,
      });
    }
  }
  return out;
}

export function districtOf(x, z) {
  if (z > 360 && x > 40) return 'harbor';
  if (x > 170 && z > 170) return 'industrial';
  if (x > 300) return 'midtown';
  if (x > 50 && z < 60) return 'downtown';
  if (x > -190 && x < 60 && z < -50) return 'nightlife';
  if (x < -190 && z < -50) return 'hills';
  if (x < -50 && z > 50) return 'residential';
  if (x > -70 && x < 190 && z > 50 && z <= 300) return 'autos';
  if (x > -190 && x < 60 && z > -60 && z <= 60) return 'strip';
  return 'midtown';
}

export const DISTRICT_LABEL = {
  harbor: 'VELOR HARBOR', industrial: 'IRON YARDS', midtown: 'MIDTOWN',
  downtown: 'DOWNTOWN', nightlife: 'NIGHTLIFE', hills: 'CANYON HILLS',
  residential: 'PALM HEIGHTS', autos: 'AUTO ROW', strip: 'THE STRIP',
};

// ----- specific landmarks ------------------------------------------------
export const POIS = {
  homeGarage: { x: -300, z: 180, name: 'HOME GARAGE', type: 'garage' },
  tuneShop: { x: 240, z: 240, name: 'TORQUE LAB', type: 'tune' },
  dealer: { x: 60, z: 180, name: 'VELOCITY MOTORS', type: 'dealer' },
  meetDock: { x: 240, z: 390, name: 'DOCK MEET', type: 'meet' },
  meetLot: { x: -120, z: 390, name: 'PALM LOT MEET', type: 'meet' },
  driftYard: { x: 300, z: 360, name: 'IRON YARD DRIFT', type: 'drift' },
  gas1: { x: 6, z: 240, name: 'VELOR FUEL', type: 'gas' },
  gas2: { x: 306, z: -6, name: 'SUNSET GAS', type: 'gas' },
  gas3: { x: -174, z: -246, name: 'CANYON STOP', type: 'gas' },
  garage2: { x: 180, z: -180, name: 'MIDTOWN GARAGE', type: 'garage' },
  driver: { x: -282, z: 170, name: 'CUTS & CHROME', type: 'driver' },
};

export function spawnPoint() {
  return { x: -300, z: 186, heading: 0 };
}

// ----- canyon / mountain road -------------------------------------------
// winding climb north-west of the city, outside the ring highway
// Where the canyon loop passes through the ring's guard rail. The rail gets a
// gate across this span so the circuit is drivable end to end.
export const CANYON_GATE = { x1: -448, x2: -344 };

// The single source of truth for the canyon circuit. It lives in the empty
// north-west quadrant (x < -350, z < -330), inside the playable bound, so no
// scattered mountain or skyline box can ever land on the carriageway.
export function canyonRoad() {
  return [
    { x: -372, z: -352 },
    { x: -404, z: -396 },
    { x: -420, z: -450 },
    { x: -410, z: -486 },
    { x: -378, z: -480 },
    { x: -362, z: -434 },
    { x: -374, z: -388 },
    { x: -404, z: -350 },
    { x: -360, z: -332 },
    { x: -410, z: -376 },
    { x: -390, z: -420 },
  ];
}

// ----- stunt yard: ramps and the overpass bridge -------------------------
// Everything the player can drive *over* is declared here, so the physics,
// the meshes and the tests all read the same numbers.
//
// A structure is a rectangle in plan view:
//   x, z     — the LOW end of the centre line (where you drive on)
//   dx, dz   — unit direction of travel up the structure
//   length   — run along that direction
//   width    — usable carriageway width
// A ramp rises linearly to `height` and then ends: the lip launches the car.
// A bridge rises over `rampLen`, holds `deckY` for the deck and comes back
// down over `rampLen`.
export const RAMPS = [
  // the stunt yard kicker: run up from the street at z = 300, launch north
  { id: 'yard_kicker', x: 150, z: 292, dx: 0, dz: -1, length: 26, width: 11, height: 3.0 },
];

export const BRIDGES = [
  // overpass across the Auto Row street (z = 180): it starts on the empty
  // showroom apron, climbs over the traffic, and comes down inside the yard
  { id: 'auto_row_bridge', x: 120, z: 140, dx: 0, dz: 1, length: 88, width: 11, deckY: 5.0, rampLen: 24 },
];

// How high is the drivable surface at (x, z)?
//
// `fromY` is the height the caller is currently at. A surface that lives more
// than ~0.8 m above that is ignored, which is what lets a car drive *under*
// the overpass on the street below without being teleported onto the deck,
// while still climbing the approach ramp smoothly.
export function surfaceHeightAt(x, z, fromY = Infinity) {
  const reach = fromY + 0.8;
  let h = 0;
  for (const r of RAMPS) {
    const px = x - r.x, pz = z - r.z;
    const along = px * r.dx + pz * r.dz;
    const side = Math.abs(px * -r.dz + pz * r.dx);
    if (along < 0 || along > r.length || side > r.width / 2) continue;
    const y = r.height * (along / r.length);
    if (y > h && y <= reach) h = y;
  }
  for (const b of BRIDGES) {
    const px = x - b.x, pz = z - b.z;
    const along = px * b.dx + pz * b.dz;
    const side = Math.abs(px * -b.dz + pz * b.dx);
    if (along < 0 || along > b.length || side > b.width / 2) continue;
    const up = b.deckY * (along / b.rampLen);
    const down = b.deckY * ((b.length - along) / b.rampLen);
    const y = Math.max(0, Math.min(b.deckY, up, down));
    if (y > h && y <= reach) h = y;
  }
  return h;
}

// Is (x, z) on a structure at all? (used to keep scenery off the ramps)
export function onStuntSurface(x, z, pad = 0) {
  for (const r of RAMPS) {
    const px = x - r.x, pz = z - r.z;
    const along = px * r.dx + pz * r.dz;
    const side = Math.abs(px * -r.dz + pz * r.dx);
    if (along > -pad && along < r.length + pad && side < r.width / 2 + pad) return true;
  }
  for (const b of BRIDGES) {
    const px = x - b.x, pz = z - b.z;
    const along = px * b.dx + pz * b.dz;
    const side = Math.abs(px * -b.dz + pz * b.dx);
    if (along > -pad && along < b.length + pad && side < b.width / 2 + pad) return true;
  }
  return false;
}

// ----- race event definitions -------------------------------------------
// route: array of [x,z] checkpoints; the start marker is POIS.eventN
export const EVENTS = [
  {
    id: 'sprint_neon', type: 'sprint', name: 'NEON RUN', district: 'THE STRIP',
    x: -60, z: 300, heading: Math.PI / 2,
    fee: 0, prize: 2400, rep: 3, repReq: 0, laps: 1, opponents: 3,
    desc: 'A point-to-point blast from the Strip up through Nightlife and back down the boulevard. Three rivals, no cameras.',
    route: [[-60, 180], [-60, 60], [-60, -60], [-60, -180], [60, -180], [180, -180], [180, -60], [180, 60], [180, 180], [180, 300], [60, 300], [-60, 300]],
  },
  {
    id: 'circuit_downtown', type: 'circuit', name: 'DOWNTOWN GP', district: 'DOWNTOWN',
    x: 60, z: 60, heading: -Math.PI / 2,
    fee: 800, prize: 5200, rep: 6, repReq: 5, laps: 2, opponents: 4,
    desc: 'Two laps around the towers. Long straights, hard 90-degree corners and a lot of concrete to hit.',
    // a clean rectangle: every leg runs down a street and the closing leg
    // comes home along z = 60 (no diagonal shortcuts across the blocks)
    route: [[-60, 60], [-60, -180], [180, -180], [180, 60]],
  },
  {
    id: 'circuit_highway', type: 'highway', name: 'SUNSET FREEWAY RUN', district: 'HIGHWAY',
    x: 470, z: 300, heading: Math.PI,
    fee: 1500, prize: 9000, rep: 10, repReq: 12, laps: 1, opponents: 4,
    desc: 'Flat out around the San Velor ring at sunset. Top speed matters here — the coastal straight is where races are won.',
    // the corner points sit exactly on the ring's corner so the racing line
    // never clips the inner guard rail
    route: [[470, 60], [470, -240], [470, -470], [300, -470], [0, -470], [-300, -470], [-470, -470], [-470, 0], [-470, 300], [-470, 470], [0, 470], [300, 470], [470, 470]],
  },
  {
    id: 'timeattack_canyon', type: 'timeattack', name: 'CANYON TIME ATTACK', district: 'CANYON HILLS',
    x: -360, z: -300, heading: Math.PI,
    fee: 400, prize: 3600, rep: 8, repReq: 8, laps: 2, opponents: 0, targetTime: 74,
    desc: 'Solo run around the switchback canyon loop. Beat the target time to take the purse.',
    route: [[-404, -396], [-420, -450], [-410, -486], [-378, -480], [-362, -434], [-374, -388], [-404, -350], [-360, -332], [-390, -363]],
  },
  {
    id: 'drift_yard', type: 'drift', name: 'IRON YARD DRIFT BATTLE', district: 'IRON YARDS',
    x: 300, z: 300, heading: Math.PI,
    fee: 300, prize: 3000, rep: 5, repReq: 2, laps: 3, opponents: 0, duration: 60, targetScore: 12000,
    desc: 'Sixty seconds in the container yard. Link drifts, keep the multiplier alive and beat the target score.',
    route: [[300, 340], [300, 390], [306, 360]],
  },
  {
    id: 'meet_show', type: 'meet', name: 'DOCK MEET SHOWDOWN', district: 'VELOR HARBOR',
    x: 240, z: 420, heading: Math.PI,
    fee: 0, prize: 2200, rep: 4, repReq: 3, laps: 1, opponents: 0,
    desc: 'Show your build at the dockside meet. Judges score paint, wheels, stance and aero — then it turns into a 1-lap sprint.',
    route: [[240, 300], [300, 300], [300, 420], [180, 420]],
  },
  {
    id: 'underground_night', type: 'sprint', name: 'UNDERGROUND: BLACKOUT', district: 'NIGHTLIFE',
    x: -180, z: -180, heading: 0,
    fee: 5000, prize: 24000, rep: 18, repReq: 30, laps: 1, opponents: 5,
    desc: 'High-stakes invite-only street race. Five of the fastest cars in San Velor, one route, no second chances.',
    route: [[-180, -60], [-60, -60], [60, -60], [180, -60], [300, -60], [300, -180], [300, -300], [180, -300], [60, -300], [-60, -300], [-180, -300], [-180, -180]],
  },
  {
    id: 'sprint_stunt', type: 'timeattack', name: 'HANGAR 16 RUN', district: 'AUTO ROW',
    x: 150, z: 300, heading: Math.PI / 2,
    fee: 0, prize: 2000, rep: 3, repReq: 0, laps: 1, opponents: 0, targetTime: 62,
    desc: 'Straight off the street and up the kicker in the stunt yard, then a full lap over the Auto Row overpass. Hits the ramp flat out or you are already too slow.',
    route: [[150, 292], [150, 272], [146, 258], [136, 244], [122, 232], [120, 216], [120, 200], [120, 180], [120, 152], [60, 120], [60, 180], [60, 300], [110, 300]],
  },
  {
    id: 'circuit_autos', type: 'circuit', name: 'AUTO ROW CIRCUIT', district: 'AUTO ROW',
    x: 180, z: 300, heading: 0,
    fee: 600, prize: 4200, rep: 5, repReq: 4, laps: 2, opponents: 4,
    desc: 'Two laps of the showroom district. Wide boulevards, four 90-degree corners and a freeway overpass to duck under.',
    route: [[300, 300], [300, 180], [180, 180], [120, 180], [60, 180], [60, 300]],
  },
  {
    id: 'sprint_palms', type: 'sprint', name: 'PALM HEIGHTS RUN', district: 'PALM HEIGHTS',
    x: -420, z: 300, heading: Math.PI / 2,
    fee: 900, prize: 5600, rep: 7, repReq: 6, laps: 1, opponents: 4,
    desc: 'Flat out down the western boulevard, then a hard left onto the ring for the run home. Long gears matter here.',
    route: [[-420, 180], [-420, 60], [-300, 60], [-180, 60], [-60, 60], [60, 60], [180, 60], [300, 60]],
  },
  {
    id: 'drift_hangar', type: 'drift', name: 'HANGAR 16 DRIFT', district: 'AUTO ROW',
    x: 120, z: 296, heading: Math.PI / 2,
    fee: 200, prize: 3400, rep: 6, repReq: 3, laps: 2, opponents: 0, duration: 60, targetScore: 15000,
    desc: 'The concrete yard behind the showrooms, with a kicker in the middle of it. Link the figure-eight and keep the multiplier alive.',
    route: [[120, 276], [150, 250], [120, 216], [86, 250]],
  },
  {
    id: 'delivery_2', type: 'delivery', name: 'COLD CHAIN', district: 'IRON YARDS',
    x: 120, z: 420, heading: Math.PI,
    fee: 0, prize: 2100, rep: 3, repReq: 2, laps: 1, opponents: 0, targetTime: 78,
    desc: 'A second run for the dock foreman: the crate has to reach the Torque Lab before the ice melts.',
    route: [[180, 420], [180, 300], [240, 300], [240, 240]],
  },
  {
    id: 'delivery_1', type: 'delivery', name: 'HOT CARGO', district: 'VELOR HARBOR',
    x: 60, z: 390, heading: 0,
    fee: 0, prize: 1400, rep: 2, repReq: 0, laps: 1, opponents: 0, targetTime: 70,
    desc: 'The dock foreman needs a package at the dealership before the cops notice. Beat the clock — and avoid the patrol cars.',
    route: [[120, 300], [180, 180], [120, 300], [60, 180]],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ----- static prop layout (gas stations, meets, etc.) --------------------
export const LOTS = [
  { id: 'homeLot', x: -300, z: 180, w: 46, d: 40, kind: 'lot' },
  { id: 'meetDockLot', x: 240, z: 390, w: 150, d: 40, kind: 'meet' },
  { id: 'meetPalmLot', x: -120, z: 390, w: 100, d: 36, kind: 'meet' },
  { id: 'driftLot', x: 300, z: 360, w: 70, d: 46, kind: 'drift' },
  { id: 'dealerLot', x: 60, z: 180, w: 40, d: 30, kind: 'dealer' },
  { id: 'tuneLot', x: 240, z: 240, w: 38, d: 32, kind: 'tune' },
  { id: 'parkGarage', x: 120, z: -240, w: 34, d: 30, kind: 'garage' },
  // stunt yard + the overpass approach: both blocks stay open pavement
  { id: 'stuntLot', x: 120, z: 240, w: 92, d: 92, kind: 'stunt' },
  { id: 'overpassLot', x: 120, z: 120, w: 92, d: 92, kind: 'stunt' },
];

// A forecourt is 20 x 13 m with canopy columns at +-8.5 m and a kiosk at
// -12 m, so it has to sit in the open middle of a block: on a crossing the
// columns and pumps ended up standing in the carriageway.
export const GAS_STATIONS = [
  { x: 6, z: 240 },
  { x: 306, z: -6 },
  { x: -174, z: -246 },
];

// ----- traffic network ---------------------------------------------------
export function buildRoadNetwork() {
  const nodes = [];
  const idx = (i, j, d) => (i * 100 + j) * 10 + d;
  const list = new Map();
  const addNode = (i, j, d, x, z) => {
    const n = { i, j, d, x, z, id: idx(i, j, d) };
    list.set(n.id, n);
    nodes.push(n);
    return n;
  };
  const off = 4.2;
  const dirs = [
    { d: 0, dx: 1, dz: 0 },   // east
    { d: 1, dx: 0, dz: 1 },   // south
    { d: 2, dx: -1, dz: 0 },  // west
    { d: 3, dx: 0, dz: -1 },  // north
  ];
  for (let j = 0; j < GRID.length; j++) {
    for (let i = 0; i < GRID.length; i++) {
      for (const dd of dirs) {
        let x = GRID[i], z = GRID[j];
        if (dd.d === 0) z += off;
        else if (dd.d === 1) x -= off;
        else if (dd.d === 2) z -= off;
        else x += off;
        addNode(i, j, dd.d, x, z);
      }
    }
  }
  const neighbours = (node, allowTurn = true) => {
    const out = [];
    const { i, j, d } = node;
    const N = GRID.length;
    for (const dd of dirs) {
      const straight = dd.d === d;
      const opposite = (dd.d + 2) % 4 === d;
      if (!allowTurn && !straight) continue;
      if (opposite) continue;
      const ni = i + dd.dx, nj = j + dd.dz;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = list.get(idx(ni, nj, dd.d));
      if (!n) continue;
      out.push({ node: n, turn: straight ? 0 : (dd.d === (d + 1) % 4 ? 1 : -1) });
    }
    return out;
  };
  return { nodes, list, idx, neighbours, dirs };
}

// waypoint list for a route (for minimap + AI pathing)
export function routePoints(ev) {
  const pts = [[ev.x, ev.z], ...ev.route];
  if (ev.type === 'circuit' || ev.type === 'highway') pts.push([ev.x, ev.z]);
  return pts;
}
