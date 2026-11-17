// ============================================================
// STREET EMPIRE — vehicle catalogue, tuning parts, stat engine
// All vehicles are original fictional designs inspired by the
// automotive eras of the 1990s/2000s. No real manufacturer marks.
// ============================================================

export const DRIVETRAINS = ['FWD', 'RWD', 'AWD'];

// --- base vehicle definitions -----------------------------------------------
// power in hp, weight kg, topSpeed km/h, accel = 0-100 km/h seconds
export const CAR_DEFS = [
  {
    id: 'hatch_kei', name: 'Hoshino CX', brand: 'Hoshino', year: 1992,
    class: 'COMPACT HATCH', drivetrain: 'FWD', price: 3200, repReq: 0,
    hp: 118, weight: 1010, topSpeed: 176, accel: 9.4, handling: 58, brake: 52,
    gears: 5, engine: '4cyl', sound: 'i4', defaultColor: '#b9c4cd',
    body: { type: 'hatch', length: 4.05, width: 1.72, height: 1.32, wheelbase: 2.52, track: 1.46,
      wheelR: 0.30, wheelW: 0.20, rideHeight: 0.30, hoodLen: 1.05, cabinLen: 1.85, cabinOffset: -0.10,
      roofH: 0.62, style: 'econ' },
  },
  {
    id: 'coupe_zen', name: 'Kaido Zen RS', brand: 'Kaido', year: 1995,
    class: 'JDM SPORTS COUPE', drivetrain: 'RWD', price: 9800, repReq: 0,
    hp: 236, weight: 1240, topSpeed: 232, accel: 6.0, handling: 72, brake: 68,
    gears: 5, engine: 'i4turbo', sound: 'i4', defaultColor: '#e8eef2',
    body: { type: 'coupe', length: 4.52, width: 1.79, height: 1.24, wheelbase: 2.62, track: 1.52,
      wheelR: 0.33, wheelW: 0.24, rideHeight: 0.26, hoodLen: 1.35, cabinLen: 1.62, cabinOffset: -0.28,
      roofH: 0.56, style: 'jdm', spoiler: true },
  },
  {
    id: 'coupe_slide', name: 'Nakamura S14 Slider', brand: 'Nakamura', year: 1996,
    class: 'DRIFT COUPE', drivetrain: 'RWD', price: 11500, repReq: 4,
    hp: 248, weight: 1200, topSpeed: 228, accel: 6.2, handling: 76, brake: 66,
    gears: 5, engine: 'i4turbo', sound: 'i4', defaultColor: '#25303c',
    body: { type: 'coupe', length: 4.55, width: 1.80, height: 1.22, wheelbase: 2.64, track: 1.54,
      wheelR: 0.33, wheelW: 0.26, rideHeight: 0.24, hoodLen: 1.40, cabinLen: 1.58, cabinOffset: -0.32,
      roofH: 0.54, style: 'jdm', spoiler: true },
  },
  {
    id: 'sedan_evo', name: 'Tatsumi Evo IV', brand: 'Tatsumi', year: 1997,
    class: 'RALLY SEDAN', drivetrain: 'AWD', price: 21500, repReq: 10,
    hp: 276, weight: 1330, topSpeed: 245, accel: 5.2, handling: 82, brake: 74,
    gears: 6, engine: 'i4turbo', sound: 'i4', defaultColor: '#d8dde2',
    body: { type: 'sedan', length: 4.62, width: 1.82, height: 1.38, wheelbase: 2.66, track: 1.56,
      wheelR: 0.34, wheelW: 0.25, rideHeight: 0.30, hoodLen: 1.30, cabinLen: 1.72, cabinOffset: -0.20,
      roofH: 0.62, style: 'rally', spoiler: true },
  },
  {
    id: 'coupe_z3', name: 'Nakamura 260Z', brand: 'Nakamura', year: 1978,
    class: 'CLASSIC TUNER', drivetrain: 'RWD', price: 14200, repReq: 6,
    hp: 208, weight: 1120, topSpeed: 216, accel: 7.2, handling: 68, brake: 52,
    gears: 5, engine: 'i6', sound: 'i6', defaultColor: '#8a1f22',
    body: { type: 'coupe', length: 4.42, width: 1.72, height: 1.20, wheelbase: 2.48, track: 1.48,
      wheelR: 0.33, wheelW: 0.24, rideHeight: 0.26, hoodLen: 1.52, cabinLen: 1.28, cabinOffset: -0.42,
      roofH: 0.52, style: 'classic' },
  },
  {
    id: 'exotic_aoi', name: 'Aoi Kuro GT', brand: 'Aoi', year: 1993,
    class: 'EXOTIC COUPE', drivetrain: 'RWD', price: 42000, repReq: 22,
    hp: 302, weight: 1080, topSpeed: 268, accel: 4.6, handling: 88, brake: 80,
    gears: 6, engine: 'v6', sound: 'v6', defaultColor: '#f0f2ec',
    body: { type: 'exotic', length: 4.42, width: 1.82, height: 1.11, wheelbase: 2.56, track: 1.60,
      wheelR: 0.33, wheelW: 0.26, rideHeight: 0.20, hoodLen: 1.32, cabinLen: 1.38, cabinOffset: -0.18,
      roofH: 0.48, style: 'exotic', spoiler: true },
  },
  {
    id: 'sedan_kessler', name: 'Kessler K3 S', brand: 'Kessler', year: 1997,
    class: 'GERMAN SEDAN', drivetrain: 'RWD', price: 24500, repReq: 12,
    hp: 316, weight: 1450, topSpeed: 252, accel: 5.3, handling: 80, brake: 76,
    gears: 6, engine: 'i6', sound: 'i6', defaultColor: '#1b2027',
    body: { type: 'sedan', length: 4.68, width: 1.78, height: 1.38, wheelbase: 2.72, track: 1.52,
      wheelR: 0.34, wheelW: 0.25, rideHeight: 0.28, hoodLen: 1.34, cabinLen: 1.78, cabinOffset: -0.16,
      roofH: 0.60, style: 'german' },
  },
  {
    id: 'sedan_rhein', name: 'Rheinland 540', brand: 'Rheinland', year: 1994,
    class: 'EXECUTIVE SEDAN', drivetrain: 'RWD', price: 16800, repReq: 5,
    hp: 264, weight: 1520, topSpeed: 244, accel: 6.6, handling: 71, brake: 70,
    gears: 5, engine: 'v8', sound: 'v8', defaultColor: '#2c3f4a',
    body: { type: 'sedan', length: 4.86, width: 1.82, height: 1.40, wheelbase: 2.80, track: 1.55,
      wheelR: 0.35, wheelW: 0.25, rideHeight: 0.30, hoodLen: 1.42, cabinLen: 1.82, cabinOffset: -0.14,
      roofH: 0.62, style: 'german' },
  },
  {
    id: 'sport_milano', name: 'Milano Veloce V8', brand: 'Milano', year: 1990,
    class: 'EURO SPORTS', drivetrain: 'RWD', price: 36500, repReq: 18,
    hp: 326, weight: 1490, topSpeed: 276, accel: 4.9, handling: 84, brake: 78,
    gears: 6, engine: 'v8', sound: 'v8', defaultColor: '#c02020',
    body: { type: 'exotic', length: 4.55, width: 1.90, height: 1.19, wheelbase: 2.60, track: 1.62,
      wheelR: 0.35, wheelW: 0.28, rideHeight: 0.24, hoodLen: 1.30, cabinLen: 1.44, cabinOffset: -0.16,
      roofH: 0.52, style: 'euro' },
  },
  {
    id: 'hatch_walden', name: 'Walden GTi Cup', brand: 'Walden', year: 1998,
    class: 'HOT HATCH', drivetrain: 'FWD', price: 8400, repReq: 2,
    hp: 168, weight: 1120, topSpeed: 210, accel: 7.4, handling: 66, brake: 60,
    gears: 5, engine: 'i4turbo', sound: 'i4', defaultColor: '#e0c72a',
    body: { type: 'hatch', length: 4.15, width: 1.74, height: 1.36, wheelbase: 2.52, track: 1.50,
      wheelR: 0.31, wheelW: 0.22, rideHeight: 0.28, hoodLen: 1.10, cabinLen: 1.92, cabinOffset: -0.10,
      roofH: 0.64, style: 'euro', spoiler: true },
  },
  {
    id: 'muscle_vanguard', name: 'Vanguard GT 350', brand: 'Vanguard', year: 1969,
    class: 'AMERICAN MUSCLE', drivetrain: 'RWD', price: 19800, repReq: 8,
    hp: 290, weight: 1560, topSpeed: 232, accel: 6.4, handling: 58, brake: 56,
    gears: 4, engine: 'v8', sound: 'v8muscle', defaultColor: '#1d3f6b',
    body: { type: 'muscle', length: 4.94, width: 1.92, height: 1.28, wheelbase: 2.86, track: 1.62,
      wheelR: 0.35, wheelW: 0.28, rideHeight: 0.30, hoodLen: 1.68, cabinLen: 1.36, cabinOffset: -0.40,
      roofH: 0.54, style: 'muscle', spoiler: false },
  },
  {
    id: 'muscle_stallion', name: 'Stallion 427 Bandit', brand: 'Stallion', year: 1971,
    class: 'AMERICAN MUSCLE', drivetrain: 'RWD', price: 27500, repReq: 14,
    hp: 384, weight: 1620, topSpeed: 248, accel: 5.4, handling: 56, brake: 58,
    gears: 4, engine: 'v8', sound: 'v8muscle', defaultColor: '#191919',
    body: { type: 'muscle', length: 5.02, width: 1.96, height: 1.26, wheelbase: 2.92, track: 1.66,
      wheelR: 0.36, wheelW: 0.30, rideHeight: 0.28, hoodLen: 1.74, cabinLen: 1.32, cabinOffset: -0.44,
      roofH: 0.52, style: 'muscle' },
  },
  {
    id: 'muscle_coronet', name: 'Coronet Hardtop', brand: 'Coronet', year: 1966,
    class: 'CLASSIC CRUISER', drivetrain: 'RWD', price: 7200, repReq: 0,
    hp: 198, weight: 1480, topSpeed: 196, accel: 9.2, handling: 48, brake: 46,
    gears: 3, engine: 'v8', sound: 'v8muscle', defaultColor: '#6b7f52',
    body: { type: 'sedan', length: 5.10, width: 1.92, height: 1.36, wheelbase: 2.94, track: 1.62,
      wheelR: 0.36, wheelW: 0.26, rideHeight: 0.32, hoodLen: 1.52, cabinLen: 1.86, cabinOffset: -0.20,
      roofH: 0.58, style: 'classic' },
  },
  {
    id: 'drift_nagata', name: 'Nagata S13 ' + 'Drift King', brand: 'Nagata', year: 1991,
    class: 'DRIFT COUPE', drivetrain: 'RWD', price: 13400, repReq: 7,
    hp: 262, weight: 1180, topSpeed: 236, accel: 5.9, handling: 79, brake: 64,
    gears: 5, engine: 'i4turbo', sound: 'i4', defaultColor: '#c9ccd1',
    body: { type: 'coupe', length: 4.50, width: 1.78, height: 1.24, wheelbase: 2.60, track: 1.52,
      wheelR: 0.32, wheelW: 0.26, rideHeight: 0.22, hoodLen: 1.34, cabinLen: 1.54, cabinOffset: -0.30,
      roofH: 0.55, style: 'jdm', spoiler: true },
  },
  {
    id: 'suv_path', name: 'Ridgeway Scout', brand: 'Ridgeway', year: 1996,
    class: 'UTILITY SUV', drivetrain: 'AWD', price: 12800, repReq: 3,
    hp: 214, weight: 1890, topSpeed: 190, accel: 9.0, handling: 50, brake: 56,
    gears: 4, engine: 'v8', sound: 'v8', defaultColor: '#3d4a3a',
    body: { type: 'suv', length: 4.78, width: 1.95, height: 1.78, wheelbase: 2.86, track: 1.62,
      wheelR: 0.40, wheelW: 0.28, rideHeight: 0.46, hoodLen: 1.36, cabinLen: 2.30, cabinOffset: -0.10,
      roofH: 0.92, style: 'truck' },
  },
  {
    id: 'exotic_velor', name: 'Velor V12 Superleggera', brand: 'Velor', year: 2002,
    class: 'SUPERCAR', drivetrain: 'AWD', price: 132000, repReq: 40,
    hp: 552, weight: 1420, topSpeed: 328, accel: 3.4, handling: 92, brake: 88,
    gears: 6, engine: 'v12', sound: 'v12', defaultColor: '#f2b21a',
    body: { type: 'exotic', length: 4.62, width: 2.02, height: 1.14, wheelbase: 2.66, track: 1.70,
      wheelR: 0.35, wheelW: 0.34, rideHeight: 0.18, hoodLen: 1.28, cabinLen: 1.30, cabinOffset: -0.10,
      roofH: 0.50, style: 'super', spoiler: true },
  },
  {
    id: 'van_delivery', name: 'Haulmaster Cargo', brand: 'Haulmaster', year: 1989,
    class: 'DELIVERY VAN', drivetrain: 'RWD', price: 4200, repReq: 0,
    hp: 152, weight: 2050, topSpeed: 165, accel: 13.0, handling: 44, brake: 44,
    gears: 4, engine: 'v8', sound: 'v8', defaultColor: '#cfd4d8',
    body: { type: 'van', length: 5.10, width: 2.02, height: 2.14, wheelbase: 3.20, track: 1.70,
      wheelR: 0.36, wheelW: 0.24, rideHeight: 0.32, hoodLen: 0.86, cabinLen: 3.60, cabinOffset: -0.10,
      roofH: 1.42, style: 'van' },
  },
];

export const CAR_BY_ID = Object.fromEntries(CAR_DEFS.map((c) => [c.id, c]));

// --- tuning catalogue -------------------------------------------------------
// Each part: id, name, price, desc, rep (rep required), stats {...}, vis {...}
// stats keys: powerMul, torqueMul, weightAdd, gripMul, brakeMul, gearAdd, topMul, shiftMul, dragMul
// Cosmetic parts use vis {} consumed by the car mesh builder.

const P = (id, name, price, desc, stats = {}, extra = {}) => ({ id, name, price, desc, stats, ...extra });

export const TUNE_CATEGORIES = [
  { id: 'engine', name: 'ENGINE', subs: ['engine', 'turbo', 'ecu', 'intake', 'exhaust', 'cooling'] },
  { id: 'transmission', name: 'TRANSMISSION', subs: ['gearbox', 'clutch', 'diff', 'final'] },
  { id: 'suspension', name: 'SUSPENSION', subs: ['suspension', 'ride', 'camber', 'tires'] },
  { id: 'wheels', name: 'WHEELS', subs: ['rims', 'rimSize'] },
  { id: 'exterior', name: 'EXTERIOR', subs: ['frontBumper', 'rearBumper', 'skirts', 'spoiler', 'hood', 'headlights', 'exhaustTip', 'tint', 'livery'] },
  { id: 'paint', name: 'PAINT', subs: ['paintColor', 'finish', 'underglow'] },
  { id: 'interior', name: 'INTERIOR', subs: ['wheel', 'seats', 'dash', 'interiorColor'] },
];

export const SUB_NAMES = {
  engine: 'ENGINE BLOCK', turbo: 'FORCED INDUCTION', ecu: 'ENGINE MANAGEMENT',
  intake: 'INTAKE', exhaust: 'EXHAUST', cooling: 'COOLING',
  gearbox: 'GEARBOX', clutch: 'CLUTCH', diff: 'DIFFERENTIAL', final: 'FINAL DRIVE',
  suspension: 'COILOVERS', ride: 'RIDE HEIGHT', camber: 'CAMBER & ALIGNMENT', tires: 'TIRES',
  rims: 'RIM DESIGN', rimSize: 'RIM SIZE',
  frontBumper: 'FRONT BUMPER', rearBumper: 'REAR BUMPER', skirts: 'SIDE SKIRTS',
  spoiler: 'SPOILER', hood: 'HOOD', headlights: 'HEADLIGHTS', exhaustTip: 'EXHAUST TIPS',
  tint: 'WINDOW TINT', livery: 'LIVERY & DECALS',
  paintColor: 'PAINT COLOR', finish: 'PAINT FINISH', underglow: 'UNDERGLOW',
  wheel: 'STEERING WHEEL', seats: 'SEATS', dash: 'DASHBOARD', interiorColor: 'INTERIOR TRIM',
};

export const PARTS = {
  engine: [
    P('e0', 'Factory Long Block', 0, 'Stock internals. Reliable and slow.', { powerMul: 1 }),
    P('e1', 'Stage 1 — Cams & Header', 1400, 'Hot cams, ported head and a tubular header. +9% power.', { powerMul: 1.09 }, { rep: 0 }),
    P('e2', 'Stage 2 — Forged Rotating Assembly', 4200, 'Forged rods and pistons, balanced crank. +22% power, +8kg.', { powerMul: 1.22, weightAdd: 8 }, { rep: 6 }),
    P('e3', 'Stage 3 — Stroker Long Block', 9800, 'Big-bore stroker build with ported heads. +38% power, +14kg.', { powerMul: 1.38, weightAdd: 14 }, { rep: 18 }),
    P('e4', 'Stage 4 — Race Spec (unregistered)', 21000, 'Competition-spec long block built for the underground. +58% power.', { powerMul: 1.58, weightAdd: 18, gripMul: 0.98 }, { rep: 32 }),
  ],
  turbo: [
    P('t0', 'Naturally Aspirated', 0, 'No forced induction.', {}),
    P('t1', 'Single Turbo Kit', 5600, 'Laggy but strong. +26% peak power.', { powerMul: 1.26, weightAdd: 22 }, { rep: 4 }),
    P('t2', 'Ball-Bearing Turbo', 11200, 'Faster spool, better top end. +44% power.', { powerMul: 1.44, weightAdd: 26 }, { rep: 16 }),
    P('t3', 'Twin-Charge System', 19800, 'Twin turbo with anti-lag. +62% power, brutal response.', { powerMul: 1.62, weightAdd: 34, gripMul: 1.02 }, { rep: 30 }),
  ],
  ecu: [
    P('c0', 'Factory Map', 0, 'Conservative OEM tune.', {}),
    P('c1', 'Piggyback Tune', 900, 'Chip tune with raised limiter. +4% power.', { powerMul: 1.04 }),
    P('c2', 'Standalone ECU', 2600, 'Full standalone with launch control. +8% power.', { powerMul: 1.08, shiftMul: 1.08 }, { rep: 8 }),
    P('c3', 'Dyno Map + Anti-Lag', 6400, 'Custom map for your build. +12% power, faster shifts.', { powerMul: 1.12, shiftMul: 1.14 }, { rep: 20 }),
  ],
  intake: [
    P('i0', 'Stock Airbox', 0, 'Quiet and restrictive.', {}),
    P('i1', 'Cold Air Intake', 420, 'More air, more induction noise. +3% power.', { powerMul: 1.03 }),
    P('i2', 'Race Intake Manifold', 1400, 'Short-runner manifold. +6% power.', { powerMul: 1.06 }, { rep: 6 }),
    P('i3', 'Individual Throttle Bodies', 3900, 'One throttle per cylinder. +10% power, razor response.', { powerMul: 1.10 }, { rep: 18 }),
  ],
  exhaust: [
    P('x0', 'Stock Exhaust', 0, 'Muffled and heavy.', {}),
    P('x1', 'Cat-Back System', 820, 'Free-flowing cat-back. +4% power, -6kg.', { powerMul: 1.04, weightAdd: -6 }),
    P('x2', 'Full Titanium System', 2400, 'Titanium header-back. +7% power, -14kg.', { powerMul: 1.07, weightAdd: -14 }, { rep: 8 }),
    P('x3', 'Side Exit Race Pipe', 4100, 'Straight-through side exit. +11% power, -20kg, obnoxiously loud.', { powerMul: 1.11, weightAdd: -20 }, { rep: 22 }),
  ],
  cooling: [
    P('co0', 'Stock Radiator', 0, 'Fine for the street.', {}),
    P('co1', 'Alloy Radiator', 620, 'Bigger core. Sustained power.', { powerMul: 1.01 }),
    P('co2', 'Oil Cooler + Fans', 1500, 'Keeps temps down on long races. +2% power.', { powerMul: 1.02, gripMul: 1.01 }, { rep: 10 }),
  ],
  gearbox: [
    P('g0', 'Stock Gearbox', 0, 'Factory ratios.', {}),
    P('g1', 'Close-Ratio Set', 2100, 'Tighter ratios. Faster acceleration, more shifting.', { gearAdd: 0, shiftMul: 1.10, topMul: 0.99 }, { rep: 5 }),
    P('g2', '6-Speed Conversion', 5200, 'Six-speed box with short throw. +1 gear.', { gearAdd: 1, shiftMul: 1.18 }, { rep: 14 }),
    P('g3', 'Sequential Dog Box', 9600, 'Race sequential with flat-shift. Instant shifts.', { gearAdd: 1, shiftMul: 1.4 }, { rep: 26 }),
  ],
  clutch: [
    P('cl0', 'Stock Clutch', 0, 'Daily-driver feel.', {}),
    P('cl1', 'Stage 2 Clutch', 950, 'Holds more torque, sharper engagement.', { shiftMul: 1.05 }),
    P('cl2', 'Twin-Plate Race Clutch', 2400, 'Very sharp, very fast. -4kg.', { shiftMul: 1.14, weightAdd: -4 }, { rep: 12 }),
  ],
  diff: [
    P('d0', 'Open Differential', 0, 'One wheel peels.', {}),
    P('d1', 'Clutch-Type LSD', 1600, 'Locks both wheels on power. Better corner exit.', { gripMul: 1.04 }, { rep: 4 }),
    P('d2', 'Welded / 2-Way LSD', 1200, 'Fully locked. Perfect for drifting, terrible for parking.', { gripMul: 0.98, driftMul: 1.25 }, { rep: 8 }),
  ],
  final: [
    P('f0', 'Stock Final Drive', 0, 'Balanced.', {}),
    P('f1', 'Short Final Drive (4.30)', 780, 'More acceleration, lower top speed.', { topMul: 0.96, powerMul: 1.03 }),
    P('f2', 'Long Final Drive (3.10)', 780, 'Higher top speed, lazier off the line.', { topMul: 1.05, powerMul: 0.98 }),
  ],
  suspension: [
    P('s0', 'Stock Suspension', 0, 'Soft springs, lots of body roll.', {}),
    P('s1', 'Sport Spring Kit', 680, 'Lower, stiffer, better turn-in.', { gripMul: 1.05 }),
    P('s2', 'Adjustable Coilovers', 2100, 'Full height and damping adjustment.', { gripMul: 1.11 }, { rep: 5 }),
    P('s3', 'Track Coilovers + Sway Bars', 4300, 'Race-spec valving. Flat cornering.', { gripMul: 1.17, weightAdd: -6 }, { rep: 14 }),
    P('s4', 'Hydraulic Drift Knuckles', 3900, 'Huge steering angle for drifting.', { gripMul: 1.06, driftMul: 1.3 }, { rep: 18 }),
  ],
  ride: [
    P('r0', 'Stock Ride Height', 0, 'Standard stance.', { rideHeight: 0 }),
    P('r1', 'Lowered 30mm', 340, 'Clean stance with a small handling gain.', { rideHeight: -0.05, gripMul: 1.02 }),
    P('r2', 'Slammed 60mm', 340, 'Aggressive stance. Watch the speedbumps.', { rideHeight: -0.09, gripMul: 1.03 }),
    P('r3', 'Stanced / On the Floor', 520, 'Show-stance. Corners worse, looks perfect.', { rideHeight: -0.14, gripMul: 0.97 }, { rep: 8 }),
  ],
  camber: [
    P('ca0', 'Factory Alignment', 0, 'Normal camber.', { camber: 0 }),
    P('ca1', 'Street Alignment', 620, 'Mild negative camber for grip.', { camber: -0.06, gripMul: 1.03 }),
    P('ca2', 'Track Alignment', 1400, 'Aggressive camber and toe.', { camber: -0.10, gripMul: 1.06 }, { rep: 10 }),
    P('ca3', 'Drift Alignment', 900, 'Max steering lock with camber. Style points.', { camber: -0.14, gripMul: 0.99, driftMul: 1.12 }, { rep: 12 }),
  ],
  tires: [
    P('ti0', 'All-Season Tires', 0, 'Long-wearing, low grip.', { gripMul: 0.9 }),
    P('ti1', 'Street Performance', 0, 'Standard upgrade tires.', { gripMul: 1.0 }),
    P('ti2', 'Semi-Slick R-Compounds', 2600, 'Huge grip on dry tarmac.', { gripMul: 1.16 }, { rep: 8 }),
    P('ti3', 'Drift-Spec Rear Tires', 1800, 'Hard compound rear. Slides on command.', { gripMul: 0.94, driftMul: 1.35 }, { rep: 10 }),
    P('ti4', 'Racing Slicks', 6200, 'Maximum dry grip. Punishes mistakes.', { gripMul: 1.26 }, { rep: 22 }),
  ],
  rims: [
    P('rm0', 'Steel Wheels', 0, 'Stock steelies with hubcaps.', { weightAdd: 0, vis: { spokes: 0, rimStyle: 'steel' } }),
    P('rm1', 'Six-Spoke Alloy', 900, 'Classic tuner six-spoke.', { weightAdd: -6, vis: { spokes: 6, rimStyle: 'mesh' } }),
    P('rm2', 'Deep Dish Five', 1400, 'Deep-dish five-spoke in polished chrome.', { weightAdd: -8, vis: { spokes: 5, rimStyle: 'dish' } }, { rep: 4 }),
    P('rm3', 'Split-Spoke Forged', 2600, 'Lightweight forged split-spoke.', { weightAdd: -11, gripMul: 1.01, vis: { spokes: 10, rimStyle: 'forged' } }, { rep: 12 }),
    P('rm4', 'Mesh Racing', 3400, 'Fine mesh race wheel.', { weightAdd: -13, vis: { spokes: 12, rimStyle: 'mesh' } }, { rep: 20 }),
    P('rm5', 'Neon Ring Special', 5200, 'Underground show wheel with lit lip.', { weightAdd: -10, vis: { spokes: 5, rimStyle: 'neon' } }, { rep: 28 }),
  ],
  rimSize: [
    P('rs0', '16" Wheels', 0, 'Stock size, thick sidewall.', { vis: { rimScale: 0.94 } }),
    P('rs1', '17" Wheels', 600, 'Slightly larger, sharper turn-in.', { gripMul: 1.01, vis: { rimScale: 1.0 } }),
    P('rs2', '18" Wheels', 1300, 'Show-ready sizing.', { gripMul: 1.02, topMul: 0.99, vis: { rimScale: 1.06 } }, { rep: 6 }),
    P('rs3', '19" Wheels', 2400, 'Huge rims, thin tires. Harsh ride.', { gripMul: 1.01, topMul: 0.97, weightAdd: 5, vis: { rimScale: 1.12 } }, { rep: 16 }),
  ],
  frontBumper: [
    P('fb0', 'Stock Front Bumper', 0, 'Factory cover.', { vis: { frontBumper: 0 } }),
    P('fb1', 'Street Lip Kit', 700, 'Simple chin spoiler.', { vis: { frontBumper: 1 } }),
    P('fb2', 'Widebody Front Clip', 2200, 'Aggressive vents and splitter.', { vis: { frontBumper: 2 }, stats: { dragMul: 0.98 } }, { rep: 8 }),
    P('fb3', 'Race Splitter + Canards', 3600, 'Downforce and attitude.', { vis: { frontBumper: 3 }, stats: { gripMul: 1.02, dragMul: 0.99 } }, { rep: 18 }),
  ],
  rearBumper: [
    P('rb0', 'Stock Rear Bumper', 0, 'Factory cover.', { vis: { rearBumper: 0 } }),
    P('rb1', 'Street Rear Lip', 650, 'Clean diffuser look.', { vis: { rearBumper: 1 } }),
    P('rb2', 'Widebody Rear + Diffuser', 2300, 'Wide arches and a real diffuser.', { vis: { rearBumper: 2 } }, { rep: 8 }),
  ],
  skirts: [
    P('sk0', 'No Skirts', 0, 'Factory sills.', { vis: { skirts: 0 } }),
    P('sk1', 'Street Side Skirts', 520, 'Clean and low.', { vis: { skirts: 1 } }),
    P('sk2', 'Widebody Skirts', 1600, 'Flared and vented.', { vis: { skirts: 2 } }, { rep: 10 }),
  ],
  spoiler: [
    P('sp0', 'No Spoiler', 0, 'Clean decklid.', { vis: { spoiler: 0 } }),
    P('sp1', 'Ducktail', 600, 'Subtle period-correct ducktail.', { vis: { spoiler: 1 }, stats: { gripMul: 1.005 } }),
    P('sp2', 'GT Wing', 1900, 'Tall adjustable GT wing.', { vis: { spoiler: 2 }, stats: { gripMul: 1.02, dragMul: 1.01 } }, { rep: 6 }),
    P('sp3', 'Carbon Swan-Neck Wing', 3400, 'Serious downforce.', { vis: { spoiler: 3 }, stats: { gripMul: 1.035, dragMul: 1.02 } }, { rep: 16 }),
  ],
  hood: [
    P('h0', 'Stock Hood', 0, 'Factory panel.', { vis: { hood: 0 } }),
    P('h1', 'Vented Hood', 700, 'Heat extractor vents.', { vis: { hood: 1 } }),
    P('h2', 'Carbon Hood', 2400, 'Lightweight carbon panel. -8kg.', { vis: { hood: 2 }, stats: { weightAdd: -8 } }, { rep: 10 }),
    P('h3', 'Exposed Cowl + Pins', 3100, 'Raw race look.', { vis: { hood: 3 }, stats: { weightAdd: -6 } }, { rep: 20 }),
  ],
  headlights: [
    P('hl0', 'Stock Housings', 0, 'Halogen and tired.', { vis: { headlights: 0 } }),
    P('hl1', 'Clear Lens Upgrade', 480, 'Modern clear lenses.', { vis: { headlights: 1 } }),
    P('hl2', 'Projector + Angel Eyes', 1200, 'Bright projector retrofit.', { vis: { headlights: 2 } }, { rep: 9 }),
    P('hl3', 'Bi-Xenon Ice Blue', 2000, 'Ice-blue xenon, very 2003.', { vis: { headlights: 3 } }, { rep: 18 }),
  ],
  exhaustTip: [
    P('et0', 'Stock Tip', 0, 'Hidden and rusty.', { vis: { exhaustTip: 0 } }),
    P('et1', 'Single 4" Tip', 380, 'Polished stainless.', { vis: { exhaustTip: 1 } }),
    P('et2', 'Dual Flame Tips', 760, 'Twin tips with a burble.', { vis: { exhaustTip: 2 } }),
    P('et3', 'Quad Titanium Tips', 1400, 'Quad burnt-titanium tips.', { vis: { exhaustTip: 3 }, stats: { weightAdd: -3 } }, { rep: 12 }),
  ],
  tint: [
    P('tn0', 'No Tint', 0, 'Fishbowl.', { vis: { tint: 0 } }),
    P('tn1', 'Light Smoke', 240, 'Subtle tint.', { vis: { tint: 1 } }),
    P('tn2', 'Dark Limo Tint', 450, 'Very dark. Looks expensive.', { vis: { tint: 2 } }),
    P('tn3', 'Mirror Chrome', 900, 'Full mirror film.', { vis: { tint: 3 } }, { rep: 14 }),
  ],
  livery: [
    P('lv0', 'Factory Paint', 0, 'Nothing added.', { vis: { livery: 0 } }),
    P('lv1', 'Twin Racing Stripes', 520, 'Classic twin stripes over the body.', { vis: { livery: 1 } }),
    P('lv2', 'Kanji Side Decals', 700, 'Japanese characters along the flanks.', { vis: { livery: 2 } }),
    P('lv3', 'Tribal Flames', 900, 'Very 2002. Flame graphics on the hood.', { vis: { livery: 3 } }),
    P('lv4', 'Full Sponsor Wrap', 2200, 'Complete race wrap with numbers.', { vis: { livery: 4 } }, { rep: 10 }),
    P('lv5', 'Chrome Camo', 3000, 'Digital camo over chrome.', { vis: { livery: 5 } }, { rep: 20 }),
  ],
  paintColor: [
    P('pc0', 'Custom Paint', 0, 'Full RGB colour selection.', { vis: { color: null } }),
  ],
  finish: [
    P('fi0', 'Gloss', 0, 'Standard clearcoat.', { vis: { finish: 'gloss' } }),
    P('fi1', 'Metallic', 900, 'Metal flake in the clear.', { vis: { finish: 'metallic' } }),
    P('fi2', 'Matte', 1200, 'Flat satin finish.', { vis: { finish: 'matte' } }, { rep: 6 }),
    P('fi3', 'Pearlescent', 2600, 'Colour-shift pearl. Very expensive looking.', { vis: { finish: 'pearl' } }, { rep: 16 }),
  ],
  underglow: [
    P('ug0', 'No Underglow', 0, 'Invisible at night.', { vis: { underglow: null } }),
    P('ug1', 'Teal Neon Kit', 900, '#25e0d0 neon underbody kit.', { vis: { underglow: '#25e0d0' } }),
    P('ug2', 'Hot Pink Neon Kit', 900, '#ff2f92 underbody kit.', { vis: { underglow: '#ff2f92' } }),
    P('ug3', 'UV Purple Neon Kit', 900, '#a56bff underbody kit.', { vis: { underglow: '#a56bff' } }),
    P('ug4', 'Custom Colour Underglow', 1600, 'Pick any colour for the kit.', { vis: { underglow: '#ffffff' } }, { rep: 10 }),
  ],
  wheel: [
    P('wh0', 'Stock Wheel', 0, 'Three-spoke factory wheel.', { vis: { wheel: 0 } }),
    P('wh1', 'Momo-Style Deep Wheel', 340, 'Deep-dish racing wheel.', { vis: { wheel: 1 } }),
    P('wh2', 'Sport Bucket Wheel', 620, 'Small diameter, fat grip.', { vis: { wheel: 2 } }, { rep: 5 }),
  ],
  seats: [
    P('st0', 'Stock Seats', 0, 'Grey cloth buckets.', { vis: { seats: 0 } }),
    P('st1', 'Sport Recliners', 800, 'Two-tone sport seats.', { vis: { seats: 1 } }),
    P('st2', 'Carbon Racing Buckets', 2200, 'Fixed-back carbon shells. -10kg.', { vis: { seats: 2 }, stats: { weightAdd: -10 } }, { rep: 14 }),
  ],
  dash: [
    P('dh0', 'Stock Dash', 0, 'Plastic and proud.', { vis: { dash: 0 } }),
    P('dh1', 'Gauge Cluster Add-On', 450, 'Extra gauges on the dash.', { vis: { dash: 1 } }),
    P('dh2', 'Full Race Dash', 1400, 'Digital race display.', { vis: { dash: 2 } }, { rep: 12 }),
  ],
  interiorColor: [
    P('ic0', 'Black Leather', 0, 'Standard black.', { vis: { interior: '#1b1d20' } }),
    P('ic1', 'Tan Leather', 340, 'Classic tan.', { vis: { interior: '#8a6a45' } }),
    P('ic2', 'Red Alcantara', 620, 'Bold red interior.', { vis: { interior: '#8c1f24' } }),
    P('ic3', 'Blue Alcantara', 620, 'Cool blue interior.', { vis: { interior: '#22406e' } }),
  ],
};

export const PAINT_PRESETS = [
  '#f2f4f6', '#0f1113', '#8b0f18', '#c8202c', '#e8a91c', '#e0c72a',
  '#1c3f8f', '#2f7fd0', '#28b7a8', '#1f6b46', '#5c2d7a', '#d04a86',
  '#5d6a72', '#b9c4cd', '#6b4a2a', '#cfcfcf',
];

// --- default modification state --------------------------------------------
export function defaultMods(def) {
  return {
    engine: 0, turbo: 0, ecu: 0, intake: 0, exhaust: 0, cooling: 0,
    gearbox: 0, clutch: 0, diff: 0, final: 0,
    suspension: 0, ride: 0, camber: 0, tires: 1,
    rims: 1, rimSize: 1,
    frontBumper: 0, rearBumper: 0, skirts: 0, spoiler: def?.body?.spoiler ? 2 : 0,
    hood: 0, headlights: 0, exhaustTip: 1, tint: 0, livery: 0,
    paintColor: def?.defaultColor || '#b9c4cd', finish: 0, underglow: 0,
    wheel: 0, seats: 0, dash: 0, interiorColor: 0,
  };
}

export function cloneMods(mods) { return JSON.parse(JSON.stringify(mods)); }

// which part indexes are "owned" by default
export function defaultOwned() {
  const owned = {};
  for (const cat of Object.keys(PARTS)) owned[cat] = [0];
  owned.tires = [0, 1];
  owned.rims = [1];
  return owned;
}

export function getPart(cat, idx) {
  const list = PARTS[cat];
  if (!list) return null;
  return list[Math.min(Math.max(0, idx | 0), list.length - 1)];
}

// --- derived statistics -----------------------------------------------------
export function computeStats(def, mods) {
  let powerMul = 1, gripMul = 1, brakeMul = 1, weightAdd = 0, gearAdd = 0;
  let topMul = 1, dragMul = 1, shiftMul = 1, driftMul = 1, camber = 0, rideDelta = 0;
  const ignore = new Set(['paintColor', 'rims', 'rimSize', 'frontBumper', 'rearBumper', 'skirts', 'spoiler',
    'hood', 'headlights', 'exhaustTip', 'tint', 'livery', 'finish', 'underglow', 'wheel', 'seats', 'dash', 'interiorColor']);
  for (const cat of Object.keys(PARTS)) {
    const part = PARTS[cat][mods?.[cat] ?? 0];
    if (!part) continue;
    const s = part.stats || {};
    // rim/tire/cosmetic wear also affect weight in a few cases, so always read weightAdd
    powerMul *= s.powerMul ?? 1;
    gripMul *= s.gripMul ?? 1;
    brakeMul *= s.brakeMul ?? 1;
    weightAdd += s.weightAdd ?? 0;
    gearAdd += s.gearAdd ?? 0;
    topMul *= s.topMul ?? 1;
    dragMul *= s.dragMul ?? 1;
    shiftMul *= s.shiftMul ?? 1;
    driftMul *= s.driftMul ?? 1;
    if (s.camber != null) camber = s.camber;
    if (s.rideHeight != null) rideDelta = s.rideHeight;
  }
  const hp = Math.round(def.hp * powerMul);
  const weight = Math.max(650, def.weight + weightAdd);
  const powerToWeight = hp / weight;
  const basePTW = def.hp / def.weight;

  // top speed scales with cube root of power and inversely with drag
  const topSpeed = Math.round(def.topSpeed * Math.cbrt(powerMul) * topMul / Math.sqrt(dragMul));
  // 0-100 roughly inversely proportional to power-to-weight
  const accel = Math.max(2.2, def.accel * Math.pow(basePTW / powerToWeight, 0.82) * (dragMul > 1 ? 1.01 : 1));
  const grip = def.handling * gripMul * (1 + camber * -1.1);
  const handling = Math.max(10, Math.min(99, grip));
  const brake = Math.max(10, Math.min(99, def.brake * brakeMul));
  const gears = Math.min(7, def.gears + gearAdd);
  const modCount = Object.keys(PARTS).reduce((n, cat) => n + ((mods?.[cat] ?? 0) > 0 ? 1 : 0), 0);

  return {
    id: def.id, name: def.name, class: def.class, drivetrain: def.drivetrain, year: def.year,
    hp, weight, topSpeed, accel, handling, brake, grip, gears, camber, rideDelta,
    powerMul, gripMul, brakeMul, topMul, dragMul, shiftMul, driftMul, gearAdd,
    modCount, engine: def.engine, sound: def.sound,
    // normalised UI ratings 0..100
    ratings: {
      POWER: Math.min(100, Math.round((hp / 620) * 100)),
      SPEED: Math.min(100, Math.round((topSpeed / 340) * 100)),
      ACCEL: Math.min(100, Math.round(((11 - accel) / 8) * 100)),
      HANDLING: Math.round(handling),
      BRAKE: Math.round(brake),
      WEIGHT: Math.min(100, Math.round(((2100 - weight) / 1300) * 100)),
    },
    value: carValue(def, mods),
  };
}

export function carValue(def, mods) {
  if (!def) return 0;
  let v = def.price * 0.86;
  for (const cat of Object.keys(PARTS)) {
    const idx = mods?.[cat] ?? 0;
    if (idx > 0 && !['paintColor', 'rims', 'rimSize', 'finish', 'underglow', 'wheel', 'seats', 'dash', 'interiorColor'].includes(cat)) {
      for (let i = 1; i <= idx; i++) v += (PARTS[cat][i]?.price || 0) * 0.55;
    }
  }
  return Math.round(v);
}

export function modsSummary(def, mods) {
  const out = [];
  for (const cat of Object.keys(PARTS)) {
    const idx = mods?.[cat] ?? 0;
    if (!idx) continue;
    const p = PARTS[cat][idx];
    if (p && p.price > 0) out.push(p.name);
  }
  return out;
}

export const FACTIONS = [
  { id: 'rookie', name: 'ROOKIE', rep: 0 },
  { id: 'cruiser', name: 'STREET CRUISER', rep: 5 },
  { id: 'racer', name: 'RACER', rep: 15 },
  { id: 'driftking', name: 'DRIFT KING', rep: 30 },
  { id: 'notorious', name: 'NOTORIOUS', rep: 50 },
  { id: 'legend', name: 'SAN VELOR LEGEND', rep: 80 },
];
export function rankFor(rep) {
  let r = FACTIONS[0];
  for (const f of FACTIONS) if (rep >= f.rep) r = f;
  return r;
}
