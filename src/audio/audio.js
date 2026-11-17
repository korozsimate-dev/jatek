// ============================================================
// Audio engine — 100% synthesised with the Web Audio API.
// Engine note, turbo whistle, tyre squeal, wind, impacts, city
// ambience, UI clicks and a small generative synthwave soundtrack.
// ============================================================

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> hz

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.started = false;
    this.enabled = true;
    this.engineOn = false;
    this.musicOn = false;
    this.engineKind = 'i4';
    this.lastBurst = 0;
    this._musicTimer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);

    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.connect(this.master);
    this.amb = this.ctx.createGain();
    this.amb.connect(this.master);
    this.uiGain = this.ctx.createGain();
    this.uiGain.connect(this.master);

    this._buildNoise();
    this._buildEngine();
    this._buildSkid();
    this._buildWind();
    this._buildAmbience();
    this.applyVolumes();
    this.started = true;
    this.prevVol = null;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = (this.settings.get('volMaster') ?? 80) / 100;
    this.master.gain.value = m * 0.9;
    this.sfx.gain.value = (this.settings.get('volSfx') ?? 85) / 100;
    this.music.gain.value = (this.settings.get('volMusic') ?? 45) / 100 * 0.5;
    this.amb.gain.value = (this.settings.get('volAmb') ?? 60) / 100 * 0.5;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------------- primitives ----------------
  _buildNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = white * 0.55 + last * 3.2;
    }
    this.noiseBuf = buf;
    const buf2 = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d2 = buf2.getChannelData(0);
    for (let i = 0; i < len; i++) d2[i] = Math.random() * 2 - 1;
    this.whiteBuf = buf2;
  }

  _noiseSource(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  // ---------------- engine ----------------
  _buildEngine() {
    const c = this.ctx;
    this.engineBus = c.createGain();
    this.engineBus.gain.value = 0;
    this.engineBus.connect(this.sfx);

    // harmonic stack
    this.oscs = [];
    const mkOsc = (type, mul, gain) => {
      const o = c.createOscillator();
      o.type = type;
      const g = c.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.engineFilter || this.engineBus);
      this.oscs.push({ o, g, mul });
      return o;
    };
    // filter shaped by load
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 3.2;
    this.engineFilter.connect(this.engineBus);

    this.oscs = [];
    const osc1 = c.createOscillator(); osc1.type = 'sawtooth';
    const g1 = c.createGain(); g1.gain.value = 0.30;
    osc1.connect(g1); g1.connect(this.engineFilter);
    const osc2 = c.createOscillator(); osc2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.14;
    osc2.connect(g2); g2.connect(this.engineFilter);
    const sub = c.createOscillator(); sub.type = 'sine';
    const gs = c.createGain(); gs.gain.value = 0.22;
    sub.connect(gs); gs.connect(this.engineFilter);
    // slightly detuned harmonic for character
    const osc3 = c.createOscillator(); osc3.type = 'sawtooth';
    const g3 = c.createGain(); g3.gain.value = 0.09;
    osc3.connect(g3); g3.connect(this.engineFilter);
    this.engOscs = { osc1, osc2, sub, osc3, g1, g2, gs, g3 };

    // exhaust rasp (filtered noise)
    const ex = this._noiseSource();
    const exf = c.createBiquadFilter();
    exf.type = 'bandpass'; exf.frequency.value = 260; exf.Q.value = 0.8;
    const exg = c.createGain(); exg.gain.value = 0;
    ex.connect(exf); exf.connect(exg); exg.connect(this.engineBus);
    ex.start();
    this.exhaust = { src: ex, filter: exf, gain: exg };

    // turbo whistle
    const tw = c.createOscillator(); tw.type = 'sine'; tw.frequency.value = 2400;
    const twg = c.createGain(); twg.gain.value = 0;
    tw.connect(twg); twg.connect(this.engineBus); tw.start();
    this.turbo = { osc: tw, gain: twg };

    for (const o of [osc1, osc2, sub, osc3]) o.start();
  }

  setEngine(kind) { this.engineKind = kind; }

  startEngine() {
    if (!this.started) return;
    this.engineOn = true;
    this.engineBus.gain.cancelScheduledValues(this.now());
    this.engineBus.gain.setTargetAtTime(0.5, this.now(), 0.2);
  }
  stopEngine() {
    if (!this.started) return;
    this.engineOn = false;
    this.engineBus.gain.setTargetAtTime(0, this.now(), 0.25);
  }

  updateEngine(rpm, load, throttle, speed, slip = 0, nitro = false) {
    if (!this.started || !this.engineOn) return;
    const t = this.now();
    const kinds = {
      i4: { base: 42, harm: 2.0, filt: 1500, gain: 1.0 },
      i6: { base: 34, harm: 2.4, filt: 1750, gain: 0.95 },
      v6: { base: 38, harm: 2.2, filt: 1650, gain: 1.0 },
      v8: { base: 26, harm: 1.7, filt: 1150, gain: 1.08 },
      v8muscle: { base: 22, harm: 1.5, filt: 950, gain: 1.2 },
      v12: { base: 46, harm: 2.9, filt: 2600, gain: 0.95 },
    };
    const k = kinds[this.engineKind] || kinds.i4;
    const rpmNorm = rpm / 8000;
    const f = k.base + rpmNorm * 150 * k.harm;
    const { osc1, osc2, sub, osc3 } = this.engOscs;
    osc1.frequency.setTargetAtTime(f, t, 0.03);
    osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    sub.frequency.setTargetAtTime(f * 0.25, t, 0.05);
    osc3.frequency.setTargetAtTime(f * 1.503, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(k.filt * (0.55 + rpmNorm * 1.5) * (throttle > 0.05 ? 1.25 : 0.7) + nitro * 700, t, 0.05);
    this.engineFilter.Q.setTargetAtTime(2.4 + rpmNorm * 4.5, t, 0.1);

    const g = this.engOscs.g1;
    g.gain.setTargetAtTime(0.26 * k.gain * (0.55 + load * 0.6) * (1 + throttle * 0.25), t, 0.06);
    this.exhaust.filter.frequency.setTargetAtTime(180 + rpmNorm * 520 + slip * 240, t, 0.06);
    this.exhaust.gain.gain.setTargetAtTime(0.05 + load * 0.10 + throttle * 0.07 + slip * 0.12, t, 0.07);
    // turbo spool
    const turboAmt = this.engineKind === 'i4' || this.engineKind === 'v6' ? 1 : 0.35;
    this.turbo.osc.frequency.setTargetAtTime(1500 + rpmNorm * 3800, t, 0.08);
    this.turbo.gain.gain.setTargetAtTime(0.012 * turboAmt * (throttle > 0.2 ? 1 : 0.15) * (0.4 + rpmNorm), t, 0.1);
  }

  // ---------------- tyre / wind ----------------
  _buildSkid() {
    const c = this.ctx;
    const s = this._noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 7;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start();
    this.skid = { src: s, filter: f, gain: g };
  }

  updateSkid(slip, speed) {
    if (!this.started) return;
    const t = this.now();
    const amt = Math.min(1, Math.max(0, (slip - 0.09) * 2.6)) * Math.min(1, speed / 12);
    this.skid.gain.gain.setTargetAtTime(amt * 0.30, t, 0.05);
    this.skid.filter.frequency.setTargetAtTime(1100 + amt * 1100 + speed * 12, t, 0.08);
  }

  _buildWind() {
    const c = this.ctx;
    const s = this._noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 600;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start();
    this.wind = { src: s, filter: f, gain: g };
  }

  updateWind(speed) {
    if (!this.started) return;
    const t = this.now();
    const amt = Math.min(1, speed / 70);
    this.wind.gain.gain.setTargetAtTime(amt * amt * 0.22, t, 0.1);
    this.wind.filter.frequency.setTargetAtTime(400 + amt * 1800, t, 0.1);
  }

  // ---------------- ambience ----------------
  _buildAmbience() {
    const c = this.ctx;
    const s = this._noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.20;
    s.connect(f); f.connect(g); g.connect(this.amb);
    s.start();
    this.cityHum = { src: s, filter: f, gain: g };

    // a slow low drone for the night
    const o = c.createOscillator();
    o.type = 'sine'; o.frequency.value = 55;
    const og = c.createGain(); og.gain.value = 0.0;
    o.connect(og); og.connect(this.amb); o.start();
    this.drone = { osc: o, gain: og };
  }

  updateAmbience(night, speed = 0, indoors = false) {
    if (!this.started) return;
    const t = this.now();
    this.cityHum.gain.gain.setTargetAtTime(indoors ? 0.06 : 0.16 + night * 0.04, t, 0.5);
    this.cityHum.filter.frequency.setTargetAtTime(indoors ? 220 : 300 + night * 120, t, 1.0);
    this.drone.osc.frequency.setTargetAtTime(indoors ? 48 : 55 + night * 8, t, 1.2);
    this.drone.gain.gain.setTargetAtTime(indoors ? 0.05 : night * 0.05, t, 1.0);
  }

  // ---------------- one-shots ----------------
  burst({ freq = 700, q = 1.2, dur = 0.25, gain = 0.3, type = 'bandpass', sweep = 0, noise = true } = {}) {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    const now = t;
    if (now - this.lastBurst < 0.012) return;
    this.lastBurst = now;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfx);
    if (noise) {
      const s = this._noiseSource(false);
      const f = c.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq - sweep), t + dur);
      s.connect(f); f.connect(g);
      s.start(t); s.stop(t + dur + 0.05);
    } else {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq - sweep), t + dur);
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  impact(strength = 1) {
    const g = Math.min(1, strength);
    this.burst({ freq: 160 + g * 220, q: 0.7, dur: 0.28, gain: 0.45 * g, type: 'lowpass', noise: true });
    this.burst({ freq: 90, q: 1, dur: 0.45, gain: 0.35 * g, sweep: 50, noise: false });
  }
  backfire() { this.burst({ freq: 320, q: 0.8, dur: 0.14, gain: 0.24, sweep: 260 }); }
  scrape() { this.burst({ freq: 2600, q: 3, dur: 0.22, gain: 0.14 }); }
  shiftBlip() { this.burst({ freq: 900, q: 4, dur: 0.05, gain: 0.06 }); }
  horn() {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    const g = c.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.setTargetAtTime(0.0001, t + 0.32, 0.05);
    g.connect(this.sfx);
    for (const f of [392, 466]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 1600;
      o.connect(of); of.connect(g); o.start(t); o.stop(t + 0.5);
    }
  }

  // UI
  ui(kind = 'click') {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    const g = c.createGain();
    const o = c.createOscillator();
    o.type = kind === 'confirm' ? 'triangle' : 'square';
    const base = kind === 'confirm' ? 660 : kind === 'error' ? 180 : kind === 'back' ? 340 : 520;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (kind === 'error' ? 0.6 : 1.35), t + 0.08);
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(this.uiGain);
    o.start(t); o.stop(t + 0.14);
  }

  countdownBeep(last = false) {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    const g = c.createGain();
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = last ? 880 : 520;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (last ? 0.5 : 0.18));
    o.connect(g); g.connect(this.uiGain);
    o.start(t); o.stop(t + 0.55);
  }

  cashRegister() {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    [880, 1320].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.3);
      o.connect(g); g.connect(this.uiGain);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.35);
    });
  }

  siren() {
    if (!this.started) return;
    const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = 'triangle';
    const g = c.createGain();
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(660, t + i * 0.5);
      o.frequency.linearRampToValueAtTime(1000, t + i * 0.5 + 0.25);
      o.frequency.linearRampToValueAtTime(660, t + i * 0.5 + 0.5);
    }
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.1);
    g.gain.setValueAtTime(0.05, t + 2.6);
    g.gain.linearRampToValueAtTime(0, t + 3.0);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 3.05);
  }

  // ---------------- music: generative synthwave ----------------
  startMusic() {
    if (!this.started || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.bpm = 96;
    this.beat = 60 / this.bpm / 4; // 16th
    this.nextTime = this.now() + 0.1;
    // Am - F - C - G  (dark, driving)
    this.chords = [
      { root: 45, notes: [57, 60, 64] },
      { root: 41, notes: [53, 57, 60] },
      { root: 48, notes: [55, 60, 64] },
      { root: 43, notes: [55, 59, 62] },
    ];
    this.musicLoop();
  }
  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    this.music.gain.setTargetAtTime(0, this.now(), 0.3);
    setTimeout(() => { if (!this.musicOn) this.music.gain.value = (this.settings.get('volMusic') ?? 45) / 100 * 0.5; }, 900);
  }

  musicLoop() {
    if (!this.musicOn) return;
    const lookahead = 0.2;
    while (this.nextTime < this.now() + lookahead) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.beat;
      this.step++;
    }
    this._musicTimer = setTimeout(() => this.musicLoop(), 60);
  }

  scheduleStep(step, t) {
    const c = this.ctx;
    const bar = Math.floor(step / 16) % 4;
    const chord = this.chords[bar];
    const s16 = step % 16;
    const sub = 0.5;
    // bass on 8ths with syncopation
    if (s16 % 2 === 0) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f = NOTE(chord.root - 12);
      o.frequency.setValueAtTime(f, t);
      if (s16 % 4 === 2) o.frequency.setValueAtTime(f * 1.5, t);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass';
      fl.frequency.setValueAtTime(220, t);
      fl.frequency.exponentialRampToValueAtTime(680, t + 0.06);
      fl.frequency.exponentialRampToValueAtTime(220, t + 0.22);
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o.connect(fl); fl.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.3);
    }
    // pad every bar start
    if (s16 === 0) {
      for (const n of chord.notes) {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.value = NOTE(n);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + 0.6);
        g.gain.linearRampToValueAtTime(0.0001, t + this.beat * 16);
        const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400;
        o.connect(fl); fl.connect(g); g.connect(this.music);
        o.start(t); o.stop(t + this.beat * 16 + 0.1);
      }
    }
    // arpeggio lead on odd 16ths
    if (s16 % 2 === 1 && (step % 32) > 15) {
      const idx = (Math.floor(step / 2) % chord.notes.length);
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = NOTE(chord.notes[idx] + 12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.022, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2600;
      o.connect(fl); fl.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.18);
    }
    // kick + hat
    if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.22);
    }
    if (s16 % 4 === 2) {
      const s = this._noiseSource(false);
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      s.connect(f); f.connect(g); g.connect(this.music);
      s.start(t); s.stop(t + 0.1);
    }
  }

  // mute everything (for menu preview / tab blur)
  setMuted(m) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : (this.settings.get('volMaster') ?? 80) / 100 * 0.9, this.now(), 0.1);
  }
}
