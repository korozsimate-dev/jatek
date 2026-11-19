// ============================================================
// Save data + progression (money, rep, cars, modifications, records)
// ============================================================
import { CONFIG } from '../config.js';
import { CAR_DEFS, CAR_BY_ID, PARTS, defaultMods, cloneMods, computeStats, carValue, rankFor } from '../data/cars.js';
import { formatMoney } from '../core/util.js';
import { defaultLook, normalizeLook } from '../data/look.js';

// The car you start the game in — a rear-drive straight-six coupé in Estoril blue.
export const STARTER_CAR_ID = 'coupe_bavar';
export const STARTER_COLOR_NAME = 'Estoril Blue';

export class Progression {
  constructor() {
    this.data = null;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  emit(type, payload) { for (const l of this.listeners) l(type, payload); }

  newGame(name = 'DRIVER') {
    const startDef = CAR_BY_ID[STARTER_CAR_ID] || CAR_DEFS[0];
    const car = {
      uid: 'car_' + Date.now() + '_0',
      defId: startDef.id,
      mods: defaultMods(startDef),
      owned: { ...defaultOwnedFor(startDef) },
      plate: makePlate(),
      colorName: STARTER_COLOR_NAME,
    };
    this.data = {
      version: CONFIG.version,
      name,
      created: Date.now(),
      played: 0,
      money: CONFIG.economy.startMoney,
      rep: 0,
      cars: [car],
      activeCar: car.uid,
      garageSlots: 4,
      ownedEventParts: {},
      records: {},              // eventId -> {bestTime, bestScore, wins, plays, lastPayout}
      wins: 0,
      races: 0,
      drifts: 0,
      distance: 0,
      busts: 0,
      escapes: 0,
      unlockedEvents: ['sprint_neon', 'circuit_downtown', 'drift_yard', 'delivery_1', 'meet_show',
        'circuit_autos', 'sprint_stunt', 'delivery_2'],
      look: defaultLook(),
      seenIntro: false,
      position: null,
      settingsMigrated: true,
    };
    this.emit('new');
    return this.data;
  }

  // ---------------- persistence ----------------
  save() {
    if (!this.data) return false;
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(this.data)); return true; } catch (e) { return false; }
  }
  load() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.cars || !d.cars.length) return null;
      // migrate: any car missing mods gets defaults
      for (const c of d.cars) {
        if (!c.mods) c.mods = defaultMods(CAR_BY_ID[c.defId]);
        if (!c.owned) c.owned = defaultOwnedFor(CAR_BY_ID[c.defId]);
        if (!CAR_BY_ID[c.defId]) c.defId = STARTER_CAR_ID;
      }
      if (!d.look) d.look = defaultLook();
      d.look = normalizeLook(d.look);
      if (!Array.isArray(d.unlockedEvents)) d.unlockedEvents = [];
      this.data = d;
      return d;
    } catch (e) { return null; }
  }
  exists() {
    try { return !!localStorage.getItem(CONFIG.saveKey); } catch (e) { return false; }
  }
  wipe() {
    try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
    this.data = null;
  }

  // ---------------- getters ----------------
  get money() { return this.data?.money ?? 0; }
  get rep() { return this.data?.rep ?? 0; }
  get rank() { return rankFor(this.rep); }
  get cars() { return this.data?.cars || []; }
  activeCar() {
    if (!this.data) return null;
    return this.cars.find((c) => c.uid === this.data.activeCar) || this.cars[0] || null;
  }
  activeStats() {
    const c = this.activeCar();
    if (!c) return null;
    return computeStats(CAR_BY_ID[c.defId], c.mods);
  }
  collectionValue() {
    return this.cars.reduce((sum, c) => sum + carValue(CAR_BY_ID[c.defId], c.mods), 0);
  }

  // ---------------- driver appearance ----------------
  get look() { return normalizeLook(this.data?.look); }
  setLook(patch) {
    if (!this.data) return this.look;
    this.data.look = normalizeLook({ ...this.look, ...(patch || {}) });
    this.emit('look', this.data.look);
    return this.data.look;
  }
  resetLook() { return this.setLook(defaultLook()); }

  // ---------------- money ----------------
  addMoney(n, silent = false) {
    this.data.money = Math.max(0, this.data.money + n);
    if (!silent) this.emit('money', n);
    return this.data.money;
  }
  spend(n) {
    if (this.data.money < n) return false;
    this.data.money -= n;
    this.emit('money', -n);
    return true;
  }
  addRep(n) {
    this.data.rep = Math.max(0, this.data.rep + n);
    this.emit('rep', n);
    return this.data.rep;
  }

  // ---------------- cars ----------------
  buyCar(defId) {
    const def = CAR_BY_ID[defId];
    if (!def) return { ok: false, reason: 'Unknown vehicle' };
    if (this.rep < def.repReq) return { ok: false, reason: `Requires ${def.repReq} reputation` };
    if (this.money < def.price) return { ok: false, reason: 'Not enough cash' };
    if (this.cars.length >= this.data.garageSlots) return { ok: false, reason: 'Garage is full — expand or sell a car' };
    this.spend(def.price);
    const car = {
      uid: 'car_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      defId, mods: defaultMods(def), owned: defaultOwnedFor(def),
      plate: makePlate(), colorName: 'Factory',
    };
    this.cars.push(car);
    this.emit('cars', { type: 'buy', car });
    return { ok: true, car };
  }
  sellCar(uid) {
    if (this.cars.length <= 1) return { ok: false, reason: 'You need at least one car' };
    const i = this.cars.findIndex((c) => c.uid === uid);
    if (i < 0) return { ok: false, reason: 'Car not found' };
    const car = this.cars[i];
    const value = Math.round(carValue(CAR_BY_ID[car.defId], car.mods) * 0.82);
    this.cars.splice(i, 1);
    this.addMoney(value, true);
    if (this.data.activeCar === uid) this.data.activeCar = this.cars[0].uid;
    this.emit('cars', { type: 'sell', value });
    return { ok: true, value };
  }
  setActive(uid) {
    if (this.cars.some((c) => c.uid === uid)) {
      this.data.activeCar = uid;
      this.emit('active', uid);
      return true;
    }
    return false;
  }
  expandGarage() {
    const cost = 4000 * this.data.garageSlots;
    if (this.money < cost) return { ok: false, reason: `Need ${formatMoney(cost)}` };
    this.spend(cost);
    this.data.garageSlots += 2;
    this.emit('garage', this.data.garageSlots);
    return { ok: true, slots: this.data.garageSlots };
  }

  // ---------------- modifiers ----------------
  ownsPart(uid, cat, idx) {
    const car = this.cars.find((c) => c.uid === uid);
    if (!car) return false;
    return (car.owned?.[cat] || []).includes(idx);
  }
  installPart(uid, cat, idx, price) {
    const car = this.cars.find((c) => c.uid === uid);
    if (!car) return { ok: false, reason: 'Car not found' };
    const part = (PARTS[cat] || [])[idx];
    if (!part) return { ok: false, reason: 'Unknown part' };
    if ((part.rep || 0) > this.rep) return { ok: false, reason: `Requires ${part.rep} reputation` };
    const owned = car.owned[cat] || (car.owned[cat] = []);
    const already = owned.includes(idx);
    if (!already) {
      if (price > 0) {
        if (this.money < price) return { ok: false, reason: 'Not enough cash' };
        this.spend(price);
      }
      owned.push(idx);
    }
    car.mods[cat] = idx;
    this.emit('mod', { uid, cat, idx });
    return { ok: true, installed: true };
  }
  // free visual change (colour picker)
  setMod(uid, cat, value) {
    const car = this.cars.find((c) => c.uid === uid);
    if (!car) return false;
    car.mods[cat] = value;
    this.emit('mod', { uid, cat, value });
    return true;
  }

  // ---------------- records ----------------
  recordRace(ev, result) {
    const rec = this.data.records[ev.id] || { plays: 0, wins: 0, bestTime: null, bestScore: null, lastPayout: -1e9 };
    rec.plays++;
    if (result.position === 1) rec.wins++;
    if (result.time != null && (rec.bestTime == null || result.time < rec.bestTime)) rec.bestTime = result.time;
    if (result.score != null && (rec.bestScore == null || result.score > rec.bestScore)) rec.bestScore = result.score;
    this.data.records[ev.id] = rec;
    if (ev.id.startsWith('underground') && !this.data.unlockedEvents.includes('underground_night')) {
      this.data.unlockedEvents.push('underground_night');
    }
    this.emit('record', rec);
    return rec;
  }

  isUnlocked(ev) {
    if (this.rep < (ev.repReq || 0)) return false;
    if (this.data.unlockedEvents.includes(ev.id)) return true;
    // events unlock automatically once rep is high enough
    return this.rep >= (ev.repReq || 0);
  }

  unlockEvent(id) {
    if (!this.data.unlockedEvents.includes(id)) {
      this.data.unlockedEvents.push(id);
      this.emit('unlock', id);
      return true;
    }
    return false;
  }

  bestFor(evId) { return this.data.records[evId] || null; }
}

function defaultOwnedFor(def) {
  return {
    engine: [0], turbo: [0], ecu: [0], intake: [0], exhaust: [0], cooling: [0],
    gearbox: [0], clutch: [0], diff: [0], final: [0],
    suspension: [0], ride: [0], camber: [0], tires: [0, 1],
    rims: [1], rimSize: [1],
    frontBumper: [0], rearBumper: [0], skirts: [0], spoiler: [0],
    hood: [0], headlights: [0], exhaustTip: [0], tint: [0], livery: [0],
    paintColor: [0], finish: [0], underglow: [0],
    wheel: [0], seats: [0], dash: [0], interiorColor: [0],
  };
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
function makePlate() {
  let s = '';
  for (let i = 0; i < 3; i++) s += PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)];
  s += '-' + (100 + Math.floor(Math.random() * 899));
  return s;
}
