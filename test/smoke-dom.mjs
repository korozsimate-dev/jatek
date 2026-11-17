// Boot the real app entry point against a minimal DOM to catch runtime errors
// that only show up when index.html, main.js and every screen are wired together.
import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

function makeEl(id) {
  const classes = new Set();
  const el = {
    id, tagName: 'DIV', children: [], dataset: {}, style: {}, textContent: '', innerHTML: '',
    width: 1280, height: 720,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (f ? classes.add(c) : classes.delete(c))),
    },
    _classes: classes,
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    remove() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }),
    getContext: (t) => (t && t.startsWith('webgl') ? glStub() : ctx2d()),
    focus() {}, blur() {}, click() {},
    scrollTop: 0, scrollHeight: 100, clientHeight: 100, offsetWidth: 100, offsetHeight: 100,
  };
  return el;
}
// Minimal WebGL2 context: enough for three.js to initialise.
function glStub() {
  const consts = {};
  let n = 1;
  const names = [
    'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER',
    'STATIC_DRAW', 'DYNAMIC_DRAW', 'TEXTURE_2D', 'TEXTURE_CUBE_MAP', 'RGBA', 'UNSIGNED_BYTE', 'FLOAT',
    'DEPTH_TEST', 'CULL_FACE', 'BLEND', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE', 'ZERO', 'LEQUAL',
    'FRAMEBUFFER', 'COLOR_ATTACHMENT0', 'DEPTH_ATTACHMENT', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER',
    'LINEAR', 'LINEAR_MIPMAP_LINEAR', 'CLAMP_TO_EDGE', 'REPEAT', 'UNPACK_FLIP_Y_WEBGL',
    'MAX_TEXTURE_SIZE', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_SAMPLES',
    'TRIANGLES', 'LINES', 'POINTS', 'BACK', 'FRONT', 'FRONT_AND_BACK', 'LESS', 'ALWAYS',
  ];
  for (const k of names) consts[k] = n++;
  const gl = {
    ...consts,
    VERSION: 0x1F02,
    SHADING_LANGUAGE_VERSION: 0x8B8C,
    VENDOR: 0x1F00,
    RENDERER: 0x1F01,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D,
    canvas: { width: 1280, height: 720 },
    drawingBufferWidth: 1280, drawingBufferHeight: 720,
    getExtension: () => null,
    getParameter: (p) => {
      if (p === consts.MAX_TEXTURE_SIZE) return 4096;
      if (p === 0x1F02) return 'WebGL 2.0';           // VERSION
      if (p === 0x8B4D) return 32;
      if (p === 0x8B8C) return 'WebGL GLSL ES 3.00';  // SHADING_LANGUAGE_VERSION
      if (p === 0x1F00 || p === 0x1F01) return 'arena-stub'; // VENDOR / RENDERER
      if (p === 0x0D33 || p === 0x851C) return 16384;
      return 16;
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getContextAttributes: () => ({ alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false }),
    getSupportedExtensions: () => [],
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    createProgram: () => ({}), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    getAttribLocation: () => 0, getUniformLocation: () => ({}),
    useProgram() {}, deleteShader() {}, deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {},
    createTexture: () => ({}), bindTexture() {}, texImage2D() {}, texParameteri() {}, texParameterf() {},
    texStorage2D() {}, texSubImage2D() {}, generateMipmap() {}, activeTexture() {}, deleteTexture() {},
    pixelStorei() {}, createFramebuffer: () => ({}), bindFramebuffer() {}, framebufferTexture2D() {},
    checkFramebufferStatus: () => consts.FRAMEBUFFER || 1, deleteFramebuffer() {},
    createRenderbuffer: () => ({}), bindRenderbuffer() {}, renderbufferStorage() {},
    renderbufferStorageMultisample() {}, framebufferRenderbuffer() {}, deleteRenderbuffer() {},
    blitFramebuffer() {}, readPixels() {}, drawBuffers() {}, readBuffer() {},
    createVertexArray: () => ({}), bindVertexArray() {}, deleteVertexArray() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, vertexAttribDivisor() {},
    enable() {}, disable() {}, depthFunc() {}, depthMask() {}, colorMask() {},
    blendFunc() {}, blendFuncSeparate() {}, blendEquation() {}, blendEquationSeparate() {},
    cullFace() {}, frontFace() {}, viewport() {}, scissor() {}, clear() {}, clearColor() {}, clearDepth() {},
    clearStencil() {}, drawArrays() {}, drawElements() {}, drawArraysInstanced() {}, drawElementsInstanced() {},
    uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
    uniform1iv() {}, uniform1fv() {}, uniform2fv() {}, uniform3fv() {}, uniform4fv() {},
    uniformMatrix3fv() {}, uniformMatrix4fv() {},
    isContextLost: () => false, getError: () => 0,
    lineWidth() {}, polygonOffset() {}, getShaderSource: () => '',
  };
  return new Proxy(gl, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return (target[prop] = n++);
      return (target[prop] = () => undefined);
    },
  });
}

function ctx2d() {
  const c = {
    canvas: { width: 256, height: 256 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 10 }),
  };
  for (const m of ['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate',
    'rotate', 'scale', 'drawImage', 'fillText', 'strokeText', 'putImageData', 'setTransform', 'clip',
    'setLineDash', 'createConicGradient']) c[m] = () => {};
  return c;
}

import { register } from 'node:module';
register('./css-loader.mjs', import.meta.url);

const registry = new Map();
const documentStub = {
  readyState: 'complete',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  createTextNode: (t) => ({ textContent: t }),
  getElementById: (id) => { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); },
  querySelector: (sel) => makeEl(sel),
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  exitPointerLock() {}, pointerLockElement: null,
  fonts: { ready: Promise.resolve() },
};
global.document = documentStub;
global.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  localStorage: {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); },
  },
  location: { href: 'http://localhost:5173/', search: '', hostname: 'localhost' },
  performance: globalThis.performance,
  document: documentStub,
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
global.localStorage = global.window.localStorage;
global.requestAnimationFrame = global.window.requestAnimationFrame;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0, hardwareConcurrency: 4 }, configurable: true });

let failed = null;
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.join(' ')); origError(...a); };
try {
  await import('../src/main.js');
  // give the boot sequence time to finish (world build + menu fade-in)
  const bootGame = global.window.__GAME__;
  if (bootGame) {
    try { await bootGame.boot(() => {}); } catch (e) { console.log('  boot error:', e.message); }
  }
  for (let i = 0; i < 20 && bootGame && bootGame.state === 'boot'; i++) await new Promise((r) => setTimeout(r, 50));
} catch (e) {
  failed = e;
}
console.error = origError;

const game = global.window.__GAME__;
let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };
check(!failed, `app module boots without throwing${failed ? ': ' + failed.message : ''}`);
check(!!game, 'window.__GAME__ exposed');
if (game) {
  game.showMenu();
  check(game.state === 'menu', `main menu is reachable (state=${game.state})`);
  check(ids.every((id) => registry.has(id) || game.hud.el), 'screen elements resolved');
  // no GPU in Node: stub the composite/render path (pixels are checked by
  // test/preview.mjs instead)
  game.engine.render = () => {};
  await game.startNewGame();
  check(game.progression.cars.length >= 1, `new game gives a car (${game.progression.cars.length})`);
  for (let i = 0; i < 120; i++) game.frame(1 / 60);
  check(game.frameCount > 100, `frames advance in the world (${game.frameCount})`);
  check(isFinite(game.player.x) && isFinite(game.player.z), 'player position finite');
  game.pause(); game.resume();
  game.showMenu();
  check(game.state === 'menu', 'can return to the menu');
}
console.log(`\nSMOKE: ${ok} passed, ${bad} failed`);
if (bad) process.exitCode = 1;
