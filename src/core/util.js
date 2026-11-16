// small math + helper utilities

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const approach = (cur, target, rate, dt) => {
  const d = target - cur;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
};
export const rad = (deg) => (deg * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const angleDiff = (a, b) => wrapAngle(a - b);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1337) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a, b) { return a + this.f() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length) % arr.length]; }
  chance(p) { return this.f() < p; }
}

export function formatMoney(n) {
  const negative = n < 0;
  n = Math.abs(Math.round(n));
  const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-$' : '$') + s;
}

export function formatTime(sec, showMs = true) {
  if (sec == null || !isFinite(sec)) return '--:--';
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(m)}:${pad(s)}${showMs ? '.' + pad(cs) : ''}`;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
export function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

// grid spatial hash for static colliders
export class SpatialGrid {
  constructor(cell = 40) {
    this.cell = cell;
    this.map = new Map();
  }
  key(x, z) { return ((x / this.cell) | 0) + ',' + ((z / this.cell) | 0); }
  insert(collider) {
    const c = collider;
    const x0 = Math.floor(c.minX / this.cell), x1 = Math.floor(c.maxX / this.cell);
    const z0 = Math.floor(c.minZ / this.cell), z1 = Math.floor(c.maxZ / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x + ',' + z;
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(c);
      }
    }
    c.gridCells = [];
  }
  query(x, z, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    const seen = new Set();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.map.get(cx + ',' + cz);
        if (arr) for (const c of arr) { if (!c.disabled && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
      }
    }
    return out;
  }
}

// circle vs axis-aligned box resolution, returns penetration info
export function circleBox(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  let dx = x - cx, dz = z - cz;
  let d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  let d = Math.sqrt(d2);
  if (d < 1e-5) {
    // centre inside box — push out along shallowest axis
    const left = x - box.minX, right = box.maxX - x;
    const front = z - box.minZ, back = box.maxZ - z;
    const m = Math.min(left, right, front, back);
    if (m === left) return { nx: -1, nz: 0, depth: left + r };
    if (m === right) return { nx: 1, nz: 0, depth: right + r };
    if (m === front) return { nx: 0, nz: -1, depth: front + r };
    return { nx: 0, nz: 1, depth: back + r };
  }
  return { nx: dx / d, nz: dz / d, depth: r - d };
}
