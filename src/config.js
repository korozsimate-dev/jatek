// ============================================================
// STREET EMPIRE — global configuration
// ============================================================

export const CONFIG = {
  version: '1.0.0',
  saveKey: 'street_empire_save_v1',

  world: {
    size: 1040,            // full extent (x/z from -520..520)
    bound: 500,            // hard play boundary
    block: 120,            // city grid spacing
    roadWidth: 16,         // two-way road
    ringWidth: 26,         // ring highway
    sidewalk: 3.2,
    waterLevel: 0.6,
    waterZ: 452,           // ocean starts around here
    coastZ: 430,
  },

  // road centre lines for the city grid
  grid: [-420, -300, -180, -60, 60, 180, 300, 420],

  player: {
    walkSpeed: 2.4,
    runSpeed: 6.6,
    radius: 0.42,
    height: 1.78,
    eyeHeight: 1.62,
    enterRange: 4.2,
  },

  physics: {
    gravity: 9.81,
    airDrag: 0.42,
    rollingResistance: 0.022,
    brakeForce: 13500,
    handbrakeGrip: 0.32,
    maxSteer: 0.62,        // radians at low speed
    steerSpeedFalloff: 0.0022,
    rearGripBase: 1.0,
    wheelRadius: 0.34,
    // arcade helpers
    driftYawBoost: 1.5,
    gripRecovery: 9.0,
    subSteps: 4,
    maxDelta: 1 / 20,
  },

  camera: {
    fov: 70,
    near: 0.25,
    far: 1400,
    followDistance: 6.6,
    followHeight: 2.5,
    lookAhead: 5.5,
    stiffness: 7.5,
    walkDistance: 4.4,
    walkHeight: 1.9,
    sensitivity: 1.0,
  },

  economy: {
    startMoney: 2500,
    startRep: 0,
    raceRepeatCooldown: 45, // seconds in-game before a repeat payout decays
  },

  time: {
    dayLengthSec: 480,     // full 24h cycle in 8 real minutes
    startHour: 21.5,
  },
};

export const QUALITY = {
  low:    { traffic: 10, peds: 18,  shadows: false, pixelRatio: 1.0,  pixels: 1.1e6, bloom: false, lampLights: 4,  fogNear: 260, fogFar: 620,  particles: 0.4 },
  medium: { traffic: 16, peds: 34,  shadows: true,  pixelRatio: 1.35, pixels: 1.7e6, bloom: true,  lampLights: 8,  fogNear: 340, fogFar: 820,  particles: 0.8 },
  high:   { traffic: 22, peds: 52,  shadows: true,  pixelRatio: 1.75, pixels: 2.4e6, bloom: true,  lampLights: 10, fogNear: 420, fogFar: 1050, particles: 1.0 },
};

export const DISTRICTS = [
  { id: 'downtown', name: 'DOWNTOWN',     x0: 60,   z0: -300, x1: 300,  z1: 60,   color: '#2a3340' },
  { id: 'nightlife',name: 'NIGHTLIFE',    x0: -180, z0: -300, x1: 60,   z1: -60,  color: '#3b2240' },
  { id: 'hills',    name: 'CANYON HILLS', x0: -420, z0: -420, x1: -180, z1: -60,  color: '#33301f' },
  { id: 'res',      name: 'PALM HEIGHTS', x0: -420, z0: 60,   x1: -60,  z1: 420,  color: '#22322a' },
  { id: 'industrial', name: 'IRON YARDS', x0: 180,  z0: 180,  x1: 420,  z1: 420,  color: '#312a25' },
  { id: 'harbor',   name: 'VELOR HARBOR', x0: 60,   z0: 300,  x1: 420,  z1: 440,  color: '#1e2f3c' },
  { id: 'autos',    name: 'AUTO ROW',     x0: -60,  z0: 60,   x1: 180,  z1: 300,  color: '#2c2c35' },
  { id: 'strip',    name: 'THE STRIP',    x0: -180, z0: -60,  x1: 60,   z1: 60,   color: '#3a2f22' },
  { id: 'midtown',  name: 'MIDTOWN',      x0: 300,  z0: -420, x1: 420,  z1: 180,  color: '#26303a' },
];

export const SAVE_VERSION = 3;
