// persistent settings (localStorage) + game save data

const SETTINGS_KEY = 'street_empire_settings_v1';

export const DEFAULT_SETTINGS = {
  quality: 'high',
  shadows: 'high',
  bloom: true,
  weather: true,
  fov: 70,
  fogdist: 2,
  volMaster: 80,
  volSfx: 85,
  volMusic: 45,
  volAmb: 60,
  transmission: 'auto',
  camDist: 6.6,
  sensitivity: 1.0,
  timeMode: 'live',
  invertY: false,
  assists: true,
};

export class Settings {
  constructor() {
    this.data = { ...DEFAULT_SETTINGS };
    this.listeners = [];
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return this.data;
  }
  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch (e) {}
  }
  set(key, value) {
    this.data[key] = value;
    this.save();
    for (const l of this.listeners) l(key, value);
  }
  onChange(fn) { this.listeners.push(fn); }
  get(key) { return this.data[key]; }
  clear() {
    try { localStorage.removeItem(SETTINGS_KEY); } catch (e) {}
    this.data = { ...DEFAULT_SETTINGS };
    for (const l of this.listeners) l('*', null);
  }
}
