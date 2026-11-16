// ============================================================
// HUD — speedometer, minimap, notifications, race overlays, map
// ============================================================
import { CONFIG, DISTRICTS } from '../config.js';
import { formatMoney, formatTime, ordinal, clamp } from '../core/util.js';
import { GRID, ROAD_HW, RING, RING_HW, EVENTS, POIS, districtOf, DISTRICT_LABEL, canyonRoad, blockCenters } from '../world/layout.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), money: $('hud-money'), rep: $('hud-rep'), clock: $('hud-clock'),
      district: $('hud-district'), weather: $('hud-weather'),
      speed: $('speed-val'), gear: $('gear-val'), carName: $('car-name'), carHp: $('car-hp'),
      rpmArc: $('rpm-arc'), rpmGlow: $('rpm-arc-glow'), ticks: $('speedo-ticks'), speedo: $('speedo'),
      nitro: $('nitro-bar'), nitroFill: $('nitro-fill'),
      minimap: $('minimap'), coords: $('map-coords'),
      prompt: $('prompt'), promptText: $('prompt-text'),
      toasts: $('toasts'), countdown: $('countdown'), centerMsg: $('center-msg'),
      raceBanner: $('race-banner'), raceName: $('race-name'), racePos: $('race-pos'),
      raceLap: $('race-lap'), raceTime: $('race-time'), objective: $('objective'),
      drift: $('drift-meter'), driftScore: $('drift-score'), driftMult: $('drift-mult'),
      stars: document.querySelectorAll('.wstar'),
      bigmap: $('bigmap'), damageFlash: $('damage-flash'),
    };
    this.miniCtx = this.el.minimap.getContext('2d');
    this.bigCtx = this.el.bigmap.getContext('2d');
    this.lastSpeed = -1;
    this.lastGear = '';
    this.lastMoney = null;
    this.lastRep = null;
    this._buildTicks();
    this._buildMiniMapStatic();
    this._toastQueue = [];
  }

  show(on = true) { this.el.hud.classList.toggle('hidden', !on); }

  _buildTicks() {
    const g = this.el.ticks;
    g.innerHTML = '';
    const cx = 100, cy = 100, r1 = 84;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      const major = i % 2 === 0;
      const len = major ? 9 : 5;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx + Math.cos(a) * r1);
      line.setAttribute('y1', cy + Math.sin(a) * r1);
      line.setAttribute('x2', cx + Math.cos(a) * (r1 - len));
      line.setAttribute('y2', cy + Math.sin(a) * (r1 - len));
      if (major) line.setAttribute('class', 'major');
      g.appendChild(line);
    }
  }

  update(dt, state) {
    const { vehicle, player, env, progression } = state;
    // money / rep
    if (this.lastMoney !== progression.money) {
      this.el.money.textContent = formatMoney(progression.money);
      this.lastMoney = progression.money;
    }
    if (this.lastRep !== progression.rep) {
      this.el.rep.textContent = progression.rep;
      this.lastRep = progression.rep;
    }
    // clock / district / weather
    const t = env.time;
    const hh = String(Math.floor(t) % 24).padStart(2, '0');
    const mm = String(Math.floor((t % 1) * 60)).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}`;
    const pos = vehicle || player;
    const d = districtOf(pos.x, pos.z);
    const dl = DISTRICT_LABEL[d] || 'SAN VELOR';
    if (this.el.district.textContent !== dl) this.el.district.textContent = dl;
    const w = env.weather === 'rain' ? 'RAIN' : env.weather === 'fog' ? 'FOG' : 'CLEAR';
    if (this.el.weather.textContent !== w) this.el.weather.textContent = w;

    // speedo
    if (vehicle) {
      this.el.speedo.classList.remove('hidden');
      const kmh = Math.round(vehicle.speed * 3.6);
      if (kmh !== this.lastSpeed) {
        this.el.speed.textContent = kmh;
        this.lastSpeed = kmh;
      }
      const gear = vehicle.longSpeed < -0.4 ? 'R' : vehicle.shiftTimer > 0 ? '·' : String(vehicle.gear);
      if (gear !== this.lastGear) { this.el.gear.textContent = gear; this.lastGear = gear; }
      if (this.el.carName.textContent !== vehicle.def.name) {
        this.el.carName.textContent = vehicle.def.name;
        this.el.carHp.textContent = vehicle.stats.hp + ' HP';
      }
      // rpm arc (270° sweep from 135° to 405°)
      const rpmN = clamp(vehicle.rpm / 8000, 0, 1);
      const sweep = rpmN * 270;
      const arc = describeArc(100, 100, 78, 135, 135 + sweep);
      this.el.rpmArc.setAttribute('d', arc);
      this.el.rpmGlow.setAttribute('d', arc);
      this.el.nitro.classList.toggle('hidden', !(vehicle.stats.hp >= 0 && vehicle.mods && (vehicle.mods.turbo > 0 || vehicle.def.body.style === 'super')));
      this.el.nitroFill.style.width = (vehicle.nitro * 100).toFixed(0) + '%';
    } else {
      this.el.speedo.classList.add('hidden');
    }
    // minimap
    this.drawMinimap(pos, vehicle, player);
    this.el.coords.textContent = DISTRICT_LABEL[d] || 'SAN VELOR';
  }

  // ---------- prompts & toasts ----------
  showPrompt(text) {
    if (!this.el.promptText.textContent || this.el.prompt.classList.contains('hidden')) {
      this.el.promptText.textContent = text;
      this.el.prompt.classList.remove('hidden');
    } else if (this.el.promptText.textContent !== text) {
      this.el.promptText.textContent = text;
    }
  }
  hidePrompt() { this.el.prompt.classList.add('hidden'); }

  toast(text, kind = '', ms = 3400) {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .4s, transform .4s';
      d.style.opacity = '0';
      d.style.transform = 'translateX(18px)';
      setTimeout(() => d.remove(), 420);
    }, ms);
    while (this.el.toasts.children.length > 5 && this.el.toasts.firstChild) this.el.toasts.firstChild.remove();
  }

  setObjective(text) {
    if (!text) { this.el.objective.classList.add('hidden'); return; }
    this.el.objective.classList.remove('hidden');
    this.el.objective.textContent = text;
  }

  centerMessage(title, sub = '', ms = 2200) {
    const el = this.el.centerMsg;
    el.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'cdPop .4s ease-out';
    clearTimeout(this._centerTimer);
    this._centerTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  setWanted(n) {
    this.el.stars.forEach((s, i) => s.classList.toggle('on', i < n));
  }
  setHeat(n, heat) {
    // pulse the last star while escaping
    const idx = Math.max(0, n - 1);
    const el = this.el.stars[idx];
    if (!el) return;
    if (heat > 0.02) {
      el.style.opacity = String(0.35 + Math.sin(performance.now() * 0.008) * 0.3 + heat * 0.4);
    } else el.style.opacity = '';
  }

  // ---------- race HUD ----------
  showRace(ev) {
    this.el.raceBanner.classList.remove('hidden');
    this.el.raceName.textContent = ev.name;
    this.el.racePos.textContent = '—';
    this.el.raceLap.textContent = `LAP 1/${ev.laps || 1}`;
    this.el.raceTime.textContent = '00:00.00';
    this.lastRaceT = -1;
  }
  hideRace() {
    this.el.raceBanner.classList.add('hidden');
    this.el.countdown.classList.add('hidden');
    this.el.drift.classList.add('hidden');
  }
  updateRace({ timer, position, lap, totalLaps }) {
    const t = Math.round(timer * 100);
    if (t !== this.lastRaceT) {
      this.el.raceTime.textContent = formatTime(timer);
      this.lastRaceT = t;
    }
    const posStr = ordinal(position).toUpperCase();
    if (this.el.racePos.textContent !== posStr) this.el.racePos.textContent = posStr;
    const lapStr = `LAP ${Math.min(lap, totalLaps)}/${totalLaps}`;
    if (this.el.raceLap.textContent !== lapStr) this.el.raceLap.textContent = lapStr;
  }
  setCountdown(text) {
    const el = this.el.countdown;
    if (text === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = text;
    el.classList.toggle('go', text === 'GO!');
    el.classList.remove('anim');
    void el.offsetWidth;
    el.classList.add('anim');
    if (text === 'GO!') setTimeout(() => { if (el.textContent === 'GO!') el.classList.add('hidden'); }, 900);
  }
  showDrift(score, mult) {
    this.el.drift.classList.remove('hidden');
    this.el.driftScore.textContent = Math.round(score).toLocaleString();
    this.el.driftMult.textContent = 'x' + mult.toFixed(1);
  }
  hideDrift() { this.el.drift.classList.add('hidden'); }
  raceCheckpoint() { this.el.raceBanner.style.borderColor = 'rgba(37,224,208,.6)'; setTimeout(() => this.el.raceBanner.style.borderColor = '', 260); }
  damageFlash(strength) {
    const el = this.el.damageFlash;
    el.style.opacity = String(clamp(strength, 0, 0.8));
    setTimeout(() => { el.style.opacity = '0'; }, 60);
  }

  // ---------- minimap ----------
  _buildMiniMapStatic() {
    // build a small offscreen canvas of the road network
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.fillStyle = '#0b0f14';
    c.fillRect(0, 0, S, S);
    const W = CONFIG.world.bound * 2 + 40;
    const toPx = (x, z) => [((x + W / 2) / W) * S, ((z + W / 2) / W) * S];
    // blocks
    c.fillStyle = '#151d25';
    for (const bl of blockCenters()) {
      const s = (bl.size - 6.4) / W * S;
      const [px, pz] = toPx(bl.cx, bl.cz);
      c.fillRect(px - s / 2, pz - s / 2, s, s);
    }
    // roads
    c.strokeStyle = '#33414f';
    c.lineWidth = Math.max(2, (CONFIG.world.roadWidth / W) * S);
    for (const g of GRID) {
      let [x1, z1] = toPx(g, -RING - 20);
      let [x2, z2] = toPx(g, RING + 20);
      c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.stroke();
      [x1, z1] = toPx(-RING - 20, g);
      [x2, z2] = toPx(RING + 20, g);
      c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.stroke();
    }
    // ring
    c.strokeStyle = '#425264';
    c.lineWidth = Math.max(2, (RING_HW * 2 / W) * S);
    const [rx1, rz1] = toPx(-RING, -RING);
    const [rx2, rz2] = toPx(RING, RING);
    c.strokeRect(rx1, rz1, rx2 - rx1, rz2 - rz1);
    // ocean
    const [, oz] = toPx(0, CONFIG.world.coastZ);
    c.fillStyle = 'rgba(16,42,60,.85)';
    c.fillRect(0, oz, S, S - oz);
    // canyon road
    c.strokeStyle = '#5a5244';
    c.lineWidth = 3;
    c.beginPath();
    canyonRoad().forEach((p, i) => {
      const [px, pz] = toPx(p.x, p.z);
      if (i === 0) c.moveTo(px, pz); else c.lineTo(px, pz);
    });
    c.stroke();
    this.miniStatic = cv;
    this._miniStaticCtx = c;
    this._mapW = W;
    this._mapS = S;
  }

  _toMap(x, z, S = this._mapS) {
    const W = this._mapW;
    return [((x + W / 2) / W) * S, ((z + W / 2) / W) * S];
  }

  drawMinimap(pos, vehicle, player) {
    const ctx = this.miniCtx;
    const S = this.el.minimap.width;
    const c = S / 2;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, S, S);

    // zoomed view centred on the player
    const zoom = vehicle ? 0.72 : 0.52;     // px per world unit
    const heading = vehicle ? vehicle.heading : (player ? player.heading : 0);
    const rot = -heading - Math.PI / 2;     // forward = up
    ctx.translate(c, c);
    ctx.rotate(rot);
    const ox = pos.x, oz = pos.z;
    // static map (scaled)
    const scale = (S * zoom) / 110;   // show ~110 world units radius? adjust below
    const pxPerWorld = zoom * (S / 100) / 12;
    const k = (S / 100) * zoom * 0.14;
    ctx.scale(k, k);
    ctx.translate(-ox, -oz);
    // draw the static city canvas positioned by world coords
    const W = this._mapW;
    const drawSize = W;
    ctx.drawImage(this.miniStatic, -W / 2, -W / 2, W, W);
    // POI + event markers
    this._drawPoiMarkers(ctx, 1 / k, true);
    ctx.restore();

    // player arrow (fixed in centre, rotated with heading)
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(0);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#25e0d0';
    ctx.shadowColor = '#25e0d0';
    ctx.shadowBlur = 9;
    ctx.fill();
    ctx.restore();

    // north indicator
    ctx.save();
    ctx.translate(c, 14);
    ctx.rotate(rot + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, 0);
    ctx.restore();
  }

  _drawPoiMarkers(ctx, scale, small) {
    const mark = (x, z, color, size, ring = false) => {
      ctx.beginPath();
      ctx.arc(x, z, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (ring) { ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = size * 0.6; ctx.stroke(); }
      ctx.fill();
    };
    for (const ev of EVENTS) {
      const prog = this.game.progression;
      const unlocked = prog.isUnlocked(ev);
      mark(ev.x, ev.z, unlocked ? '#ffc247' : '#4a525c', small ? 5 : 7, true);
    }
    const poiColors = { garage: '#25e0d0', tune: '#ffc247', dealer: '#a56bff', meet: '#ff7ad9', gas: '#7f8c98', drift: '#ff9a3c' };
    for (const k of Object.keys(POIS)) {
      const p = POIS[k];
      mark(p.x, p.z, poiColors[p.type] || '#8899aa', small ? 4 : 6, true);
    }
  }

  // ---------- big map ----------
  openBigMap(pos) {
    this.drawBigMap(pos);
  }

  drawBigMap(pos) {
    const ctx = this.bigCtx;
    const S = this.el.bigmap.width;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.miniStatic, 0, 0, S, S);
    const W = this._mapW;
    const sc = S / W;
    const tx = (x) => (x + W / 2) * sc;
    // labels
    const labels = [
      { x: 180, z: -120, t: 'DOWNTOWN' }, { x: -60, z: -180, t: 'NIGHTLIFE' },
      { x: -300, z: -240, t: 'CANYON HILLS' }, { x: -240, z: 240, t: 'PALM HEIGHTS' },
      { x: 300, z: 300, t: 'IRON YARDS' }, { x: 240, z: 400, t: 'VELOR HARBOR' },
      { x: 60, z: 180, t: 'AUTO ROW' }, { x: -60, z: 0, t: 'THE STRIP' },
      { x: 360, z: -240, t: 'MIDTOWN' },
    ];
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = 'rgba(160,180,200,.45)';
    ctx.textAlign = 'center';
    for (const l of labels) ctx.fillText(l.t, tx(l.x), tx(l.z));
    // markers
    for (const ev of EVENTS) {
      const unlocked = this.game.progression.isUnlocked(ev);
      ctx.beginPath();
      ctx.arc(tx(ev.x), tx(ev.z), 7, 0, Math.PI * 2);
      ctx.fillStyle = unlocked ? '#ffc247' : '#3d444d';
      ctx.fill();
      ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = unlocked ? '#ffd98a' : '#5d6873';
      ctx.textAlign = 'left';
      ctx.fillText(ev.name, tx(ev.x) + 11, tx(ev.z) + 3);
    }
    const poiColors = { garage: '#25e0d0', tune: '#ffc247', dealer: '#a56bff', meet: '#ff7ad9', gas: '#7f8c98', drift: '#ff9a3c' };
    for (const k of Object.keys(POIS)) {
      const p = POIS[k];
      ctx.beginPath();
      ctx.arc(tx(p.x), tx(p.z), 5.5, 0, Math.PI * 2);
      ctx.fillStyle = poiColors[p.type] || '#8899aa';
      ctx.fill();
      ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '8px sans-serif'; ctx.fillStyle = '#93a0ad'; ctx.textAlign = 'left';
      ctx.fillText(p.name, tx(p.x) + 9, tx(p.z) + 2);
    }
    // player
    if (pos) {
      const px = tx(pos.x), pz = tx(pos.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#25e0d0'; ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }
  }
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (Math.max(startDeg, endDeg) * Math.PI) / 180;
  const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
