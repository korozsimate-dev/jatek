// ============================================================
// Driver appearance data — what the character customiser edits and
// what the walking rig in game/player.js is built from.
// Pure data so it can be unit-tested headless.
// ============================================================

// presets are shown as swatches in the UI; the picker also takes any hex
export const LOOK_OPTIONS = {
  skin: ['#f0cba6', '#d9a97e', '#c99b74', '#a9744a', '#7d4f2e', '#54351f'],
  hair: ['#12100e', '#2b1c12', '#5a3a1c', '#a8762e', '#c9a227', '#6d6f74', '#c8ced6', '#7a2f6b'],
  jacket: ['#1d2833', '#101216', '#2f5b6e', '#8c1f24', '#1f6b46', '#d9dde1', '#e8a91c', '#5c2d7a'],
  accent: ['#25e0d0', '#ff2f92', '#ffb020', '#3b7bff', '#9dff38', '#ffffff'],
  pants: ['#262b32', '#15181c', '#3a4350', '#4b4030', '#6b6f75', '#2b3a2a'],
  shoe: ['#121417', '#e8eef2', '#8b0f18', '#d0d4d8', '#3a2e24'],
  hairStyle: ['FADE', 'BUZZ', 'TOP KNOT', 'MOHAWK', 'LONG', 'BALD'],
  build: ['SLIM', 'ATHLETIC', 'STOCKY', 'HEAVY'],
  outfit: ['DRIVER JACKET', 'TRACK SUIT', 'HOODIE', 'MECHANIC', 'SUIT'],
};

export const DEFAULT_LOOK = {
  skin: '#c99b74',
  hair: '#12100e',
  jacket: '#1d2833',
  accent: '#25e0d0',
  pants: '#262b32',
  shoe: '#121417',
  hairStyle: 0,
  build: 1,
  outfit: 0,
};

// Build scale: wider chest and shoulders, thicker limbs.
export const BUILD_SCALE = [
  { id: 'slim', name: 'SLIM', shoulder: 0.92, chest: 0.88, limb: 0.88, hip: 0.94 },
  { id: 'athletic', name: 'ATHLETIC', shoulder: 1.0, chest: 1.0, limb: 1.0, hip: 1.0 },
  { id: 'stocky', name: 'STOCKY', shoulder: 1.12, chest: 1.12, limb: 1.10, hip: 1.08 },
  { id: 'heavy', name: 'HEAVY', shoulder: 1.24, chest: 1.28, limb: 1.22, hip: 1.18 },
];

// outfit presets override the jacket / pants / accent colours
export const OUTFITS = [
  { id: 'jacket', name: 'DRIVER JACKET', jacket: null, pants: null, accent: null, collar: true },
  { id: 'tracksuit', name: 'TRACK SUIT', jacket: '#1b2a5e', pants: '#1b2a5e', accent: '#ffffff', collar: false },
  { id: 'hoodie', name: 'HOODIE', jacket: '#3a3a3f', pants: '#22252a', accent: '#8a8f96', collar: false, hood: true },
  { id: 'mechanic', name: 'MECHANIC', jacket: '#2c3f57', pants: '#3c4046', accent: '#e8a91c', collar: false },
  { id: 'suit', name: 'PERSONAL SUIT', jacket: '#14171c', pants: '#14171c', accent: '#cfd6dc', collar: true, shirt: '#f2f4f6' },
];

export const LOOK_LABELS = {
  skin: 'SKIN TONE', hair: 'HAIR COLOUR', jacket: 'JACKET', accent: 'ACCENT TRIM',
  pants: 'TROUSERS', shoe: 'SHOES', hairStyle: 'HAIR STYLE', build: 'BUILD', outfit: 'OUTFIT',
};

export function defaultLook() { return { ...DEFAULT_LOOK }; }

// merge a saved / partial look with the defaults, rejecting junk
export function normalizeLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  const isCol = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
  for (const k of ['skin', 'hair', 'jacket', 'accent', 'pants', 'shoe']) {
    if (isCol(look[k])) out[k] = look[k];
  }
  if (Number.isFinite(look.hairStyle)) out.hairStyle = Math.max(0, Math.min(LOOK_OPTIONS.hairStyle.length - 1, look.hairStyle | 0));
  if (Number.isFinite(look.build)) out.build = Math.max(0, Math.min(BUILD_SCALE.length - 1, look.build | 0));
  if (Number.isFinite(look.outfit)) out.outfit = Math.max(0, Math.min(OUTFITS.length - 1, look.outfit | 0));
  return out;
}

// The colours actually worn: an outfit may override the jacket / trousers.
export function resolvedLook(look) {
  const l = normalizeLook(look);
  const outfit = OUTFITS[l.outfit] || OUTFITS[0];
  return {
    ...l,
    jacket: outfit.jacket || l.jacket,
    pants: outfit.pants || l.pants,
    accent: outfit.accent || l.accent,
    outfitDef: outfit,
    build: BUILD_SCALE[l.build] || BUILD_SCALE[1],
  };
}
