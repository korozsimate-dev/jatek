// ============================================================
// Screen controller: menus, garage, tuning, dealership, settings, map
// ============================================================
import { PARTS, TUNE_CATEGORIES, SUB_NAMES, CAR_DEFS, CAR_BY_ID, computeStats, defaultMods,
  PAINT_PRESETS, carValue, rankFor, FACTIONS } from '../data/cars.js';
import { formatMoney, formatTime, clamp, ordinal, hexToRgb, rgbToHex } from '../core/util.js';
import { EVENTS } from '../world/layout.js';
import { LOOK_OPTIONS, LOOK_LABELS, OUTFITS, BUILD_SCALE, defaultLook } from '../data/look.js';

const $ = (id) => document.getElementById(id);

export class Screens {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.current = null;
    this.settingsScreenTarget = null;
    this.garageSelection = null;
    this.dealerSelection = null;
    this.tuningCat = 'engine';
    this.tuningSel = 0;
    this.previewMode = null;   // 'garage' | 'tune' | 'dealer'
    this.bind();
  }

  // ---------------- screen stack ----------------
  open(name, opts = {}) {
    if (this.current === name) return;
    if (this.current) this.hide(this.current);
    this.current = name;
    const el = $(name);
    if (el) el.classList.remove('hidden');
    switch (name) {
      case 'menu': this.refreshMenu(); break;
      case 'garage': this.openGarage(); break;
      case 'tuning': this.openTuning(opts.car); break;
      case 'character': this.openCharacter(opts); break;
      case 'dealership': this.openDealer(); break;
      case 'settings': this.syncSettings(); break;
      case 'pause': break;
      case 'map-screen': this.game.hud.openBigMap(this.game.getFocusPos()); break;
      case 'races': this.openRaces(); break;
      case 'results': if (opts.result) this.showResult(opts.result); break;
      case 'brief': if (opts.ev) this.showBrief(opts.ev); break;
      case 'credits': break;
    }
  }

  hide(name) {
    const el = $(name);
    if (el) el.classList.add('hidden');
  }
  close(name) {
    this.hide(name);
    if (this.current === name) this.current = null;
  }

  // hide every overlay screen (the pause menu is a separate layer)
  showOnly(name) {
    for (const id of ['menu', 'pause', 'settings', 'credits', 'garage', 'tuning', 'dealership', 'character', 'map-screen', 'results', 'brief', 'races']) {
      this.hide(id);
    }
    this.current = null;
    if (name) this.open(name);
  }

  // close a gameplay-adjacent screen and return to the world
  closeToWorld() {
    this.showOnly(null);
    this.current = null;
    this.game.returnToWorld();
  }

  // ---------------- main menu ----------------
  refreshMenu() {
    const p = this.game.progression;
    const has = p.data != null;
    $('btn-continue').disabled = !p.exists() || !has;
    const d = p.data;
    if (d) {
      $('mp-money').textContent = formatMoney(d.money);
      $('mp-rep').textContent = d.rep;
      $('mp-cars').textContent = d.cars.length;
      $('mp-wins').textContent = d.wins;
      $('mp-rank').textContent = p.rank.name;
    } else {
      $('mp-money').textContent = '—';
      $('mp-rep').textContent = '—';
      $('mp-cars').textContent = '—';
      $('mp-wins').textContent = '—';
      $('mp-rank').textContent = 'NO DATA';
    }
    $('btn-garage-menu').disabled = !d;
    $('btn-dealer-menu').disabled = !d;
    const dm = $('btn-driver-menu');
    if (dm) dm.disabled = !d;
  }

  // ---------------- garage ----------------
  openGarage() {
    this.previewMode = 'garage';
    const p = this.game.progression;
    const cars = p.cars;
    if (!this.garageSelection || !cars.find((c) => c.uid === this.garageSelection)) {
      this.garageSelection = p.data.activeCar || cars[0]?.uid;
    }
    $('garage-money').textContent = formatMoney(p.money);
    $('garage-value').textContent = formatMoney(p.collectionValue());
    $('garage-count').textContent = `${cars.length}/${p.data.garageSlots}`;
    this.renderGarageList();
    this.renderGarageDetail();
    this.game.enterPreview(this.getGarageCarDef(), this.getGarageCar().mods, 'garage');
  }

  getGarageCar() { return this.game.progression.cars.find((c) => c.uid === this.garageSelection) || this.game.progression.cars[0]; }
  getGarageCarDef() { const c = this.getGarageCar(); return c ? CAR_BY_ID[c.defId] : null; }

  renderGarageList() {
    const p = this.game.progression;
    const list = $('garage-list');
    list.innerHTML = '';
    for (const c of p.cars) {
      const def = CAR_BY_ID[c.defId];
      const stats = computeStats(def, c.mods);
      const d = document.createElement('div');
      d.className = 'car-item' + (c.uid === this.garageSelection ? ' sel' : '');
      d.innerHTML = `
        <div class="ci-top"><span class="ci-name">${def.name}</span><span class="ci-value">${formatMoney(carValue(def, c.mods))}</span></div>
        <div class="ci-sub"><span>${def.class}</span><span>${stats.hp}HP</span>
          ${c.uid === p.data.activeCar ? '<span class="ci-badge">ACTIVE</span>' : ''}
          ${stats.modCount > 0 ? `<span class="ci-badge owned">${stats.modCount} MODS</span>` : ''}
        </div>`;
      d.addEventListener('click', () => {
        this.garageSelection = c.uid;
        this.game.audio.ui('click');
        this.renderGarageList();
        this.renderGarageDetail();
        this.game.enterPreview(def, c.mods, 'garage');
      });
      d.addEventListener('dblclick', () => this.driveOut(c.uid));
      list.appendChild(d);
    }
    // empty slots hint
    const empty = p.data.garageSlots - p.cars.length;
    if (empty > 0) {
      const d = document.createElement('div');
      d.className = 'car-item';
      d.style.opacity = '0.4';
      d.innerHTML = `<div class="ci-top"><span class="ci-name">EMPTY SLOT ×${empty}</span></div>
        <div class="ci-sub"><span>Visit the dealership on Auto Row</span></div>`;
      list.appendChild(d);
    }
  }

  renderGarageDetail() {
    const car = this.getGarageCar();
    if (!car) return;
    const def = CAR_BY_ID[car.defId];
    const stats = computeStats(def, car.mods);
    const baseStats = computeStats(def, defaultMods(def));
    $('garage-car-name').textContent = def.name;
    $('garage-car-class').textContent = `${def.class} · ${def.year} · ${def.drivetrain}`;
    $('garage-stats').innerHTML = statBars(stats, baseStats);
    $('garage-specs').innerHTML = `
      <div class="spec"><span>POWER</span><b>${stats.hp} HP</b></div>
      <div class="spec"><span>TORQUE EST.</span><b>${Math.round(stats.hp * 0.86)} Nm</b></div>
      <div class="spec"><span>TOP SPEED</span><b>${stats.topSpeed} KM/H</b></div>
      <div class="spec"><span>0-100</span><b>${stats.accel.toFixed(1)} s</b></div>
      <div class="spec"><span>WEIGHT</span><b>${stats.weight} KG</b></div>
      <div class="spec"><span>DRIVETRAIN</span><b>${def.drivetrain}</b></div>
      <div class="spec"><span>GEARS</span><b>${stats.gears}</b></div>
      <div class="spec"><span>PLATE</span><b>${car.plate || '—'}</b></div>
      <div class="spec"><span>BEST RACE</span><b>${this.game.progression.data.wins} WINS</b></div>
      <div class="spec"><span>VALUE</span><b>${formatMoney(carValue(def, car.mods))}</b></div>`;
    const mods = [];
    for (const cat of Object.keys(PARTS)) {
      const idx = car.mods[cat] ?? 0;
      if (idx > 0 && PARTS[cat][idx] && PARTS[cat][idx].price > 0) mods.push(PARTS[cat][idx].name);
    }
    $('garage-mods').innerHTML = mods.length
      ? `<b>${mods.length} INSTALLED:</b> ${mods.slice(0, 7).join(' · ')}${mods.length > 7 ? ' …' : ''}`
      : 'Factory standard — visit Torque Lab to build it up.';
    $('btn-garage-drive').querySelector('.mb-label').textContent =
      this.game.progression.data.activeCar === car.uid ? 'GET IN' : 'SET ACTIVE';
  }

  driveOut(uid) {
    const p = this.game.progression;
    p.setActive(uid);
    p.save();
    this.game.audio.ui('confirm');
    this.game.exitPreviewToWorld();
  }

  // ---------------- driver customisation ----------------
  openCharacter(opts = {}) {
    this.charFrom = opts.from || (this.game.worldActive ? 'world' : 'garage');
    this.charPreview = this.game.enterLookPreview();
    this.charTab = 'body';
    $('char-money').textContent = formatMoney(this.game.progression.money);
    this.renderCharTabs();
    this.selectCharTab(this.charTab);
  }

  renderCharTabs() {
    const wrap = $('char-tabs');
    if (!wrap) return;
    wrap.innerHTML = '';
    const tabs = [
      { id: 'body', name: 'BODY' }, { id: 'hair', name: 'HAIR' },
      { id: 'outfit', name: 'OUTFIT' }, { id: 'build', name: 'BUILD' },
    ];
    for (const t of tabs) {
      const d = document.createElement('div');
      d.className = 'tuning-tab' + (t.id === this.charTab ? ' active' : '');
      d.innerHTML = `<span class="tt-dot"></span><span>${t.name}</span>`;
      d.addEventListener('click', () => { this.game.audio.ui('click'); this.selectCharTab(t.id); });
      wrap.appendChild(d);
    }
  }

  selectCharTab(id) {
    this.charTab = id;
    const wrap = $('char-options');
    if (!wrap) return;
    wrap.innerHTML = '';
    const look = this.game.progression.look;
    const title = $('char-cat-title');
    const sub = $('char-cat-sub');
    const rows = [];
    if (id === 'body') {
      title.textContent = 'BODY';
      sub.textContent = 'SKIN, TRIM AND SHOES';
      rows.push({ key: 'skin', kind: 'color', list: LOOK_OPTIONS.skin });
      rows.push({ key: 'accent', kind: 'color', list: LOOK_OPTIONS.accent });
      rows.push({ key: 'shoe', kind: 'color', list: LOOK_OPTIONS.shoe });
    } else if (id === 'hair') {
      title.textContent = 'HAIR';
      sub.textContent = 'CUT AND COLOUR';
      rows.push({ key: 'hairStyle', kind: 'style', list: LOOK_OPTIONS.hairStyle });
      rows.push({ key: 'hair', kind: 'color', list: LOOK_OPTIONS.hair });
    } else if (id === 'outfit') {
      title.textContent = 'OUTFIT';
      sub.textContent = 'WHAT YOU WEAR TO THE LINE';
      rows.push({ key: 'outfit', kind: 'outfit', list: OUTFITS });
      rows.push({ key: 'jacket', kind: 'color', list: LOOK_OPTIONS.jacket });
      rows.push({ key: 'pants', kind: 'color', list: LOOK_OPTIONS.pants });
    } else {
      title.textContent = 'BUILD';
      sub.textContent = 'SHOULDER LINE AND FRAME';
      rows.push({ key: 'build', kind: 'build', list: BUILD_SCALE });
    }
    for (const row of rows) this.renderCharRow(wrap, row, look);
    // a free-form colour input for the skin / cloth rows
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.id = 'char-custom-colour';
    pick.value = look[rows[0].key] && rows[0].kind === 'color' ? look[rows[0].key] : '#ffffff';
    pick.title = 'Any colour for ' + (LOOK_LABELS[rows[0].key] || rows[0].key);
    pick.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
    wrap.appendChild(pick);
    pick.addEventListener('input', () => this.applyLook({ [rows[0].key]: pick.value }));
    const hdr = document.createElement('div');
    hdr.className = 'char-opt';
    hdr.style.cursor = 'pointer';
    hdr.innerHTML = `<div class="co-name">CUSTOM ${LOOK_LABELS[rows[0].key] || ''}</div>
      <div class="co-swatch" style="background:linear-gradient(90deg,#ff0080,#ff8c00,#ffee00,#00ff90,#00b3ff,#7a00ff)"></div>`;
    hdr.addEventListener('click', () => {
      if (this.game.audio) this.game.audio.ui('click');
      pick.click();
    });
    wrap.appendChild(hdr);
  }

  renderCharRow(wrap, row, look) {
    for (let i = 0; i < row.list.length; i++) {
      const val = row.list[i];
      const name = row.kind === 'color' ? val.toUpperCase()
        : (typeof val === 'string' ? val : val.name);
      const selected = row.kind === 'color' ? String(look[row.key]).toLowerCase() === val.toLowerCase() : look[row.key] === i;
      const d = document.createElement('div');
      d.className = 'char-opt' + (selected ? ' sel' : '');
      if (row.kind === 'color') {
        d.innerHTML = `<div class="co-swatch" style="background:${val}"></div><div class="co-name">${name}</div>`;
      } else if (row.kind === 'build') {
        const w = 10 + i * 7;
        d.innerHTML = `<div class="co-figure"><i style="width:${w}px;height:44px"></i><i style="width:${w}px;height:18px"></i></div>
          <div class="co-name">${val.name}</div>`;
      } else if (row.kind === 'outfit') {
        const o = OUTFITS[i];
        const col = o.jacket || look.jacket;
        const pant = o.pants || look.pants;
        d.innerHTML = `<div class="co-figure"><i style="width:22px;height:40px;background:${col}"></i><i style="width:22px;height:22px;background:${pant}"></i></div>
          <div class="co-name">${o.name}</div>`;
      } else {
        d.innerHTML = `<div class="co-figure"><i style="width:26px;height:26px;border-radius:50%;background:${look.hair}"></i></div>
          <div class="co-name">${name}</div>`;
      }
      d.addEventListener('click', () => {
        if (this.game.audio) this.game.audio.ui('click');
        this.applyLook({ [row.key]: row.kind === 'color' ? val : i });
        this.selectCharTab(this.charTab);   // re-render the selection state
      });
      wrap.appendChild(d);
    }
  }

  applyLook(patch) {
    const p = this.game.progression;
    if (!p.data) return;
    p.setLook(patch);
    this.game.refreshPlayerLook();
    if (this.charPreview) this.charPreview.setLook(p.look);
  }

  closeCharacter() {
    const p = this.game.progression;
    p.save();
    this.game.exitLookPreview();
    if (this.charFrom === 'world') {
      this.showOnly(null);
      this.game.returnToWorld();
    } else {
      this.open('garage');
    }
  }

  // ---------------- tuning ----------------
  openTuning(carUid) {
    this.previewMode = 'tune';
    const p = this.game.progression;
    if (carUid) this.garageSelection = carUid;
    if (!this.garageSelection) this.garageSelection = p.activeCar()?.uid;
    const car = this.getGarageCar();
    if (!car) return;
    $('tuning-money').textContent = formatMoney(p.money);
    this.renderTuningTabs();
    this.selectTuningCategory(this.tuningCat);
    this.game.enterPreview(CAR_BY_ID[car.defId], car.mods, 'tune');
  }

  renderTuningTabs() {
    const wrap = $('tuning-tabs');
    wrap.innerHTML = '';
    const p = this.game.progression;
    const car = this.getGarageCar();
    for (const cat of TUNE_CATEGORIES) {
      const d = document.createElement('div');
      const installed = cat.subs.filter((s) => (car.mods[s] ?? 0) > 0).length;
      d.className = 'tuning-tab' + (cat.id === this.tuningCat ? ' active' : '') + (installed ? ' has-new' : '');
      d.innerHTML = `<span class="tt-dot"></span><span>${cat.name}</span><span class="tt-count">${installed}/${cat.subs.length}</span>`;
      d.addEventListener('click', () => {
        this.game.audio.ui('click');
        this.selectTuningCategory(cat.id);
      });
      wrap.appendChild(d);
    }
  }

  selectTuningCategory(id) {
    this.tuningCat = id;
    this.tuningSel = 0;
    const cat = TUNE_CATEGORIES.find((c) => c.id === id);
    $('tuning-cat-title').textContent = cat.name;
    $('tuning-sub').textContent = cat.name;
    const wrap = $('tuning-options');
    wrap.innerHTML = '';
    const p = this.game.progression;
    const car = this.getGarageCar();
    const catParts = [];
    for (const sub of cat.subs) {
      const list = PARTS[sub];
      list.forEach((part, idx) => {
        if (sub === 'paintColor') return; // rendered separately
        catParts.push({ sub, idx, part });
      });
    }
    if (id === 'paint') catParts.unshift({ sub: 'paintColor', idx: 0, part: { name: 'RGB COLOR PICKER', price: 0, desc: 'Choose any colour for the body.' } });
    this._catParts = catParts;
    for (let i = 0; i < catParts.length; i++) {
      const { sub, idx, part } = catParts[i];
      const owned = (car.owned[sub] || []).includes(idx);
      const equipped = (car.mods[sub] ?? 0) === idx;
      const locked = (part.rep || 0) > p.rep;
      const d = document.createElement('div');
      d.className = 'tune-opt' + (owned ? ' owned' : '') + (equipped ? ' equipped' : '') + (locked ? ' locked' : '') + (i === this.tuningSel ? ' sel' : '');
      const priceTxt = equipped ? 'FITTED' : owned ? 'OWNED' : locked ? `REP ${part.rep}` : part.price > 0 ? formatMoney(part.price) : 'FREE';
      const swatch = part.vis?.color === null ? '<div class="to-swatch" style="background:linear-gradient(90deg,#ff0080,#ff8c00,#ffee00,#00ff90,#00b3ff,#7a00ff)"></div>'
        : part.vis?.underglow ? `<div class="to-swatch" style="background:${part.vis.underglow || 'transparent'}"></div>` : '';
      d.innerHTML = `
        <div class="to-name">${part.name}</div>
        <div class="to-price ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}">${priceTxt}</div>
        <div class="to-desc">${SUB_NAMES[sub] || sub}</div>
        ${swatch}`;
      d.addEventListener('click', () => {
        if (locked) { this.game.audio.ui('error'); return; }
        this.tuningSel = i;
        this.game.audio.ui('click');
        this.renderTuningSelection();
        // instant preview of cosmetics
        this.previewPart(sub, idx);
      });
      wrap.appendChild(d);
    }
    this.renderTuningSelection();
  }

  previewPart(sub, idx) {
    const car = this.getGarageCar();
    if (!car) return;
    const tempMods = JSON.parse(JSON.stringify(car.mods));
    tempMods[sub] = idx;
    // colour picker applies live
    if (sub === 'paintColor') return;
    this.game.updatePreviewMods(tempMods);
  }

  renderTuningSelection() {
    const car = this.getGarageCar();
    if (!car) return;
    const item = this._catParts[this.tuningSel];
    if (!item) return;
    const { sub, idx, part } = item;
    // highlight
    const opts = $('tuning-options').children;
    for (let i = 0; i < opts.length; i++) opts[i].classList.toggle('sel', i === this.tuningSel);
    const equipped = (car.mods[sub] ?? 0) === idx;
    const owned = (car.owned[sub] || []).includes(idx);
    $('tuning-part-name').textContent = part.name;
    $('tuning-part-desc').textContent = part.desc || '';
    const priceEl = $('tuning-price');
    const buyBtn = $('btn-tuning-buy');
    const label = buyBtn.querySelector('.mb-label');
    if (equipped) {
      priceEl.textContent = 'FITTED';
      priceEl.className = 'part-price';
      buyBtn.disabled = true;
      label.textContent = 'INSTALLED';
    } else if (owned) {
      priceEl.textContent = 'OWNED';
      priceEl.className = 'part-price';
      buyBtn.disabled = false;
      label.textContent = 'FIT PART';
    } else if ((part.rep || 0) > this.game.progression.rep) {
      priceEl.textContent = `REQUIRES ${part.rep} REP`;
      priceEl.className = 'part-price poor';
      buyBtn.disabled = true;
      label.textContent = 'LOCKED';
    } else {
      priceEl.textContent = part.price > 0 ? formatMoney(part.price) : 'FREE';
      priceEl.className = 'part-price' + (part.price > this.game.progression.money ? ' poor' : '');
      buyBtn.disabled = part.price > this.game.progression.money;
      label.textContent = 'INSTALL';
    }
    // custom colour control
    if (sub === 'paintColor') {
      priceEl.textContent = 'CUSTOM';
      buyBtn.disabled = true;
      label.textContent = 'PICK BELOW';
    }
    this.renderCompare(car, sub, idx);
    this.renderColorPicker(sub);
  }

  renderColorPicker(sub) {
    const holder = $('color-picker-row');
    if (holder) holder.innerHTML = '';
    if (sub !== 'paintColor' || !holder) return;
    const car = this.getGarageCar();
    const wrap = document.createElement('div');
    wrap.id = 'color-picker-row';
    wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px';
    // hue slider
    const input = document.createElement('input');
    input.type = 'color';
    input.value = car.mods.paintColor || '#b9c4cd';
    input.style.cssText = 'width:44px;height:30px;border:none;background:none;padding:0;cursor:pointer';
    input.addEventListener('input', () => {
      const c = car.mods.paintColor;
      this.game.progression.setMod(car.uid, 'paintColor', input.value);
      this.game.updatePreviewMods({ ...car.mods, paintColor: input.value });
    });
    input.addEventListener('change', () => { this.game.progression.save(); this.game.audio.ui('click'); });
    wrap.appendChild(input);
    for (const c of PAINT_PRESETS) {
      const b = document.createElement('button');
      b.style.cssText = `width:20px;height:20px;border-radius:3px;background:${c};border:1px solid rgba(255,255,255,.3);cursor:pointer`;
      b.addEventListener('click', () => {
        this.game.audio.ui('click');
        this.game.progression.setMod(car.uid, 'paintColor', c);
        this.game.updatePreviewMods({ ...car.mods, paintColor: c });
        input.value = c;
        this.game.progression.save();
      });
      wrap.appendChild(b);
    }
    holder.appendChild(wrap);
  }

  renderCompare(car, sub, idx) {
    const def = CAR_BY_ID[car.defId];
    const cur = computeStats(def, car.mods);
    const nextMods = { ...car.mods, [sub]: idx };
    const next = computeStats(def, nextMods);
    const rows = [
      { label: 'POWER', a: cur.ratings.POWER, b: next.ratings.POWER, text: `${cur.hp}→${next.hp}` },
      { label: 'SPEED', a: cur.ratings.SPEED, b: next.ratings.SPEED, text: `${cur.topSpeed}→${next.topSpeed}` },
      { label: 'ACCEL', a: cur.ratings.ACCEL, b: next.ratings.ACCEL, text: `${cur.accel.toFixed(1)}→${next.accel.toFixed(1)}` },
      { label: 'HANDLING', a: cur.ratings.HANDLING, b: next.ratings.HANDLING, text: `${Math.round(cur.handling)}→${Math.round(next.handling)}` },
      { label: 'BRAKES', a: cur.ratings.BRAKE, b: next.ratings.BRAKE, text: `${Math.round(cur.brake)}→${Math.round(next.brake)}` },
      { label: 'WEIGHT', a: cur.ratings.WEIGHT, b: next.ratings.WEIGHT, text: `${cur.weight}→${next.weight}` },
    ];
    $('tuning-compare').innerHTML = rows.map((r) => {
      const up = r.b > r.a, down = r.b < r.a;
      return `<div class="cmp-row"><span>${r.label}</span>
        <div class="cmp-track"><i class="cmp-cur" style="width:${r.a}%"></i><i class="cmp-new" style="width:${r.b}%;opacity:.75"></i></div>
        <span class="cmp-val ${up ? (r.label === 'WEIGHT' ? 'down' : 'up') : down ? (r.label === 'WEIGHT' ? 'up' : 'down') : ''}">${r.text}</span></div>`;
    }).join('');
  }

  buyTuningPart() {
    const car = this.getGarageCar();
    const item = this._catParts[this.tuningSel];
    if (!car || !item) return;
    const { sub, idx, part } = item;
    const res = this.game.progression.installPart(car.uid, sub, idx, part.price || 0);
    if (!res.ok) {
      this.game.audio.ui('error');
      this.game.hud.toast(res.reason || 'Cannot install', 'warn');
      return;
    }
    this.game.audio.ui('confirm');
    this.game.audio.cashRegister?.();
    $('tuning-money').textContent = formatMoney(this.game.progression.money);
    this.game.progression.save();
    this.game.updatePreviewMods(car.mods);
    this.selectTuningCategory(this.tuningCat);
    this.renderTuningTabs();
    this.game.hud.toast(`${part.name} INSTALLED`, 'rep');
  }

  // ---------------- dealership ----------------
  openDealer() {
    this.previewMode = 'dealer';
    const p = this.game.progression;
    $('dealer-money').textContent = formatMoney(p.money);
    const list = $('dealer-list');
    list.innerHTML = '';
    const sorted = CAR_DEFS.slice().sort((a, b) => a.price - b.price);
    if (!this.dealerSelection) this.dealerSelection = sorted[0].id;
    for (const def of sorted) {
      const owned = p.cars.some((c) => c.defId === def.id);
      const locked = p.rep < def.repReq;
      const afford = p.money >= def.price;
      const d = document.createElement('div');
      d.className = 'car-item' + (def.id === this.dealerSelection ? ' sel' : '');
      if (locked) d.style.opacity = '0.55';
      d.innerHTML = `
        <div class="ci-top"><span class="ci-name">${def.name}</span>
          <span class="ci-value" style="${afford ? '' : 'color:#ff6b6b'}">${formatMoney(def.price)}</span></div>
        <div class="ci-sub"><span>${def.class}</span><span>${def.hp}HP</span><span>${def.drivetrain}</span>
        ${owned ? '<span class="ci-badge">OWNED</span>' : ''}
        ${locked ? `<span class="ci-badge locked">REP ${def.repReq}</span>` : ''}</div>`;
      d.addEventListener('click', () => {
        this.game.audio.ui('click');
        this.dealerSelection = def.id;
        this.openDealer();
        this.renderDealerDetail(def);
      });
      list.appendChild(d);
    }
    this.renderDealerDetail(CAR_BY_ID[this.dealerSelection]);
  }

  renderDealerDetail(def) {
    const stats = computeStats(def, defaultMods(def));
    $('dealer-car-name').textContent = def.name;
    $('dealer-car-class').textContent = `${def.class} · ${def.year} · ${def.drivetrain}`;
    $('dealer-stats').innerHTML = statBars(stats, stats);
    $('dealer-specs').innerHTML = `
      <div class="spec"><span>POWER</span><b>${def.hp} HP</b></div>
      <div class="spec"><span>TOP SPEED</span><b>${def.topSpeed} KM/H</b></div>
      <div class="spec"><span>0-100</span><b>${def.accel.toFixed(1)} s</b></div>
      <div class="spec"><span>WEIGHT</span><b>${def.weight} KG</b></div>
      <div class="spec"><span>GEARS</span><b>${def.gears}</b></div>
      <div class="spec"><span>PRICE</span><b>${formatMoney(def.price)}</b></div>`;
    const p = this.game.progression;
    const btn = $('btn-dealer-buy');
    const owned = p.cars.some((c) => c.defId === def.id);
    btn.disabled = false;
    btn.querySelector('.mb-label').textContent = owned ? 'BUY ANOTHER' : 'BUY';
    this.game.enterPreview(def, defaultMods(def), 'dealer');
  }

  buyCar() {
    const def = CAR_BY_ID[this.dealerSelection];
    const p = this.game.progression;
    const res = p.buyCar(def.id);
    if (!res.ok) {
      this.game.audio.ui('error');
      this.game.hud.toast(res.reason, 'warn', 4000);
      return;
    }
    this.game.audio.ui('confirm');
    this.game.audio.cashRegister?.();
    p.save();
    $('dealer-money').textContent = formatMoney(p.money);
    this.game.hud.toast(`PURCHASED ${def.name} — ${formatMoney(def.price)}`, 'money', 4000);
    this.openDealer();
    this.renderDealerDetail(def);
  }

  // ---------------- settings ----------------
  syncSettings() {
    const s = this.game.settings.data;
    $('set-quality').value = s.quality;
    $('set-shadows').value = s.shadows;
    $('set-bloom').checked = !!s.bloom;
    $('set-weather').checked = !!s.weather;
    $('set-fov').value = s.fov;
    $('fov-out').textContent = s.fov;
    $('set-fogdist').value = s.fogdist;
    $('dd-out').textContent = ['NEAR', 'MED', 'FAR'][s.fogdist] || 'MED';
    $('set-vol-master').value = s.volMaster;
    $('vol-master-out').textContent = s.volMaster;
    $('set-vol-sfx').value = s.volSfx;
    $('vol-sfx-out').textContent = s.volSfx;
    $('set-vol-music').value = s.volMusic;
    $('vol-music-out').textContent = s.volMusic;
    $('set-vol-amb').value = s.volAmb;
    $('vol-amb-out').textContent = s.volAmb;
    $('set-trans').value = s.transmission;
    $('set-camdist').value = s.camDist;
    $('cam-out').textContent = Number(s.camDist).toFixed(1);
    $('set-sens').value = s.sensitivity;
    $('sens-out').textContent = Number(s.sensitivity).toFixed(1);
    $('set-time').value = s.timeMode;
    $('set-inverty').checked = !!s.invertY;
    $('set-assists').checked = s.assists !== false;
  }

  // ---------------- results ----------------
  showResult(result) {
    const { ev, position, time, bestLap, payout, rep, success, reason, score } = result;
    const rankEl = $('result-rank');
    rankEl.textContent = ev.type === 'drift' ? (success ? 'SUCCESS' : 'FAILED')
      : ev.type === 'timeattack' || ev.type === 'delivery' ? (success ? 'CLEARED' : 'FAILED')
        : `${ordinal(position).toUpperCase()}`;
    rankEl.className = 'result-rank' + (position === 1 && success ? ' first' : !success ? ' lose' : '');
    $('result-title').textContent = success
      ? (position === 1 && ev.opponents ? 'RACE WON' : 'RACE COMPLETE')
      : 'EVENT FAILED';
    $('result-time').textContent = formatTime(time);
    $('result-best').textContent = bestLap != null ? formatTime(bestLap) : (score != null ? score.toLocaleString() + ' PTS' : '—');
    $('result-money').textContent = formatMoney(payout || 0);
    $('result-rep').textContent = `+${rep || 0}`;
    const extra = [];
    if (reason) extra.push(reason);
    if (ev.type === 'drift' && score != null) extra.push(`TARGET ${(ev.targetScore || 0).toLocaleString()} PTS`);
    if (ev.type === 'timeattack') extra.push(`TARGET ${formatTime(ev.targetTime)}`);
    const rec = this.game.progression.bestFor(ev.id);
    if (rec?.bestTime) extra.push(`BEST ${formatTime(rec.bestTime)}`);
    $('result-extra').textContent = extra.join(' · ');
    $('btn-result-retry').style.display = success && position === 1 ? '' : '';
  }

  // ---------------- race calendar ----------------
  // Every event is reachable from here: picking one puts the car on its start
  // line and opens the brief. No cross-city drive, no hunting for a marker.
  openRaces() {
    const g = this.game;
    const p = g.progression;
    $('races-rep').textContent = p.rep;
    $('races-money').textContent = formatMoney(p.money);
    const list = $('race-list');
    const focus = g.getFocusPos();
    list.innerHTML = '';
    const sorted = [...EVENTS].sort((a, b) => (a.repReq || 0) - (b.repReq || 0));
    for (const ev of sorted) {
      const unlocked = p.isUnlocked(ev);
      const d = Math.round(Math.hypot(ev.x - focus.x, ev.z - focus.z));
      const card = document.createElement('button');
      card.className = 'race-card' + (unlocked ? '' : ' locked');
      card.dataset.eventId = ev.id;
      const rec = p.bestFor(ev.id);
      const bits = [`${ev.laps || 1} LAP${(ev.laps || 1) > 1 ? 'S' : ''}`, `${ev.route.length} CP`];
      if (ev.opponents) bits.push(`${ev.opponents} RIVALS`);
      card.innerHTML = `
        <div class="rc-top"><span class="rc-name">${ev.name}</span><span class="rc-type">${ev.type.toUpperCase()}</span></div>
        <div class="rc-sub">${ev.district} · ${bits.join(' · ')}</div>
        <div class="rc-stats"><span>PRIZE <b>${formatMoney(ev.prize)}</b></span><span>ENTRY ${ev.fee ? formatMoney(ev.fee) : 'FREE'}</span></div>
        ${unlocked ? `<div class="rc-dist">${d} m away${rec ? ' · best ' + formatTime(rec.time) : ''}</div>`
          : `<div class="rc-req">NEEDS ${ev.repReq} REP</div>`}`;
      card.disabled = !unlocked;
      card.addEventListener('click', () => {
        const call = () => { g.audio.ui('click'); g.jumpToEvent(ev); };
        if (card.disabled) { g.audio.ui('error'); return; }
        call();
      });
      list.appendChild(card);
    }
  }

  // ---------------- event brief ----------------
  showBrief(ev) {
    this._briefEv = ev;
    $('brief-type').textContent = ev.type.toUpperCase();
    $('brief-name').textContent = ev.name;
    $('brief-desc').textContent = ev.desc;
    $('brief-route').textContent = `${ev.route.length} CP`;
    $('brief-fee').textContent = ev.fee ? formatMoney(ev.fee) : 'FREE';
    $('brief-prize').textContent = formatMoney(ev.prize);
    $('brief-rep').textContent = ev.repReq || 0;
    const rec = this.game.progression.bestFor(ev.id);
    const bits = [];
    if (rec?.bestTime) bits.push(`BEST ${formatTime(rec.bestTime)}`);
    if (rec?.bestScore) bits.push(`BEST ${rec.bestScore.toLocaleString()} PTS`);
    if (rec) bits.push(`${rec.wins} WINS / ${rec.plays} RUNS`);
    $('brief-extra').textContent = bits.join(' · ');
    $('btn-brief-start').disabled = this.game.progression.money < (ev.fee || 0);
    if (this.game.progression.money < (ev.fee || 0)) $('brief-extra').textContent = 'YOU CANNOT AFFORD THE ENTRY FEE';
  }

  // ---------------- bind all the buttons ----------------
  bind() {
    const g = this.game;
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
    };

    // main menu
    on('btn-continue', () => g.continueGame());
    on('btn-newgame', () => { g.startNewGame(); });
    on('btn-garage-menu', () => this.open('garage'));
    on('btn-driver-menu', () => { this.showOnly('character'); this.open('character', { from: 'garage' }); });
    on('btn-dealer-menu', () => this.open('dealership'));
    on('btn-settings-menu', () => { this.settingsScreenTarget = 'menu'; this.open('settings'); });
    on('btn-credits', () => this.open('credits'));
    on('btn-credits-back', () => this.open('menu'));
    on('btn-settings-back', () => {
      this.close('settings');
      if (this.settingsScreenTarget === 'menu') this.open('menu');
      else if (this.settingsScreenTarget === 'pause') this.open('pause');
      else this.current = null;
      g.refreshSettings();
    });

    // pause
    on('btn-resume', () => g.resume());
    on('btn-pause-races', () => { this.showOnly('races'); });
    on('btn-races-close', () => { this.close('races'); g.resume(); });
    on('btn-pause-garage', () => { g.paused = false; this.showOnly('garage'); });
    on('btn-pause-settings', () => { this.settingsScreenTarget = 'pause'; this.open('settings'); });
    on('btn-pause-save', () => { g.saveGame(); this.game.hud.toast('GAME SAVED', 'money'); });
    on('btn-pause-menu', () => g.toMainMenu());

    // garage
    on('btn-garage-close', () => this.closeToWorld());
    on('btn-garage-drive', () => this.driveOut(this.garageSelection));
    on('btn-garage-tune', () => this.open('tuning', { car: this.garageSelection }));
    on('btn-garage-driver', () => { this.open('character', { from: 'garage' }); });
    on('btn-garage-sell', () => {
      const p = g.progression;
      const car = this.getGarageCar();
      if (!car) return;
      const def = CAR_BY_ID[car.defId];
      const val = Math.round(carValue(def, car.mods) * 0.82);
      if (!confirm(`Sell ${def.name} for ${formatMoney(val)}?`)) return;
      const res = p.sellCar(car.uid);
      if (!res.ok) { g.hud.toast(res.reason, 'warn'); return; }
      g.audio.cashRegister?.();
      g.hud.toast(`SOLD ${def.name} FOR ${formatMoney(val)}`, 'money');
      this.garageSelection = p.data.activeCar;
      p.save();
      this.openGarage();
    });

    // character customisation
    on('btn-char-close', () => this.closeCharacter());
    on('btn-char-done', () => this.closeCharacter());
    on('btn-char-preview', () => { g.spinLookPreview(); });
    on('btn-char-random', () => {
      const rnd = (list) => list[Math.floor(Math.random() * list.length)];
      this.applyLook({
        skin: rnd(LOOK_OPTIONS.skin), hair: rnd(LOOK_OPTIONS.hair),
        jacket: rnd(LOOK_OPTIONS.jacket), accent: rnd(LOOK_OPTIONS.accent),
        pants: rnd(LOOK_OPTIONS.pants), shoe: rnd(LOOK_OPTIONS.shoe),
        hairStyle: Math.floor(Math.random() * LOOK_OPTIONS.hairStyle.length),
        build: Math.floor(Math.random() * BUILD_SCALE.length),
        outfit: Math.floor(Math.random() * OUTFITS.length),
      });
      this.selectCharTab(this.charTab);
    });
    on('btn-char-reset', () => {
      this.applyLook(defaultLook());
      this.selectCharTab(this.charTab);
    });

    // tuning
    on('btn-tuning-close', () => { this.open('garage'); });
    on('btn-tuning-back', () => { this.open('garage'); });
    on('btn-tuning-buy', () => this.buyTuningPart());

    // dealership
    on('btn-dealer-close', () => {
      if (g.worldActive) this.closeToWorld();
      else this.open('menu');
    });
    on('btn-dealer-buy', () => this.buyCar());

    // map
    on('btn-map-close', () => { this.close('map-screen'); g.resumeFromMap(); });

    // results
    on('btn-result-continue', () => { g.closeResults(); });
    on('btn-result-retry', () => { g.retryRace(); });

    // brief
    on('btn-brief-start', () => { g.startEventFromBrief(); });
    on('btn-brief-back', () => { this.close('brief'); g.resumeFromBrief(); });

    // settings inputs
    const bindSet = (id, key, transform, labelId, fmt) => {
      const el = $(id);
      if (!el) return;
      const evt = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        if (transform) v = transform(v);
        g.settings.set(key, v);
        if (labelId) {
          const out = $(labelId);
          if (out) out.textContent = fmt ? fmt(v) : v;
        }
        g.applySetting(key, v);
      });
    };
    bindSet('set-quality', 'quality', null);
    bindSet('set-shadows', 'shadows', null);
    bindSet('set-bloom', 'bloom', null);
    bindSet('set-weather', 'weather', null);
    bindSet('set-fov', 'fov', null, 'fov-out');
    bindSet('set-fogdist', 'fogdist', null, 'dd-out', (v) => ['NEAR', 'MED', 'FAR'][v]);
    bindSet('set-vol-master', 'volMaster', null, 'vol-master-out');
    bindSet('set-vol-sfx', 'volSfx', null, 'vol-sfx-out');
    bindSet('set-vol-music', 'volMusic', null, 'vol-music-out');
    bindSet('set-vol-amb', 'volAmb', null, 'vol-amb-out');
    bindSet('set-trans', 'transmission', null);
    bindSet('set-camdist', 'camDist', null, 'cam-out', (v) => Number(v).toFixed(1));
    bindSet('set-sens', 'sensitivity', null, 'sens-out', (v) => Number(v).toFixed(1));
    bindSet('set-time', 'timeMode', null);
    bindSet('set-inverty', 'invertY', null);
    bindSet('set-assists', 'assists', null);

    on('btn-wipe-save', () => {
      if (!confirm('Erase all saved progress? This cannot be undone.')) return;
      g.progression.wipe();
      g.hud.toast('SAVE DATA ERASED', 'warn');
      this.open('menu');
    });
  }
}

// helpers
function statBars(stats, base) {
  const rows = [
    ['POWER', stats.ratings.POWER, base.ratings.POWER, stats.hp + ' HP'],
    ['SPEED', stats.ratings.SPEED, base.ratings.SPEED, stats.topSpeed + ' KM/H'],
    ['ACCEL', stats.ratings.ACCEL, base.ratings.ACCEL, stats.accel.toFixed(1) + ' S'],
    ['HANDLING', stats.ratings.HANDLING, base.ratings.HANDLING, Math.round(stats.handling) + ''],
    ['BRAKING', stats.ratings.BRAKE, base.ratings.BRAKE, Math.round(stats.brake) + ''],
  ];
  return rows.map(([label, val, base, num]) => `
    <div class="stat-bar"><span>${label}</span>
      <div class="track"><i class="fill" style="width:${val}%"></i></div>
      <span class="num">${num}</span>
    </div>`).join('');
}
