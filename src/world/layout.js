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
  gas1: { x: -60, z: 300, name: 'VELOR FUEL', type: 'gas' },
  gas2: { x: 300, z: -60, name: 'SUNSET GAS', type: 'gas' },
  gas3: { x: -180, z: -300, name: 'CANYON STOP', type: 'gas' },
  garage2: { x: 180, z: -180, name: 'MIDTOWN GARAGE', type: 'garage' },
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

// ----- race event definitions -------------------------------------------
// route: array of [x,z] checkpoints; the start marker is POIS.eventN
export const EVENTS = [
  {
    id: 'sprint_neon', type: 'sprint', name: 'NEON RUN', district: 'THE STRIP',
    x: -60, z: 300, heading: Math.PI / 2,
    fee: 0, prize: 2400, rep: 3, repReq: 0, laps: 1, opponents: 3,
    desc: 'A point-to-point blast from the Strip up through Nightlife and back down the boulevard. Three rivals, no cameras.',
    route: [[-60, 180], [-60, 60], [-60, -60], [-60, -180], [60, -180], [180, -180], [180, -60], [180, 60], [180, 180], [180, 300]],
  },
  {
    id: 'circuit_downtown', type: 'circuit', name: 'DOWNTOWN GP', district: 'DOWNTOWN',
    x: 60, z: 60, heading: -Math.PI / 2,
    fee: 800, prize: 5200, rep: 6, repReq: 5, laps: 2, opponents: 4,
    desc: 'Two laps around the towers. Long straights, hard 90-degree corners and a lot of concrete to hit.',
    route: [[-60, 60], [-60, -180], [180, -180], [180, 120], [60, 120], [60, 60], [60, -60], [-60, -60]],
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
    x: -372, z: -352, heading: 0,
    fee: 400, prize: 3600, rep: 8, repReq: 8, laps: 2, opponents: 0, targetTime: 74,
    desc: 'Solo run around the switchback canyon loop. Beat the target time to take the purse.',
    route: [[-404, -396], [-420, -450], [-410, -486], [-378, -480], [-362, -434], [-374, -388], [-404, -350], [-360, -332], [-410, -376], [-390, -420], [-372, -352]],
  },
  {
    id: 'drift_yard', type: 'drift', name: 'IRON YARD DRIFT BATTLE', district: 'IRON YARDS',
    x: 300, z: 360, heading: 0,
    fee: 300, prize: 3000, rep: 5, repReq: 2, laps: 3, opponents: 0, duration: 60, targetScore: 12000,
    desc: 'Sixty seconds in the container yard. Link drifts, keep the multiplier alive and beat the target score.',
    route: [[240, 360], [300, 330], [360, 360], [300, 390]],
  },
  {
    id: 'meet_show', type: 'meet', name: 'DOCK MEET SHOWDOWN', district: 'VELOR HARBOR',
    x: 240, z: 390, heading: 0,
    fee: 0, prize: 2200, rep: 4, repReq: 3, laps: 1, opponents: 0,
    desc: 'Show your build at the dockside meet. Judges score paint, wheels, stance and aero — then it turns into a 1-lap sprint.',
    route: [[240, 330], [300, 300], [360, 360], [300, 420], [240, 390]],
  },
  {
    id: 'underground_night', type: 'sprint', name: 'UNDERGROUND: BLACKOUT', district: 'NIGHTLIFE',
    x: -180, z: -180, heading: 0,
    fee: 5000, prize: 24000, rep: 18, repReq: 30, laps: 1, opponents: 5,
    desc: 'High-stakes invite-only street race. Five of the fastest cars in San Velor, one route, no second chances.',
    route: [[-180, -60], [-60, -60], [60, -60], [180, -60], [300, -60], [300, -180], [300, -300], [180, -300], [60, -300], [-60, -300], [-180, -300], [-180, -180]],
  },
  {
    id: 'delivery_1', type: 'delivery', name: 'HOT CARGO', district: 'VELOR HARBOR',
    x: 60, z: 390, heading: 0,
    fee: 0, prize: 1400, rep: 2, repReq: 0, laps: 1, opponents: 0, targetTime: 70,
    desc: 'The dock foreman needs a package at the dealership before the cops notice. Beat the clock — and avoid the patrol cars.',
    route: [[120, 300], [180, 180], [120, 120], [60, 180]],
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
];

export const GAS_STATIONS = [
  { x: -60, z: 300 },
  { x: 300, z: -60 },
  { x: -180, z: -300 },
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
