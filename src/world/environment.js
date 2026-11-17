// ============================================================
// Sky dome, sun/moon, fog, weather, day-night cycle
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { RNG } from '../core/util.js';

const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uGround, uSunColor, uSunDir, uMoonDir;
uniform float uNight, uSunSize, uFogAmt;

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  float hz = smoothstep(-0.08, 0.42, h);
  col = mix(uHorizon, uTop, pow(hz, 0.85));
  float below = smoothstep(0.02, -0.30, h);
  col = mix(col, uGround, below);

  // sun disc + glow
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float sunDisc = smoothstep(uSunSize, uSunSize + 0.0018, sd);
  float sunGlow = pow(sd, 26.0) * 0.55 + pow(sd, 4.0) * 0.16;
  col += uSunColor * (sunGlow + sunDisc * 2.2);

  // moon
  float md = max(dot(d, normalize(uMoonDir)), 0.0);
  float moonDisc = smoothstep(0.9994, 0.99965, md);
  col += vec3(0.85, 0.92, 1.0) * moonDisc * 2.4 * uNight;
  col += vec3(0.55, 0.68, 0.9) * pow(md, 60.0) * 0.22 * uNight;

  // stars
  if (uNight > 0.02 && h > 0.0) {
    vec3 sp = floor(d * 320.0);
    float s = hash(sp);
    float star = smoothstep(0.9975, 1.0, s);
    float twinkle = 0.65 + 0.35 * hash(sp + 3.1);
    col += vec3(0.9, 0.95, 1.0) * star * twinkle * uNight * smoothstep(0.0, 0.25, h);
  }

  // city light pollution near the horizon
  col += vec3(0.22, 0.14, 0.20) * uNight * pow(1.0 - abs(h), 8.0) * 0.55;

  gl_FragColor = vec4(col, 1.0);
}`;

export class Environment {
  constructor(scene, renderer, settings) {
    this.scene = scene;
    this.renderer = renderer;
    this.settings = settings;
    this.time = 21.5;            // hours 0..24
    this.dayLength = 480;        // seconds per 24h
    this.weather = 'clear';
    this.wetness = 0;
    this.fogDensity = 0;
    this.targetFog = 0;
    this.rainIntensity = 0;
    this.lightning = 0;
    this.nextWeatherChange = 90;
    this.weatherTimer = 0;
    this.forceTime = null;

    this._buildSky();
    this._buildLights();
    this._buildRain();
    this.update(0, null);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 20);
    this.skyUniforms = {
      uTop: { value: new THREE.Color('#0a1020') },
      uHorizon: { value: new THREE.Color('#3a4658') },
      uGround: { value: new THREE.Color('#0b0c0f') },
      uSunColor: { value: new THREE.Color('#ffd9a0') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.6) },
      uMoonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.4) },
      uNight: { value: 0 },
      uSunSize: { value: 0.9985 },
      uFogAmt: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight('#8fb8e0', '#2a2620', 0.55);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff2d8', 2.4);
    this.sun.castShadow = true;
    // 4096 = 64 MB of shadow map plus a very heavy depth pass every frame.
    // 2048 over this tight frustum looks the same on screen and costs a quarter
    // of the fill; the map is only rebuilt when the light actually moves.
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.blurSamples = 4;
    this.sun.shadow.autoUpdate = true;
    const sc = this.sun.shadow.camera;
    // tighter frustum = much crisper car shadows (they sit right under the camera)
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight('#a8c0e8', 0.0);
    this.moon.castShadow = false;   // shadow budget stays with the sun
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    // subtle ambient bounce tinted by the city glow
    this.ambient = new THREE.AmbientLight('#1a2230', 0.55);
    this.scene.add(this.ambient);

    this.fog = new THREE.FogExp2('#151c26', 0.0016);
    this.scene.fog = this.fog;
  }

  _buildRain() {
    const N = 4200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const r = new RNG(77);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = r.range(-40, 40);
      pos[i * 3 + 1] = r.range(0, 40);
      pos[i * 3 + 2] = r.range(-40, 40);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: '#9fc4e8', size: 0.09, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) this.rainVel[i] = 26 + r.next() * 22;
    this.scene.add(this.rain);
  }

  setWeather(w) {
    this.weather = w;
    this.targetFog = w === 'fog' ? 1 : w === 'rain' ? 0.62 : 0;
  }

  randomWeather() {
    const r = Math.random();
    this.setWeather(r < 0.55 ? 'clear' : r < 0.78 ? 'fog' : 'rain');
    this._weatherAnnounce = this.weather;
  }

  update(dt, camera) {
    if (!this._scratch) {
      this._scratch = {
        sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(),
        dayCol: new THREE.Color('#87b6e8'), duskCol: new THREE.Color('#f2803c'),
        nightCol: new THREE.Color('#070c18'), horizonDay: new THREE.Color('#c3d9ea'),
        horizonDusk: new THREE.Color('#e8a06a'), horizonNight: new THREE.Color('#121c2c'),
        top: new THREE.Color(), horizon: new THREE.Color(), tmp: new THREE.Color(),
        grey: new THREE.Color('#4a5058'), greyTop: new THREE.Color('#2a3038'),
        sunWarm: new THREE.Color('#fff0c8'), sunDusk: new THREE.Color('#ff7a3c'),
        sunCol: new THREE.Color('#ffe9c4'), sunColDusk: new THREE.Color('#ff9150'),
        hemiCool: new THREE.Color('#9ac0e8'), hemiNight: new THREE.Color('#4a5872'),
        groundDay: new THREE.Color('#4a4238'), groundNight: new THREE.Color('#2a2622'),
        ambDay: new THREE.Color('#1c2734'), ambNight: new THREE.Color('#3a3542'),
        camPos: new THREE.Vector3(),
      };
    }
    if (this.forceTime != null) {
      this.time = this.forceTime;
    } else {
      this.time = (this.time + (dt * 24) / this.dayLength) % 24;
    }
    const t = this.time;

    // weather progression
    if (this.settings.get('weather') !== false) {
      this.weatherTimer += dt;
      if (this.weatherTimer > this.nextWeatherChange) {
        this.weatherTimer = 0;
        this.nextWeatherChange = 95 + Math.random() * 120;
        const r = Math.random();
        this.setWeather(r < 0.58 ? 'clear' : r < 0.80 ? 'fog' : 'rain');
        this._weatherAnnounce = this.weather;
      }
    } else if (this.weather !== 'clear') {
      this.setWeather('clear');
    }

    // fog & rain lerp
    this.fogDensity = lerp(this.fogDensity, this.targetFog, 1 - Math.exp(-dt * 0.6));
    this.rainIntensity = lerp(this.rainIntensity, this.weather === 'rain' ? 1 : 0, 1 - Math.exp(-dt * 0.7));
    this.wetness = this.rainIntensity;
    this.rain.visible = this.rainIntensity > 0.02 && this.settings.get('weather') !== false;
    this.rain.material.opacity = 0.55 * this.rainIntensity;

    // sun position: sunrise ~6, noon 13, sunset ~20
    const angle = ((t - 6) / 24) * Math.PI * 2;
    const sunEl = Math.sin(angle - Math.PI * 0.0);
    const sunX = Math.cos(angle) * 0.55;
    const sunY = Math.sin(angle);
    const sunZ = -0.35;
    const sc = this._scratch;
    const sunDir = sc.sunDir.set(sunX, sunY, sunZ).normalize();
    const moonDir = sc.moonDir.set(-sunX, -sunY * 0.9 + 0.12, -sunZ).normalize();

    const dayAmt = clamp(smoothstep((sunY + 0.10) * 2.4), 0, 1);
    const nightAmt = 1 - clamp(smoothstep((sunY + 0.22) * 2.6), 0, 1);
    const duskAmt = clamp(1 - Math.abs(sunY) * 4.2) * (sunY > -0.35 ? 1 : 0);

    // palette (scratch colours: this runs every frame)
    const { dayCol, nightCol, horizonDay, horizonDusk, horizonNight, grey, greyTop } = sc;
    const top = sc.top.copy(nightCol).lerp(dayCol, dayAmt * 0.92);
    if (duskAmt > 0.01) top.lerp(sc.tmp.set('#2a3350'), duskAmt * 0.55);
    const horizon = sc.horizon.copy(horizonNight).lerp(horizonDay, dayAmt);
    if (duskAmt > 0.01) horizon.lerp(horizonDusk, duskAmt * 0.85);
    const weatherMuffle = clamp(this.fogDensity * 0.9 + this.rainIntensity * 0.7);
    top.lerp(greyTop, weatherMuffle);
    horizon.lerp(grey, weatherMuffle);

    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(horizon);
    this.skyUniforms.uGround.value.set('#0a0b0d');
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uMoonDir.value.copy(moonDir);
    this.skyUniforms.uNight.value = nightAmt;
    this.skyUniforms.uSunColor.value.copy(sc.sunWarm).lerp(sc.sunDusk, duskAmt * 0.9);
    this.skyUniforms.uFogAmt.value = weatherMuffle;

    // directional light
    const sunStrength = clamp(sunY * 3.2, 0, 1) * (1 - weatherMuffle * 0.65);
    this.sun.intensity = sunStrength * 2.9;
    this.sun.color.copy(sc.sunCol).lerp(sc.sunColDusk, duskAmt * 0.75);
    this.sun.visible = sunStrength > 0.01;
    // the moon is the key light at night — without it everything is a silhouette
    this.moon.intensity = nightAmt * 1.05;
    this.moon.visible = nightAmt > 0.02;
    const camPos = camera ? camera.position : sc.camPos.set(0, 0, 0);
    this.sun.position.set(camPos.x + sunDir.x * 240, sunDir.y * 240, camPos.z + sunDir.z * 240);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
    // The shadow map only has to be rebuilt when the sun or the camera moved a
    // meaningful distance, not every single frame.
    const moved = this._shadowRef
      ? Math.abs(camPos.x - this._shadowRef.x) + Math.abs(camPos.z - this._shadowRef.z)
        + Math.abs(this.sun.position.y - this._shadowRef.y)
      : 1e9;
    if (moved > 2.5) {
      this.renderer && (this.renderer.shadowMap.needsUpdate = true);
      this._shadowRef = { x: camPos.x, y: this.sun.position.y, z: camPos.z };
    }
    this.moon.position.set(camPos.x + moonDir.x * 200, Math.abs(moonDir.y) * 200 + 40, camPos.z + moonDir.z * 200);
    this.moon.target = this.sun.target;

    // Night must stay *playable*: a sodium/orange sky bounce plus a cool fill
    // keeps shapes readable even far from a street lamp.
    this.hemi.intensity = 0.34 + dayAmt * 0.52;
    this.hemi.color.copy(sc.hemiCool).lerp(sc.hemiNight, nightAmt);
    this.hemi.groundColor.copy(sc.groundDay).lerp(sc.groundNight, nightAmt);
    this.ambient.intensity = 0.34 + nightAmt * 0.52;
    this.ambient.color.copy(sc.ambDay).lerp(sc.ambNight, nightAmt);

    // fog
    const quality = this.settings.get('quality');
    const base = quality === 'low' ? 0.0026 : quality === 'medium' ? 0.0019 : 0.00135;
    const dist = this.settings.get('fogdist');
    const distMul = dist === 0 ? 1.6 : dist === 1 ? 1.15 : 0.95;
    this.fog.density = base * distMul * (1 + this.fogDensity * 2.4 + this.rainIntensity * 0.35);
    const fogCol = new THREE.Color().copy(horizon).lerp(new THREE.Color('#10151c'), 0.35);
    this.fog.color.copy(fogCol);

    // rain particles follow the camera
    if (this.rain.visible && camera) {
      const arr = this.rain.geometry.attributes.position.array;
      const cy = camera.position.y;
      for (let i = 0; i < this.rainVel.length; i++) {
        arr[i * 3 + 1] -= this.rainVel[i] * dt;
        if (arr[i * 3 + 1] < cy - 20) {
          arr[i * 3 + 1] = cy + 38;
          arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 78;
          arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 78;
        }
      }
      // keep the field centred horizontally as the player moves
      this.rain.position.x = camera.position.x;
      this.rain.position.z = camera.position.z;
      this.rain.position.y = 0;
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // lightning during rain
    if (this.rainIntensity > 0.6 && Math.random() < dt * 0.06) this.lightning = 1;
    if (this.lightning > 0) {
      this.lightning -= dt * 3.4;
      const f = Math.max(0, this.lightning);
      this.hemi.intensity += f * 1.6;
      this.ambient.intensity += f * 0.9;
    }

    this.nightAmount = nightAmt;
    this.dayAmount = dayAmt;
    this.duskAmount = duskAmt;
    return { nightAmt, dayAmt, duskAmt };
  }

  // Rain darkens and glosses the tarmac. Called from the game loop with the
  // current wetness so the whole city responds to the weather.
  applyWetness(roadMaterial) {
    if (!roadMaterial) return;
    const w = clamp(this.rainIntensity * 0.85 + this.fogDensity * 0.25, 0, 1);
    if (Math.abs((this._wetApplied ?? -1) - w) < 0.02) return;
    this._wetApplied = w;
    roadMaterial.roughness = 0.92 - w * 0.52;
    roadMaterial.metalness = 0.03 + w * 0.30;
    roadMaterial.color.setRGB(0.56 - w * 0.20, 0.58 - w * 0.20, 0.60 - w * 0.19);
    roadMaterial.needsUpdate = false;
  }

  isNight() { return this.nightAmount > 0.55; }

  clockString() {
    const h = Math.floor(this.time) % 24;
    const m = Math.floor((this.time % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setTimeOfDay(mode) {
    if (mode === 'live') { this.forceTime = null; return; }
    if (mode === 'day') this.forceTime = 13;
    if (mode === 'dusk') this.forceTime = 19.4;
    if (mode === 'night') this.forceTime = 23;
    this.time = this.forceTime;
  }
}
