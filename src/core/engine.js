// ============================================================
// Renderer, scene, post-processing, resize & quality management
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from '../config.js';

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.42 },
    uWarm: { value: 0.02 },
    uNight: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette, uWarm, uNight;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // contrast around mid grey
      c = (c - 0.5) * uContrast + 0.5;
      // saturation
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, uSat);
      // warm/cool split toning
      c += vec3(uWarm, uWarm*0.4, -uWarm*0.5);
      c.b *= 1.0 + uNight * 0.06;
      c.r *= 1.0 - uNight * 0.03;
      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d,d) * uVignette * 2.2;
      c *= clamp(v, 0.0, 1.0);
      // subtle film grain
      float g = fract(sin(dot(vUv * 1000.0 + uNight, vec2(12.9898, 78.233))) * 43758.5453);
      c += (g - 0.5) * 0.012;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class Engine {
  constructor(canvas, settings) {
    this.settings = settings;
    this.canvas = canvas;
    this.quality = settings.get('quality') || 'high';

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance',
      stencil: false, alpha: false,
    });
    this.renderer.setClearColor('#0a0d12', 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // A 4K screen at pixelRatio 2 renders 8x the pixels of 1080p and that alone
    // halves the frame rate. Cap the drawing buffer instead of the ratio.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[this.quality].pixelRatio, this._ratioCap()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.25, 1500);
    this.camera.position.set(0, 8, 20);

    this._setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.adaptFrames = 0;
    this.adaptTime = 0;
    this.lowFpsStreak = 0;
    this.autoAdapt = true;
    this.dynamicRes = true;      // lower the resolution when the frame budget slips
    this.resScale = 1;
    this.smoothFrameMs = 16.7;
  }

  // keep the drawing buffer inside a sane pixel budget
  _ratioCap() {
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    const budget = QUALITY[this.quality]?.pixels ?? 2.3e6;
    const byArea = Math.sqrt(budget / Math.max(1, w * h));
    return clampNum(byArea, 0.6, 2.0);
  }

  // Called every frame with the measured frame time. If we are consistently
  // too slow, drop the render scale (post-processing included) in small steps;
  // if there is headroom, creep back up. This is what stops the game from
  // stuttering on a mid-range GPU.
  adapt(frameMs) {
    this.smoothFrameMs += (frameMs - this.smoothFrameMs) * 0.06;
    if (!this.dynamicRes) return;
    this.adaptTime += frameMs / 1000;
    if (this.adaptTime < 0.75) return;
    this.adaptTime = 0;
    const ms = this.smoothFrameMs;
    let next = this.resScale;
    if (ms > 24 && this.resScale > 0.62) next = Math.max(0.62, this.resScale - 0.10);
    else if (ms < 15 && this.resScale < 1) next = Math.min(1, this.resScale + 0.06);
    if (next !== this.resScale) {
      this.resScale = next;
      this.applyResolution();
    }
  }

  applyResolution() {
    const conf = QUALITY[this.quality];
    const base = Math.min(window.devicePixelRatio, conf.pixelRatio, this._ratioCap());
    this.renderer.setPixelRatio(Math.max(0.6, base * this.resScale));
    this.resize();
    // bloom at full resolution is the single most expensive pass
    if (this.bloom) {
      const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.bloom.resolution.set(db.x, db.y);
      this.bloom.strength = this.resScale < 0.9 ? 0.45 : 0.55;
    }
  }

  _setupComposer() {
    const q = QUALITY[this.quality];
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.72, 0.82);
    this.bloom.enabled = !!q.bloom && this.settings.get('bloom') !== false;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    // size post-processing from the drawing buffer, not the CSS size, so a
    // reduced render scale really does cut the pixel cost
    if (this.bloom || this.grade) {
      const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      if (this.bloom) this.bloom.resolution.set(db.x, db.y);
    }
  }

  setQuality(q) {
    this.quality = q;
    const conf = QUALITY[q];
    this.resScale = 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, conf.pixelRatio, this._ratioCap()));
    this.renderer.shadowMap.enabled = conf.shadows && this.settings.get('shadows') !== 'off';
    this.bloom.enabled = conf.bloom && this.settings.get('bloom') !== false;
    this.resize();
  }

  applyShadows(mode) {
    const conf = QUALITY[this.quality];
    this.renderer.shadowMap.enabled = mode !== 'off' && conf.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(env, dt) {
    if (this.grade) {
      this.grade.uniforms.uNight.value = env ? env.nightAmount || 0 : 0;
      this.grade.uniforms.uWarm.value = env ? 0.02 + (env.duskAmount || 0) * 0.05 : 0.02;
      this.grade.uniforms.uVignette.value = env && env.rainIntensity > 0.3 ? 0.55 : 0.42;
    }
    this.composer.render(dt);
  }
}
