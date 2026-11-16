// ============================================================
// Procedural canvas textures — no external image assets needed.
// ============================================================
import * as THREE from 'three';
import { RNG } from '../core/util.js';

const cache = new Map();
function mk(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 4;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
  cache.set(key, t);
  return t;
}

function noise(g, w, h, amount, alpha = 0.06, seed = 7) {
  const r = new RNG(seed);
  for (let i = 0; i < amount; i++) {
    const x = r.range(0, w), y = r.range(0, h);
    const s = r.range(1, 3);
    g.fillStyle = `rgba(${r.chance(0.5) ? 255 : 0},${r.chance(0.5) ? 255 : 0},${r.chance(0.5) ? 255 : 0},${alpha})`;
    g.fillRect(x, y, s, s);
  }
}

export function asphaltTexture() {
  return mk('asphalt', 256, 256, (g, w, h) => {
    g.fillStyle = '#2a2c30';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 0.05, 12);
    // tar seams
    g.strokeStyle = 'rgba(10,10,12,.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (i / 4) * h + 10);
      g.lineTo(w, (i / 4) * h + 10 + (i % 2 ? 6 : -5));
      g.stroke();
    }
    // patches
    g.fillStyle = 'rgba(20,22,25,.55)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 12 + Math.random() * 26, 8 + Math.random() * 16, Math.random() * 3, 0, 7);
      g.fill();
    }
  }, { repeat: [1, 1] });
}

export function roadMarkingTexture() {
  return mk('roadmark', 128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // dashed centre line
    g.fillStyle = 'rgba(228,206,120,.92)';
    g.fillRect(w / 2 - 3, 0, 6, h * 0.46);
    g.fillRect(w / 2 - 3, h * 0.62, 6, h * 0.38);
    // side lines
    g.fillStyle = 'rgba(232,232,232,.55)';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}

export function sidewalkTexture() {
  return mk('sidewalk', 256, 256, (g, w, h) => {
    g.fillStyle = '#66686a';
    g.fillRect(0, 0, w, h);
    const cell = 64;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const v = 0.86 + Math.random() * 0.22;
        g.fillStyle = `rgb(${Math.round(102 * v)},${Math.round(104 * v)},${Math.round(106 * v)})`;
        g.fillRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
        // cracks
        if (Math.random() < 0.18) {
          g.strokeStyle = 'rgba(40,42,44,.55)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + 8, y + 10 + Math.random() * 30);
          g.lineTo(x + 20 + Math.random() * 30, y + 30 + Math.random() * 20);
          g.stroke();
        }
      }
    }
    noise(g, w, h, 4000, 0.05, 33);
  });
}

export function concreteTexture() {
  return mk('concrete', 256, 256, (g, w, h) => {
    g.fillStyle = '#4e5256';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 0.06, 5);
    g.strokeStyle = 'rgba(30,32,35,.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(0, i * 85 + 20); g.lineTo(w, i * 85 + 22); g.stroke();
    }
  });
}

export function dirtTexture() {
  return mk('dirt', 256, 256, (g, w, h) => {
    g.fillStyle = '#4a4436';
    g.fillRect(0, 0, w, h);
    const r = new RNG(91);
    for (let i = 0; i < 2200; i++) {
      const v = 0.7 + r.next() * 0.6;
      g.fillStyle = `rgba(${Math.round(90 * v)},${Math.round(82 * v)},${Math.round(64 * v)},.8)`;
      const s = r.range(2, 9);
      g.fillRect(r.range(0, w), r.range(0, h), s, s * 0.7);
    }
    noise(g, w, h, 5000, 0.07, 42);
  });
}

export function grassTexture() {
  return mk('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#38442c';
    g.fillRect(0, 0, w, h);
    const r = new RNG(17);
    for (let i = 0; i < 3600; i++) {
      const v = 0.6 + r.next() * 0.8;
      g.strokeStyle = `rgba(${Math.round(70 * v)},${Math.round(92 * v)},${Math.round(50 * v)},.75)`;
      g.lineWidth = 1;
      const x = r.range(0, w), y = r.range(0, h);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-2, 2), y - r.range(2, 6)); g.stroke();
    }
  });
}

// facade generator: returns { map, emissive } textures
export function facadeTextures(kind, seed = 1) {
  const keyBase = `facade_${kind}_${seed}`;
  if (cache.has(keyBase)) return cache.get(keyBase);
  const W = 256, H = 512;
  const colors = {
    glass: { base: '#19222b', frame: '#2b3844', win: '#7fa6c4', lit: '#ffe6b0' },
    office: { base: '#3a3a3c', frame: '#4a4b4e', win: '#5c707d', lit: '#ffdfa0' },
    brick: { base: '#5b3a30', frame: '#6d473a', win: '#3d4a52', lit: '#ffcf86' },
    stucco: { base: '#8a8175', frame: '#9c9386', win: '#465158', lit: '#ffd89b' },
    warehouse: { base: '#5d5b55', frame: '#6b6a63', win: '#3c454b', lit: '#ffd9a0' },
    neon: { base: '#2a2030', frame: '#39293f', win: '#6a5a86', lit: '#ffb3f0' },
  }[kind] || { base: '#3a3a3c', frame: '#4a4b4e', win: '#5c707d', lit: '#ffdfa0' };

  const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
  const cvE = document.createElement('canvas'); cvE.width = W; cvE.height = H;
  const a = cvA.getContext('2d'), e = cvE.getContext('2d');
  const r = new RNG(seed * 37 + 5);
  a.fillStyle = colors.base; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  noise(a, W, H, 6000, 0.05, seed);

  const cols = kind === 'glass' ? 6 : kind === 'brick' ? 5 : 4;
  const rows = 10;
  const cw = W / cols, ch = H / rows;
  const padX = cw * (kind === 'glass' ? 0.10 : 0.24);
  const padY = ch * 0.22;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * cw + padX, y = ry * ch + padY;
      const w = cw - padX * 2, h = ch - padY * 1.5;
      // glass reflection tint
      a.fillStyle = colors.win;
      a.globalAlpha = 0.75;
      a.fillRect(x, y, w, h);
      a.globalAlpha = 1;
      a.fillStyle = colors.frame;
      a.fillRect(x - 2, y - 2, w + 4, 2);
      a.fillRect(x - 2, y + h, w + 4, 2);
      // lit windows on the emissive map
      const lit = r.chance(kind === 'glass' ? 0.42 : 0.3);
      if (lit) {
        const warm = r.chance(0.72);
        e.fillStyle = warm ? colors.lit : '#a8d8ff';
        e.globalAlpha = 0.55 + r.next() * 0.45;
        e.fillRect(x, y, w, h);
        e.globalAlpha = 1;
      }
    }
  }
  // ground floor storefronts
  a.fillStyle = 'rgba(0,0,0,.35)';
  a.fillRect(0, H - ch * 1.05, W, ch * 1.05);
  e.fillStyle = colors.lit; e.globalAlpha = 0.5;
  e.fillRect(6, H - ch * 0.9, W - 12, ch * 0.5);
  e.globalAlpha = 1;

  const map = new THREE.CanvasTexture(cvA);
  const em = new THREE.CanvasTexture(cvE);
  for (const t of [map, em]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  const out = { map, emissive: em };
  cache.set(keyBase, out);
  return out;
}

export function containerTexture(hue) {
  const key = 'container_' + hue;
  return mk(key, 256, 256, (g, w, h) => {
    g.fillStyle = hue; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h);
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 8; x < w; x += 16) g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, h * 0.42, w, 4);
    noise(g, w, h, 2000, 0.06, 8);
  });
}

export function neonSignTexture(text, color, bg = '#0a0a0f') {
  const key = 'neon_' + text + color + bg;
  return mk(key, 512, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.font = 'bold 78px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 12;
    g.fillStyle = '#fff';
    g.globalAlpha = 0.85;
    g.fillText(text, w / 2, h / 2 + 4);
    g.globalAlpha = 1;
  });
}

export function windowNeonTexture() {
  return mk('winneon', 256, 256, (g, w, h) => {
    g.fillStyle = '#0c0d12'; g.fillRect(0, 0, w, h);
    const r = new RNG(3);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 6; x++) {
        if (r.chance(0.55)) {
          const cols = ['#25e0d0', '#ff2f92', '#ffb300', '#a56bff', '#4ad2ff'];
          g.fillStyle = cols[Math.floor(r.next() * cols.length)];
          g.globalAlpha = 0.5 + r.next() * 0.5;
          g.fillRect(x * 42 + 4, y * 32 + 4, 34, 22);
        }
      }
    }
    g.globalAlpha = 1;
  });
}

export function crosswalkTexture() {
  return mk('crosswalk', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(236,236,236,.85)';
    for (let i = 0; i < 6; i++) g.fillRect(0, i * 22 + 4, w, 11);
  });
}

export function waterNormalTexture() {
  return mk('waternrm', 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const r = new RNG(21);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      const v = Math.sin(x * 0.09) * Math.cos(y * 0.11) + Math.sin((x + y) * 0.05);
      const n = (v + 2) / 4;
      img.data[i * 4] = 128 + Math.sin(x * 0.08) * 26;
      img.data[i * 4 + 1] = 128 + Math.cos(y * 0.09) * 26;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}

export function palmLeafTexture() {
  return mk('palm', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#2f4a2a';
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.moveTo(w * 0.1, h * 0.5);
      g.quadraticCurveTo(w * 0.5, h * (0.5 + Math.sin(i) * 0.28), w * 0.96, h * (0.5 + Math.cos(i * 1.7) * 0.42));
      g.stroke();
    }
  });
}

export function skyGradientTexture() {
  return mk('skygrad', 64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#05070d');
    grd.addColorStop(0.45, '#0d1a2b');
    grd.addColorStop(0.62, '#25384c');
    grd.addColorStop(0.75, '#4a4a52');
    grd.addColorStop(1, '#12161c');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function clearCache() {
  for (const v of cache.values()) {
    if (v instanceof THREE.Texture) v.dispose();
    else if (v.map) { v.map.dispose(); v.emissive.dispose(); }
  }
  cache.clear();
}
