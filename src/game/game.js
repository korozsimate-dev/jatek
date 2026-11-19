// ============================================================
// Game orchestrator: boot, loop, world/vehicle management, mode
// switching (menu / explore / garage / race), save & load.
// ============================================================
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from '../core/input.js';
import { Settings } from '../core/settings.js';
import { CONFIG, QUALITY } from '../config.js';
import { clamp, damp, formatMoney, formatTime, lerp, ordinal, RNG } from '../core/util.js';
import { CAR_BY_ID, computeStats, defaultMods, rankFor } from '../data/cars.js';
import { City } from '../world/city.js';
import { MATS } from '../world/buildings.js';
import { Environment } from '../world/environment.js';
import { makeEnv, CarVisual, buildBatchedCarVisual } from '../world/carMesh.js';
import { Vehicle } from '../physics/vehicle.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { Progression } from './progression.js';
import { PoliceSystem } from './police.js';
import { RaceDirector } from './race.js';
import { Effects } from './effects.js';
import { AudioEngine } from '../audio/audio.js';
import { Hud } from '../ui/hud.js';
import { Screens } from '../ui/screens.js';
import { EVENTS, EVENT_BY_ID, POIS, spawnPoint, districtOf, LOTS } from '../world/layout.js';

function makeHeadlessEngine(canvas, settings) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.25, 1500);
  return {
    headless: true, scene, camera,
    renderer: {
      shadowMap: { enabled: false }, setPixelRatio() {}, setSize() {}, setClearColor() {},
      toneMapping: 0, toneMappingExposure: 1, outputColorSpace: '', domElement: canvas,
    },
    bloom: { enabled: true, resolution: { set() {} } },
    setQuality() {}, applyShadows() {}, resize() {}, render() {},
  };
}

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.headless = !!opts.headless;
    this.settings = new Settings();
    this.qualityName = this.settings.get('quality') || 'high';
    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.get('sensitivity');
    this.engine = this.headless ? makeHeadlessEngine(canvas, this.settings) : new Engine(canvas, this.settings);
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;
    this.renderer = this.engine.renderer;
    this.audio = new AudioEngine(this.settings);
    this.progression = new Progression();
    this.hud = new Hud(this);
    this.screens = new Screens(this);

    this.state = 'boot';           // boot | menu | explore | garage | tune | dealer | race
    this.worldActive = false;
    this.paused = false;
    this.time = 0;
    this.playerVehicle = null;
    this.playerInCar = false;
    this.vehicles = [];
    this.parkedCars = [];
    this.previewCar = null;
    this.lookPreview = null;
    this.lookPreviewAngle = 0;
    this.lookPreviewSpin = 0;
    this.previewMode = null;
    this.previewSpin = 0;
    this.previewZoom = 1;
    this.previewDrag = null;
    this.nearbyInteract = null;
    this.lastDistrict = '';
    this.fpsSamples = [];
    this.clock = new THREE.Clock();
    this._acc = 0;
    this.damageCooldown = 0;
    this.raceReturnPos = null;
    this.currentEvent = null;
    this.deliveryTarget = null;
    this.frameCount = 0;
    this.running = false;
  }

  // ================= boot =================
  async boot(progress) {
    const step = async (pct, text) => {
      progress(pct, text);
      await new Promise((r) => setTimeout(r, 10));
    };
    await step(6, 'BUILDING SAN VELOR...');
    this.env = new Environment(this.scene, this.renderer, this.settings);
    await step(18, 'PAVING STREETS...');
    this.city = new City(this.scene, this.settings);
    this.city._events = EVENTS;
    this.city.build();
    await step(46, 'RAISING TOWERS...');
    if (!this.headless) {
      // paint reflections: if the GPU can't build the environment map we carry
      // on without it rather than failing the whole boot
      try {
        this.envMap = makeEnv(this.renderer, this.scene);
        this.scene.environment = this.envMap;
        this.scene.environmentIntensity = 0.55;
      } catch (err) {
        console.warn('environment map unavailable, continuing without reflections', err);
        this.envMap = null;
      }
    }
    await step(58, 'POLISHING CHROME...');
    this.player = new Player(this.scene, this.progression.data ? this.progression.look : undefined);
    this.player.place(-300, 190, Player.fromVehicleHeading(Math.PI));
    this.cameraRig = new CameraRig(this.camera, this.input, this.settings);
    this.cameraRig.colliderQuery = (x, z, r) => {
      const near = this.city.colliders.query(x, z, r);
      for (const c of near) if (c.height > 2.2 && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
      return false;
    };
    await step(68, 'HIRING RIVALS...');
    this.effects = new Effects(this.scene, this.qualityName);
    this.traffic = new TrafficSystem(this.scene, this.settings, this.qualityName);
    this.peds = new PedestrianSystem(this.scene, this.settings, this.qualityName);
    this.police = new PoliceSystem(this);
    this.race = new RaceDirector(this);
    await step(82, 'WARMING TYRES...');
    this.spawnParkedCars();
    this.traffic.populate({ x: -300, z: 190 });
    this.peds.populate({ x: -300, z: 190 });
    await step(94, 'TUNING THE MIX...');
    this.applyAllSettings();
    this.running = true;
    progress(100, 'READY');
  }

  // ================= settings =================
  applyAllSettings() {
    const s = this.settings;
    this.applySetting('quality', s.get('quality'));
    this.applySetting('shadows', s.get('shadows'));
    this.applySetting('bloom', s.get('bloom'));
    this.applySetting('fov', s.get('fov'));
    this.applySetting('timeMode', s.get('timeMode'));
    this.audio.applyVolumes();
    this.input.invertY = !!s.get('invertY');
    this.input.sensitivity = s.get('sensitivity');
    if (this.cameraRig) {
      this.cameraRig.setDistance(s.get('camDist'));
      this.cameraRig.setFov(s.get('fov'));
    }
  }

  applySetting(key, value) {
    switch (key) {
      case 'quality':
        this.qualityName = value;
        this.engine.setQuality(value);
        this.traffic.quality = value;
        this.peds.quality = value;
        this.env && this.env.update(0, this.camera);
        break;
      case 'shadows':
        this.engine.applyShadows(value);
        break;
      case 'bloom':
        if (this.engine.bloom) this.engine.bloom.enabled = !!value && QUALITY[this.qualityName].bloom;
        break;
      case 'fov':
        if (this.cameraRig) this.cameraRig.setFov(Number(value));
        break;
      case 'fogdist':
        break;
      case 'volMaster': case 'volSfx': case 'volMusic': case 'volAmb':
        this.audio.applyVolumes();
        break;
      case 'camDist':
        if (this.cameraRig) this.cameraRig.setDistance(Number(value));
        break;
      case 'sensitivity':
        this.input.sensitivity = Number(value);
        break;
      case 'invertY':
        this.input.invertY = !!value;
        break;
      case 'timeMode':
        if (this.env) this.env.setTimeOfDay(value);
        break;
      case 'weather':
        if (this.env && !value) this.env.setWeather('clear');
        break;
      case 'transmission':
        if (this.playerVehicle) this.playerVehicle.transmission = value;
        break;
      case 'assists':
        if (this.playerVehicle) this.playerVehicle.assists = value !== false;
        break;
    }
  }

  refreshSettings() {
    this.applyAllSettings();
  }

  // ================= world setup =================
  spawnParkedCars() {
    for (const pc of this.parkedCars) {
      this.scene.remove(pc.group);
      if (pc.batched) pc.group.userData.dispose?.();
      else pc.visual.dispose();
    }
    this.parkedCars.length = 0;
    // a few ambient parked cars around the spawn / garage / meet
    const spots = [
      [-292, 176, 0.2, 'coupe_zen', '#c8202c'],
      [-310, 172, -1.4, 'hatch_kei', '#e0c72a'],
      [-288, 196, 2.8, 'muscle_vanguard', '#1d3f6b'],
      [-302, 200, 1.0, 'sedan_rhein', '#2c3f4a'],
      [60, 186, 0.3, 'exotic_aoi', '#f2f4f6'],
      [232, 392, 0.8, 'drift_nagata', '#c9ccd1'],
      [248, 396, 2.2, 'coupe_slide', '#25303c'],
      [-114, 386, 1.2, 'muscle_stallion', '#191919'],
      [236, 250, 0.4, 'sedan_evo', '#d8dde2'],
    ];
    for (const [x, z, h, id, color] of spots) {
      const def = CAR_BY_ID[id];
      if (!def) continue;
      const mods = defaultMods(def);
      mods.paintColor = color;
      // Parked cars are scenery: use the batched body (6 draw calls instead of
      // ~90) so the streets stay cheap to draw.
      const batched = buildBatchedCarVisual(def, color);
      batched.group.position.set(x, 0.16, z);
      batched.group.rotation.y = h;
      this.scene.add(batched.group);
      this.parkedCars.push({ group: batched.group, batched: true, x, z, def, mods });
    }
  }

  // ================= flow =================
  showMenu() {
    this.state = 'menu';
    this.worldActive = false;
    this.hud.show(false);
    this.playerVehicle = null;
    this.playerInCar = false;
    this.enterPreviewMenuItem();
    this.screens.showOnly('menu');
    this.input.releaseLock();
    document.getElementById('loading').classList.add('hidden');
  }

  // camera orbit for the main menu
  enterPreviewMenuItem() {
    this.previewCar = null;
    this.menuCamAngle = 0;
    this.state = 'menu';
    // place the camera over downtown at dusk for the menu backdrop
    const car = this.progression.data ? this.progression.activeCar() : null;
    if (car) {
      const def = CAR_BY_ID[car.defId];
      this.showPreviewCar(def, car.mods, {
        pos: new THREE.Vector3(-60, 0, -20),
        camStart: new THREE.Vector3(4, 1.6, 6),
        mode: 'menu',
      });
    } else {
      const def = CAR_BY_ID['coupe_zen'];
      this.showPreviewCar(def, defaultMods(def), {
        pos: new THREE.Vector3(-60, 0, -20), camStart: new THREE.Vector3(4, 1.6, 6), mode: 'menu',
      });
    }
    this.env.setTimeOfDay('night');
    this.env.forceTime = 21.2 + Math.sin(this.time * 0.2) * 0.4;
    this.audio.startMusic();
  }

  showPreviewCar(def, mods, opts = {}) {
    if (this.previewCar) { this.scene.remove(this.previewCar.group); this.previewCar.dispose(); }
    const visual = new CarVisual(def, mods, { quality: this.qualityName });
    visual.setLights(true);
    const pos = opts.pos || new THREE.Vector3(0, 0, 0);
    visual.group.position.copy(pos);
    visual.group.rotation.y = opts.rotY ?? Math.PI * 0.15;
    this.scene.add(visual.group);
    this.previewCar = visual;
    this.previewMode = opts.mode || 'garage';
    this.previewAnchor = pos.clone();
    this.previewSpin = 0.25;
    this.state = opts.mode === 'dealer' ? 'dealer' : opts.mode === 'tune' ? 'tune' : opts.mode === 'garage' ? 'garage' : 'menu';
    return visual;
  }

  enterPreview(def, mods, mode) {
    // used by garage / tune / dealer screens — placed indoors-ish area
    this.state = mode === 'dealer' ? 'dealer' : mode === 'tune' ? 'tune' : 'garage';
    this.worldActive = false;
    this.input.releaseLock();
    const spot = this.previewSpot(mode, def);
    this.showPreviewCar(def, mods, { pos: spot, mode });
    this.hud.show(false);
  }

  previewSpot(mode, def) {
    // an empty stretch of road for a clean backdrop
    if (mode === 'tune') return new THREE.Vector3(240, 0.02, 262);
    if (mode === 'dealer') return new THREE.Vector3(60, 0.02, 200);
    return new THREE.Vector3(-300, 0.02, 196);
  }

  updatePreviewMods(mods) {
    if (!this.previewCar) return;
    this.previewCar.setMods(mods);
    this.previewCar.setLights(true);
  }

  exitPreviewToWorld() {
    if (this.previewCar) { this.scene.remove(this.previewCar.group); this.previewCar.dispose(); this.previewCar = null; }
    this.screens.showOnly(null);
    this.enterWorldWithActiveCar();
  }

  // leave a garage / showroom / tuning screen and resume play where the player stands
  returnToWorld() {
    if (this.previewCar) { this.scene.remove(this.previewCar.group); this.previewCar.dispose(); this.previewCar = null; }
    this.screens.showOnly(null);
    this.screens.current = null;
    if (!this.progression.data) { this.showMenu(); return; }
    if (!this.worldActive) { this.enterWorldWithActiveCar(); return; }
    // resume in place
    this.refreshPlayerVehicleMods();
    this.state = 'explore';
    this.paused = false;
    this.hud.show(true);
    this.input.requestLock();
    this.audio.startMusic();
    this.env.forceTime = this.settings.get('timeMode') === 'live' ? null : this.env.forceTime;
    this.applyAllSettings();
  }

  async startNewGame() {
    this.fadeToBlack(true);
    await this.wait(450);
    this.progression.newGame('DRIVER');
    this.progression.save();
    this.refreshPlayerLook();
    this.fadeToBlack(false);
    this.enterWorldWithActiveCar(true);
    this.hud.centerMessage('SAN VELOR', 'WELCOME TO THE UNDERGROUND', 3200);
    setTimeout(() => this.hud.toast('TIP: walk to your car and press E', 'rep', 6000), 1200);
    setTimeout(() => this.hud.toast('Your garage is on Palm Heights — follow the map', '', 6000), 8000);
    this.audio.ui('confirm');
  }

  async continueGame() {
    const d = this.progression.load();
    if (!d) { this.startNewGame(); return; }
    this.fadeToBlack(true);
    await this.wait(380);
    this.fadeToBlack(false);
    this.enterWorldWithActiveCar();
    this.hud.toast('WELCOME BACK, DRIVER', 'money');
  }

  fadeToBlack(on) {
    const el = document.getElementById('fade');
    el.classList.toggle('on', on);
  }

  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  enterWorldWithActiveCar(fresh = false) {
    const car = this.progression.activeCar();
    if (!car) { this.showMenu(); return; }
    const def = CAR_BY_ID[car.defId];
    let sp = spawnPoint();
    // resume where the player left off when continuing a save
    const savedPos = this.progression.data?.position;
    if (!fresh && savedPos && isFinite(savedPos.x) && isFinite(savedPos.z)) {
      sp = { x: savedPos.x, z: savedPos.z, heading: savedPos.h ?? 0 };
    }
    // stand beside the driver's door, facing the same way as the car
    this.player.place(sp.x + Math.sin(sp.heading) * 2.3, sp.z + Math.cos(sp.heading) * 2.3,
      Player.fromVehicleHeading(sp.heading));
    this.refreshPlayerLook();
    this.setupPlayerVehicle(def, car.mods, car.uid, sp.x, sp.z, sp.heading);
    const startInCar = !!(savedPos && savedPos.inCar);
    this.playerInCar = false;
    this.player.setVisible(true);
    this.playerVehicle.visual.group.visible = true;
    this.state = 'explore';
    this.worldActive = true;
    this.paused = false;
    this.hud.show(true);
    this.screens.showOnly(null);
    this.input.requestLock();
    this.cameraRig.modeIndex = 0;
    this.audio.startMusic();
    this.env.setTimeOfDay(this.settings.get('timeMode') || 'live');
    this.cameraRig.smoothPos.set(sp.x + 8, 3.2, sp.z + 8);
    this.hud.setWanted(0);
    this.hud.setObjective('');
    this.applyAllSettings();
    if (this.playerVehicle) this.playerVehicle.transmission = this.settings.get('transmission') || 'auto';
    this.lastDistrict = '';
    if (startInCar) {
      this.player.place(sp.x, sp.z, Player.fromVehicleHeading(sp.heading));
      this.putPlayerInCar();
    }
  }

  setupPlayerVehicle(def, mods, uid, x, z, heading) {
    // remove the old one
    if (this.playerVehicle) {
      this.scene.remove(this.playerVehicle.visual.group);
      this.playerVehicle.visual.dispose();
    }
    const veh = new Vehicle(def, mods, {
      isPlayer: true,
      transmission: this.settings.get('transmission') || 'auto',
      assists: this.settings.get('assists') !== false,
    });
    veh.reset(x, z, heading);
    veh.uid = uid;
    const visual = new CarVisual(def, mods, { quality: this.qualityName });
    visual.setLights(this.env ? this.env.isNight() : true);
    visual.group.position.set(x, 0.16, z);
    visual.group.rotation.y = heading;
    this.scene.add(visual.group);
    veh.visual = visual;
    this.playerVehicle = veh;
    this.vehicles = [veh];
  }

  // mount the car of the current save (after tuning / purchase changes)
  refreshPlayerVehicleMods() {
    const car = this.progression.activeCar();
    if (!car || !this.playerVehicle) return;
    this.playerVehicle.mods = car.mods;
    this.playerVehicle.stats = computeStats(CAR_BY_ID[car.defId], car.mods);
    if (this.playerVehicle.def.id !== car.defId) {
      const pos = { x: this.playerVehicle.x, z: this.playerVehicle.z, h: this.playerVehicle.heading };
      this.setupPlayerVehicle(CAR_BY_ID[car.defId], car.mods, car.uid, pos.x, pos.z, pos.h);
    } else {
      this.playerVehicle.visual.setMods(car.mods);
    }
  }

  toMainMenu() {
    this.saveGame();
    this.paused = false;
    this.state = 'menu';
    this.worldActive = false;
    if (this.race.active) this.race.clear();
    if (this.police.wanted) this.police.clearWanted(0);
    this.hud.show(false);
    this.screens.showOnly('menu');
    document.getElementById('pause').classList.add('hidden');
    this.input.releaseLock();
    this.enterPreviewMenuItem();
  }

  pause() {
    if (this.state === 'menu' || this.state === 'boot') return;
    this.paused = true;
    this.input.releaseLock();
    this.screens.open('pause');
  }

  resume() {
    this.paused = false;
    this.screens.close('pause');
    this.screens.current = null;
    this.input.requestLock();
    this.audio.resume();
  }

  saveGame() {
    if (this.progression.data && this.playerVehicle) {
      this.progression.data.position = {
        x: this.playerInCar ? this.playerVehicle.x : this.player.x,
        z: this.playerInCar ? this.playerVehicle.z : this.player.z,
        inCar: this.playerInCar,
      };
    }
    this.progression.save();
  }

  // ================= events =================
  openBrief(ev) {
    if (this.race.active) { this.hud.toast('FINISH THE CURRENT EVENT FIRST', 'warn'); return; }
    this.currentEvent = ev;
    this.paused = true;
    this.input.releaseLock();
    this.screens.open('brief', { ev });
  }

  resumeFromBrief() {
    this.paused = false;
    this.currentEvent = null;
    this.input.requestLock();
  }

  startEventFromBrief() {
    const ev = this.currentEvent;
    if (!ev) return;
    const p = this.progression;
    if (p.money < (ev.fee || 0)) { this.audio.ui('error'); this.hud.toast('NOT ENOUGH CASH', 'warn'); return; }
    if (ev.fee) p.spend(ev.fee);
    this.screens.close('brief');
    this.screens.current = null;
    this.paused = false;
    // teleport player to the event start
    this.raceReturnPos = { x: this.playerVehicle.x, z: this.playerVehicle.z, h: this.playerVehicle.heading };
    if (!this.playerInCar) this.putPlayerInCar();
    this.playerVehicle.reset(ev.x, ev.z, ev.heading || 0);
    this.playerVehicle.visual.group.position.set(ev.x, 0.16, ev.z);
    this.playerVehicle.visual.group.rotation.y = ev.heading || 0;
    this.cameraRig.yaw = CameraRig.chaseYaw(ev.heading || 0);
    this.cameraRig.smoothPos.set(ev.x + Math.sin(this.cameraRig.yaw) * 8, 3.4, ev.z + Math.cos(this.cameraRig.yaw) * 8);
    this.currentEvent = null;
    this.input.requestLock();
    this.race.start(ev);
    this.state = 'race';
    this.audio.startMusic();
  }

  finishRace(result) {
    this.state = 'explore';
    this.paused = true;
    this.input.releaseLock();
    this.screens.open('results', { result });
    this.audio.ui(result.position === 1 ? 'confirm' : 'back');
    if (result.payout > 0) this.audio.cashRegister?.();
    this.playerVehicle.reset(this.playerVehicle.x, this.playerVehicle.z, this.playerVehicle.heading);
  }

  closeResults() {
    this.race.clear();
    this.screens.close('results');
    this.screens.current = null;
    this.paused = false;
    this.state = 'explore';
    this.input.requestLock();
    this.refreshPlayerVehicleMods();
  }

  retryRace() {
    const ev = this.race.ev;
    this.screens.close('results');
    this.screens.current = null;
    this.race.clear();
    this.paused = false;
    if (ev) {
      this.playerVehicle.reset(ev.x, ev.z, ev.heading || 0);
      this.race.start(ev);
      this.state = 'race';
      this.input.requestLock();
    }
  }

  resumeFromMap() {
    this.paused = false;
    this.screens.current = null;
    this.input.requestLock();
  }

  setWorldActive(v) { this.worldActive = v; }

  bustPlayer() {
    // teleport to the garage and reset the car
    const sp = spawnPoint();
    if (this.playerInCar) {
      this.playerVehicle.reset(sp.x, sp.z, sp.heading);
      this.playerVehicle.visual.group.position.set(sp.x, 0.16, sp.z);
    } else {
      this.player.place(sp.x + 2, sp.z + 2, 0);
    }
    this.paused = true;
    this.hud.centerMessage('BUSTED', 'THE CAR WAS TOWED TO YOUR GARAGE', 3200);
    setTimeout(() => { this.paused = false; }, 2400);
  }

  // ================= car enter / exit =================
  nearestVehicle() {
    if (!this.playerVehicle) return null;
    const v = this.playerVehicle;
    const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
    if (d < CONFIG.player.enterRange) return { vehicle: v, def: v.def };
    return null;
  }

  putPlayerInCar() {
    if (this.playerInCar) return;
    this.playerInCar = true;
    this.player.setVisible(false);
    this.cameraRig.modeIndex = 0;
    this.cameraRig.yaw = CameraRig.chaseYaw(this.playerVehicle.heading);
    this.cameraRig.smoothPos.set(
      this.playerVehicle.x - Math.cos(this.cameraRig.yaw) * 7,
      3.4,
      this.playerVehicle.z + Math.sin(this.cameraRig.yaw) * 7
    );
    this.audio.startEngine();
    this.audio.setEngine(this.playerVehicle.def.sound);
    this.hud.showPrompt('');
    this.hud.hidePrompt();
    this.audio.ui('confirm');
  }

  putPlayerOutOfCar() {
    if (!this.playerInCar) return;
    const v = this.playerVehicle;
    if (Math.abs(v.longSpeed) > 4) { this.hud.toast('SLOW DOWN TO EXIT', 'warn'); return; }
    this.playerInCar = false;
    const side = 2.2;
    // step out on the driver's side (the car's right) and face the way it does
    this.player.place(
      v.x + Math.sin(v.heading) * side,
      v.z + Math.cos(v.heading) * side,
      Player.fromVehicleHeading(v.heading)
    );
    this.cameraRig.yaw = Player.fromVehicleHeading(v.heading);
    this.player.setVisible(true);
    this.audio.stopEngine();
    this.audio.updateSkid(0, 0);
    this.cameraRig.modeIndex = 0;
    this.audio.ui('back');
  }

  // ================= main loop =================
  start() {
    if (this._started) return;
    this._started = true;
    this.clock.start();
    const tick = () => {
      requestAnimationFrame(tick);
      this.frame();
    };
    tick();
  }

  frame(forcedDelta) {
    this._frameStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const raw = forcedDelta != null ? forcedDelta : Math.min(this.clock.getDelta(), 0.1);
    this.time += raw;
    this.frameCount++;
    const dt = Math.min(raw, 0.05);
    if (!this.running) return;

    // coarse quality fallback: only if things are really bad for a long time
    if (this.frameCount < 600 && raw > 0.001) {
      this.fpsSamples.push(1 / raw);
      if (this.fpsSamples.length > 120) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        this.fpsSamples.length = 0;
        if (avg < 26 && this.engine.autoAdapt && this.qualityName === 'high') {
          this.qualityName = 'medium';
          this.settings.set('quality', 'medium');
          this.applySetting('quality', 'medium');
          this.hud.toast('QUALITY AUTO-ADJUSTED TO MEDIUM', '', 4000);
        }
      }
    }

    const active = this.state === 'menu' || this.state === 'character' || this.worldActive;
    if (!this.paused && active) this.update(dt, raw);
    else if (this.paused && this.state !== 'menu') {
      // keep the world breathing slightly while paused for atmosphere
      this.env.update(0, this.camera);
    }
    if (this.state === 'menu') this.updateMenuCamera(raw);

    if (!this.headless) {
      this.engine.render(this.env, dt);
      // dynamic resolution: measure the real frame time and scale the render
      // target down when the budget slips
      if (this.engine.adapt) this.engine.adapt(performance.now() - this._frameStart);
    }
    this.input.endFrame();
  }

  updateMenuCamera(dt) {
    // slow orbit around the preview car
    const anchor = this.previewAnchor || new THREE.Vector3(0, 0, 0);
    this.menuCamAngle = (this.menuCamAngle || 0) + dt * 0.16;
    const r = 7.4;
    const h = 2.05;
    this.camera.position.set(
      anchor.x + Math.cos(this.menuCamAngle) * r,
      h + Math.sin(this.menuCamAngle * 0.6) * 0.5,
      anchor.z + Math.sin(this.menuCamAngle) * r
    );
    this.camera.lookAt(anchor.x, 0.85, anchor.z);
    this.camera.fov = 48;
    this.camera.updateProjectionMatrix();
    if (this.previewCar) {
      this.previewCar.group.rotation.y = 0.4 + Math.sin(this.menuCamAngle * 0.3) * 0.15;
    }
    this.env.update(dt, this.camera);
    this.city.update(dt, this.camera);
    this.city.updateLights(this.env.nightAmount, this.camera, QUALITY[this.qualityName].lampLights);
    // wet tarmac follows the weather without rebuilding any material
    this.env.applyWetness(MATS.asphalt);
    this.audio.updateAmbience(this.env.nightAmount);
    if (this.previewCar) {
      this.previewCar.update(dt, { steer: 0, wheelDelta: 0, suspension: [0, 0, 0, 0] });
      this.previewCar.setBrake(0);
    }
  }

  // ---------- driver customiser preview ----------
  // A lit figure on a plinth in front of the camera, rebuilt live whenever the
  // look changes. It replaces the car preview while the customiser is open.
  enterLookPreview() {
    this.exitLookPreview();
    if (this.previewCar) { this.previewCar.group.visible = false; }
    this.lookPreview = new Player(this.scene, this.progression.look);
    this.lookPreviewAngle = 0.35;
    this.lookPreviewSpin = 0;
    this.state = 'character';
    this.previewMode = 'character';
    this.worldActive = false;
    this.hud.show(false);
    // a little turntable under the boots so the figure is not floating
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.55, 0.12, 28),
      new THREE.MeshStandardMaterial({ color: '#1a2028', roughness: 0.55, metalness: 0.5 })
    );
    disc.position.y = 0.06;
    this.lookPreview.group.add(disc);
    this.lookPreview.group.position.set(0, 0, 0);
    this.lookPreview.rig.rotation.y = Math.PI;
    for (const m of this.lookPreview.materials) m.envMapIntensity = 1;
    return this.lookPreview;
  }

  spinLookPreview() { this.lookPreviewSpin = 2.6; }

  refreshPlayerLook() {
    if (this.player) this.player.setLook(this.progression.look);
  }

  updateLookPreview(dt) {
    const look = this.lookPreview;
    if (!look) return;
    this.lookPreviewAngle += this.lookPreviewSpin * dt;
    if (this.lookPreviewSpin > 0) this.lookPreviewSpin = Math.max(0, this.lookPreviewSpin - dt * 0.55);
    if (this.input.mouse.left || Math.abs(this.input.mouse.dx) > 0.5) this.lookPreviewAngle += this.input.mouse.dx * 0.007;
    const r = 3.1;
    const y = 1.15 + (this.input.mouse.dy * 0.004);
    this.camera.position.set(Math.sin(this.lookPreviewAngle) * r, clamp(y, 0.5, 2.3), Math.cos(this.lookPreviewAngle) * r);
    this.camera.lookAt(0, 1.0, 0);
    this.camera.fov = damp(this.camera.fov, 42, 6, dt);
    this.camera.updateProjectionMatrix();
    look.group.rotation.y = 0;
    look.group.position.set(0, 0.12, 0);
    // idle pose so the figure does not stand like a mannequin
    look.speed = 0;
    look.anim.phase += dt * 0.9;
    look.torso.position.y = 0.10 + Math.sin(look.anim.phase * 1.2) * 0.006;
    look.headGroup.rotation.y = Math.sin(look.anim.phase * 0.35) * 0.12;
    this.env.update(dt, this.camera);
    this.city.update(dt, this.camera);
    this.city.updateLights(this.env.nightAmount, this.camera, QUALITY[this.qualityName].lampLights);
    this.audio.updateAmbience(this.env.nightAmount, 0, true);
  }

  exitLookPreview() {
    if (!this.lookPreview) return false;
    this.scene.remove(this.lookPreview.group);
    this.lookPreview.dispose();
    this.lookPreview = null;
    if (this.previewCar) this.previewCar.group.visible = true;
    return true;
  }

  updatePreviewCamera(dt) {
    // orbit the car in the garage / showroom
    const anchor = this.previewAnchor || new THREE.Vector3(0, 0, 0);
    this.previewAngle = (this.previewAngle || 0.6) + (this.previewSpin || 0) * dt;
    if (this.previewSpin > 0) this.previewSpin = Math.max(0, this.previewSpin - dt * 0.12);
    if (!this.input.mouse.left) this.previewAngle += this.input.mouse.dx * 0.006 * (this.settings.get('sensitivity') || 1);
    if (this.input.mouse.left) this.previewAngle += this.input.mouse.dx * 0.008;
    this.previewElev = clamp((this.previewElev ?? 2.4) + this.input.mouse.dy * 0.01 * (this.input.mouse.left ? 1 : 0), 0.6, 6.5);
    this.previewZoom = clamp(this.previewZoom + this.input.mouse.wheel * 0.09, 0.55, 1.9);
    const r = 8.4 / this.previewZoom;
    this.camera.position.set(
      anchor.x + Math.cos(this.previewAngle) * r,
      this.previewElev,
      anchor.z + Math.sin(this.previewAngle) * r
    );
    this.camera.lookAt(anchor.x, 0.95, anchor.z);
    this.camera.fov = damp(this.camera.fov, 46, 6, dt);
    this.camera.updateProjectionMatrix();
    this.env.update(dt, this.camera);
    this.city.update(dt, this.camera);
    this.city.updateLights(this.env.nightAmount, this.camera, QUALITY[this.qualityName].lampLights);
    // wet tarmac follows the weather without rebuilding any material
    this.env.applyWetness(MATS.asphalt);
    // animate the car
    if (this.previewCar) {
      this.previewCar.wheels.forEach((w) => { w.spin.rotation.z = 0; });
      this.previewCar.update(dt, { steer: Math.sin(this.time * 0.6) * 0.16, wheelDelta: 0, suspension: [0, 0, 0, 0], pitch: 0, roll: 0 });
    }
    this.audio.updateAmbience(this.env.nightAmount, 0, true);
  }

  update(dt, raw) {
    const st = this.state;
    if (st === 'menu') return;
    if (st === 'character') {
      this.updateLookPreview(dt);
      return;
    }
    if (st === 'garage' || st === 'tune' || st === 'dealer') {
      this.updatePreviewCamera(dt);
      // live clock for the backdrop
      this.hud.show(false);
      return;
    }

    // ---------- live world ----------
    const envState = this.env.update(dt, this.camera);
    this.city.update(dt, this.camera);
    this.city.updateLights(this.env.nightAmount, this.camera, QUALITY[this.qualityName].lampLights);
    // wet tarmac follows the weather without rebuilding any material
    this.env.applyWetness(MATS.asphalt);
    this.traffic.camPos = this.camera.position;
    this.traffic.update(dt, this.playerInCar ? this.playerVehicle : this.player, this.getFocusPos());
    this.peds.camPos = this.camera.position;
    this.peds.update(dt, this.playerInCar ? this.playerVehicle : this.player, this.getFocusPos());
    this.audio.updateAmbience(this.env.nightAmount);

    const v = this.playerVehicle;
    let camInfo = { yaw: this.cameraRig.yaw };

    if (this.playerInCar && v) {
      // ---- driving ----
      const input = this.readDrivingInput();
      v.update(dt, input, this.city);
      this.resolveVehicleCollisions(v, dt);
      this.updateVehicleVisual(v, dt);
      this.handleVehicleEvents(v);
      this.cameraRig.modeIndex = this.cameraRig.modeIndex;
      camInfo = this.cameraRig.updateDrive(dt, v);
      this.hud.showPrompt('');
      // interaction prompts while driving
      this.checkWorldInteractionsDriving(v);
      // police / wanted for reckless driving
      this.updateWantedFromDriving(dt, v);
      // audio
      this.audio.updateEngine(v.rpm, v.engineLoad, v.throttleAmount, v.speed, Math.abs(v.slipAngle), v.nitroActive ? 1 : 0);
      this.audio.updateSkid(Math.abs(v.slipAngle), v.speed);
      this.audio.updateWind(v.speed);
      this.effects.updateVehicle(dt, v, v.visual);
      // lights
      v.visual.setLights(this.env.nightAmount > 0.32 || this.env.fogDensity > 0.3);
      v.visual.setBrake(v.braking > 0.05 || Math.abs(v.longSpeed) < 0.4 && input.throttle <= 0 && !this.race.active ? 1 : 0);
      v.visual.setReverse(v.longSpeed < -0.4 ? 1 : 0);
      // camera shake from speed & surface
      if (v.speed > 40) this.cameraRig.addShake((v.speed - 40) * 0.0009);
      // race
      if (this.race.active) {
        this.race.update(dt, v, this.player);
        this.race.updateArrow(dt, v);
        if (this.race.state === 'finished' && this.race.result && this.state === 'race') {
          this.finishRace(this.race.result);
        }
      }
      // delivery mission logic
      this.updateDelivery(dt, v);
    } else {
      // ---- on foot ----
      this.player.update(dt, this.input, this.city.colliders, this.cameraRig.yaw);
      this.cameraRig.updateWalk(dt, this.player);
      this.audio.stopEngine();
      this.audio.updateSkid(0, 0);
      this.audio.updateWind(0);
      if (v) {
        // keep the car visible and idle
        v.update(dt, { throttle: 0, brake: 1, steer: 0, handbrake: 0 }, this.city);
        this.resolveVehicleCollisions(v, dt);
        this.updateVehicleVisual(v, dt);
        v.visual.setLights(this.env.nightAmount > 0.32 || this.env.fogDensity > 0.3);
      }
      this.effects.updateVehicle(dt, null, null);
      this.checkWorldInteractionsFoot();
      if (this.race.active && this.playerVehicle) {
        this.race.update(dt, this.playerVehicle, this.player);
        this.race.updateArrow(dt, this.playerVehicle);
      }
      if (this.race.active && this.race.state === 'finished' && this.race.result && this.state === 'race') {
        this.finishRace(this.race.result);
      }
    }

    // police (only while driving, outside races)
    if (!this.race.active && this.playerInCar) this.police.update(dt, v);
    else if (this.police.wanted > 0) this.police.update(dt, v || this.player);

    // HUD
    this.hud.update(dt, {
      vehicle: this.playerInCar ? v : null,
      player: this.playerInCar ? null : this.player,
      env: this.env, progression: this.progression,
    });
    if (this.playerInCar && v && this.race.active) {
      const aim = this.race.checkpoints[this.race.cpIndex];
      if (aim) {
        const d = Math.hypot(v.x - aim.x, v.z - aim.z);
        this.hud.showPrompt('');
      }
    }
    // district prompt
    const dist = districtOf(this.getFocusPos().x, this.getFocusPos().z);
    if (dist !== this.lastDistrict) {
      this.lastDistrict = dist;
      this.audio.ui('back');
    }
    // autosave every 45s
    this._saveTimer = (this._saveTimer || 0) + dt;
    if (this._saveTimer > 45) { this._saveTimer = 0; this.saveGame(); }
  }

  readDrivingInput() {
    const i = this.input;
    const v = this.playerVehicle;
    const forward = i.down('KeyW') || i.down('ArrowUp');
    const back = i.down('KeyS') || i.down('ArrowDown');
    const steer = clamp(i.axis('KeyA', 'KeyD') + i.axis('ArrowLeft', 'ArrowRight'), -1, 1);
    const handbrake = i.down('Space') ? 1 : 0;
    const nitro = i.down('ShiftLeft') || i.down('ShiftRight');
    let throttle = 0;
    let brake = 0;
    if (forward) throttle = 1;
    if (back) {
      // brake while rolling forward, engage reverse once nearly stopped
      if (v && v.longSpeed > 0.6) brake = 1;
      else { throttle = -1; brake = 0; }
    }
    return { throttle, brake, steer, handbrake, nitro };
  }

  updateVehicleVisual(v, dt) {
    const vis = v.visual;
    // ride height, plus the surface tilt when the car is on a ramp
    const y = 0.16 + (v.y || 0);
    vis.group.position.set(v.x, y, v.z);
    vis.group.rotation.y = v.heading;
    const tilt = v.airborne ? 0 : (v.tiltPitch || 0);
    vis.group.rotation.z = tilt;
    vis.group.rotation.x = v.airborne ? -clamp(v.vy * 0.02, -0.12, 0.14) : (v.tiltRoll || 0);
    const wheelSpinDelta = (v.longSpeed / v.def.body.wheelR) * dt + (v.wheelspinAmount || 0) * dt * 8;
    vis.update(dt, {
      steer: clamp(v.steerAngle * 2.0, -0.8, 0.8),
      wheelDelta: wheelSpinDelta,
      suspension: v.suspension,
      pitch: v.pitch * 0.55 + (v.airborne ? 0 : 0),
      roll: v.roll * 0.7,
    });
    // body damage tint
    if (v.health < 0.98) {
      const dmg = 1 - v.health;
      vis.bodyMat.color.lerpColors(
        vis.bodyMat.color.clone().set(vis.mods.paintColor || v.def.defaultColor),
        new THREE.Color('#2a2a2a'), dmg * 0.5
      );
      vis.bodyMat.roughness = 0.34 + dmg * 0.5;
    }
  }

  resolveVehicleCollisions(v, dt) {
    const r = v.def.body.width * 0.46;
    const near = this.city.colliders.query(v.x, v.z, r + 6);
    for (const c of near) {
      if (c.height < 0.4) continue;
      if ((c.baseY || 0) > (v.y || 0) + 1.2) continue;   // bridge parapet: drive under it
      const closest = closestPointOnBox(v.x, v.z, c);
      const dx = v.x - closest.x, dz = v.z - closest.z;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 0.0001) {
        const depth = r - d;
        const nx = dx / d, nz = dz / d;
        const impact = v.resolveCollision(nx, nz, depth, 0.25);
        if (impact > 3) {
          this.effects.impact(closest.x, 0.6, closest.z, Math.min(1, impact / 12));
          this.audio.impact(Math.min(1, impact / 16));
          this.cameraRig.addShake(Math.min(0.8, impact / 22));
          this.hud.damageFlash(Math.min(0.6, impact / 26));
          this.playerVehicle.visual.setBrake(1);
          if (impact > 6 && !this.race.active) this.police.addWanted(impact > 11 ? 1 : 0, impact > 11 ? 'RECKLESS DRIVING' : '');
        }
      }
    }
    // world bounds
    if (Math.abs(v.x) > 508) { v.x = clamp(v.x, -508, 508); v.vx *= -0.35; }
    if (Math.abs(v.z) > 508) { v.z = clamp(v.z, -508, 508); v.vz *= -0.35; }
  }

  handleVehicleEvents(v) {
    const ev = v.events;
    if (ev.landing > 0) {
      const heavy = ev.landing > 5;
      if (heavy) {
        this.audio.impact(Math.min(1, ev.landing / 16));
        this.cameraRig.addShake(Math.min(0.7, ev.landing / 20));
        v.health = Math.max(0.35, v.health - clamp((ev.landing - 5) * 0.012, 0, 0.18));
      } else if (ev.landing > 1.6) {
        this.cameraRig.addShake(0.12);
      }
      ev.landing = 0;
    }
    if (ev.shift) { this.audio.shiftBlip(); ev.shift = 0; }
    if (ev.backfire > 0.6) { this.audio.backfire(); ev.backfire = 0; }
    if (ev.driftStart) {
      ev.driftStart = 0;
      if (this.race.active && this.race.ev.type === 'drift') this.audio.ui('click');
    }
    if (ev.impact) ev.impact = 0;
  }

  updateWantedFromDriving(dt, v) {
    this._wantedTimer = (this._wantedTimer || 0) + dt;
    if (this._wantedTimer > 1.2) {
      this._wantedTimer = 0;
      const speeding = v.speedKmh > 145;
      const sliding = Math.abs(v.slipAngle) > 0.4 && v.speedKmh > 40;
      if (this.race.active) return;
      if (this.police.wanted > 0) return;
      if (speeding && Math.random() < 0.22) this.police.addWanted(1, 'SPEEDING — POLICE ALERTED');
      else if (sliding && Math.random() < 0.12) this.police.addWanted(1, 'RECKLESS DRIVING');
    }
  }

  updateDelivery(dt, v) {
    if (!this.race.active || this.race.ev.type !== 'delivery') return;
    const target = { x: 60, z: 180 };
    const d = Math.hypot(v.x - target.x, v.z - target.z);
    this.hud.setObjective(`DELIVER TO VELOCITY MOTORS — ${Math.round(d)}M · ${formatTime(Math.max(0, (this.race.ev.targetTime || 70) - this.race.timer))} LEFT`);
  }

  // ---------- interactions ----------
  checkWorldInteractionsFoot() {
    const p = this.player;
    // gather every candidate in range with its distance, then take the closest
    const candidates = [];
    if (this.playerVehicle) {
      const d = Math.hypot(this.playerVehicle.x - p.x, this.playerVehicle.z - p.z);
      if (d < CONFIG.player.enterRange) {
        candidates.push({ d, prompt: `Drive ${this.playerVehicle.def.name}`, action: 'car' });
      }
    }
    for (const key of Object.keys(POIS)) {
      const poi = POIS[key];
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      const radius = poi.type === 'meet' ? 22 : 17;
      if (d > radius) continue;
      let action = poi.type;
      let prompt = poi.name;
      if (poi.type === 'garage') prompt = `Enter ${poi.name}`;
      else if (poi.type === 'tune') prompt = `Tune your car — ${poi.name}`;
      else if (poi.type === 'dealer') prompt = `Browse ${poi.name}`;
      else if (poi.type === 'meet') prompt = `Car meet — ${poi.name}`;
      else if (poi.type === 'gas') prompt = 'Fuel up / repair car';
      else if (poi.type === 'drift') prompt = `Drift yard — ${poi.name}`;
      else if (poi.type === 'driver') prompt = `Customise your driver — ${poi.name}`;
      candidates.push({ d, prompt, action });
    }
    for (const ev of EVENTS) {
      const d = Math.hypot(ev.x - p.x, ev.z - p.z);
      if (d > 15) continue;
      const unlocked = this.progression.isUnlocked(ev);
      candidates.push({
        d,
        prompt: unlocked ? `${ev.name} — start event` : `${ev.name} — needs ${ev.repReq} REP`,
        action: unlocked ? 'event:' + ev.id : 'locked',
      });
    }
    candidates.sort((a, b) => a.d - b.d);
    const best = candidates[0];
    if (best) {
      this.hud.showPrompt(best.prompt);
      this.nearbyInteract = best.action;
      if (this.input.hit('KeyE')) this.doInteraction(best.action);
    } else {
      this.hud.hidePrompt();
      this.nearbyInteract = null;
    }
  }

  checkWorldInteractionsDriving(v) {
    for (const ev of EVENTS) {
      const d = Math.hypot(ev.x - v.x, ev.z - v.z);
      if (d < 12 && !this.race.active) {
        const unlocked = this.progression.isUnlocked(ev);
        this.hud.showPrompt(unlocked ? `${ev.name} — E to enter` : `${ev.name} — needs ${ev.repReq} REP`);
        if (this.input.hit('KeyE') && unlocked) { this.openBrief(ev); return; }
        return;
      }
    }
    this.hud.hidePrompt();
  }

  doInteraction(action) {
    const p = this.player;
    if (action === 'car') {
      // walk into the car, then enter
      this.putPlayerInCar();
      return;
    }
    if (action.startsWith('event:')) {
      const ev = EVENT_BY_ID[action.slice(6)];
      if (ev) this.openBrief(ev);
      return;
    }
    if (action === 'locked') { this.audio.ui('error'); this.hud.toast('REPUTATION TOO LOW FOR THIS EVENT', 'warn'); return; }
    if (action === 'garage') { this.state = 'garage'; this.enterPreview(this.progression.activeCar() ? CAR_BY_ID[this.progression.activeCar().defId] : CAR_BY_ID['coupe_bavar'], this.progression.activeCar().mods, 'garage'); this.screens.showOnly('garage'); this.screens.openGarage(); return; }
    if (action === 'tune') { this.enterPreview(this.progression.activeCar() ? CAR_BY_ID[this.progression.activeCar().defId] : CAR_BY_ID['coupe_bavar'], this.progression.activeCar().mods, 'tune'); this.screens.showOnly('tuning'); this.screens.openTuning(this.progression.data.activeCar); return; }
    if (action === 'driver') { this.screens.showOnly('character'); this.screens.open('character', { from: 'world' }); return; }
    if (action === 'dealer') { this.screens.showOnly('dealership'); this.screens.openDealer(); this.state = 'dealer'; this.worldActive = false; return; }
    if (action === 'meet') {
      const ev = EVENTS.find((e) => e.id === 'meet_show');
      if (ev) this.openBrief(ev);
      return;
    }
    if (action === 'gas') {
      const cost = 150;
      if (this.progression.spend(cost)) {
        this.playerVehicle.health = 1;
        this.playerVehicle.nitro = 1;
        this.audio.cashRegister?.();
        this.hud.toast('REFUELLED & REPAIRED — $150', 'money');
        this.progression.save();
      } else this.hud.toast('NOT ENOUGH CASH', 'warn');
      return;
    }
  }

  getFocusPos() {
    if (this.playerInCar && this.playerVehicle) return { x: this.playerVehicle.x, z: this.playerVehicle.z };
    return { x: this.player.x, z: this.player.z };
  }

  // ---------- misc ----------
  toggleMap() {
    if (this.screens.current === 'map-screen') { this.screens.close('map-screen'); this.screens.current = null; this.resumeFromMap(); }
    else if (!this.paused) {
      this.paused = true;
      this.input.releaseLock();
      this.screens.open('map-screen');
    }
  }

  exitToMenuFromGarage() {
    this.showMenu();
  }
}

function closestPointOnBox(x, z, c) {
  return { x: clamp(x, c.minX, c.maxX), z: clamp(z, c.minZ, c.maxZ) };
}
