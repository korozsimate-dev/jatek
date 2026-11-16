// ============================================================
// STREET EMPIRE — entry point
// ============================================================
import './ui/styles.css';
import { Game } from './game/game.js';

const $ = (id) => document.getElementById(id);

function setLoad(pct, text) {
  const fill = $('load-fill');
  const t = $('load-text');
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (t && text) t.textContent = text;
}

function fatal(err) {
  console.error(err);
  const el = $('boot-error');
  if (el) {
    el.classList.remove('hidden');
    el.textContent = 'STREET EMPIRE failed to start.\n\n' + (err && err.stack ? err.stack : String(err)) +
      '\n\nTry a modern browser (Chrome / Edge / Firefox) with WebGL2 enabled.';
  }
}

async function boot() {
  try {
    const canvas = $('gl');
    const game = new Game(canvas);
    window.__GAME__ = game;   // handy for debugging / tests
    game.input.onLockChange = (locked) => {
      if (!locked && game.state !== 'menu' && !game.paused && game.worldActive && game.state !== 'boot') {
        // pointer lock lost — show the pause menu
        if (!game.screens.current) game.pause();
      }
    };
    await game.boot(setLoad);
    game.start();
    setLoad(100, 'READY');
    setTimeout(() => {
      $('loading').classList.add('hidden');
      game.showMenu();
    }, 260);

    // keyboard shortcuts that live outside the game loop
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (game.state === 'menu') return;
        if (game.screens.current === 'brief') { game.resumeFromBrief(); game.screens.close('brief'); return; }
        if (game.screens.current === 'results') { game.closeResults(); return; }
        if (game.screens.current === 'map-screen') { game.toggleMap(); return; }
        if (game.screens.current === 'settings') { game.screens.close('settings'); game.screens.current = null; game.resume(); return; }
        if (game.screens.current === 'garage' || game.screens.current === 'tuning' || game.screens.current === 'dealership') {
          game.exitPreviewToWorld(); return;
        }
        if (game.paused) game.resume(); else game.pause();
      }
      if (e.code === 'KeyM' && game.worldActive && !game.paused && game.screens.current !== 'map-screen') {
        game.toggleMap();
      }
      if (e.code === 'KeyC' && game.playerInCar && !game.paused) {
        const name = game.cameraRig.cycleCamera();
        game.hud.toast('CAMERA: ' + name, '', 1200);
      }
      if (e.code === 'KeyR' && game.playerInCar && !game.paused && !game.race.active) {
        // reset the car if it's stuck
        const v = game.playerVehicle;
        v.reset(v.x, v.z, v.heading);
        game.hud.toast('VEHICLE RESET', '', 1200);
      }
      if (e.code === 'KeyE' && game.playerInCar && !game.paused) {
        // exit the car
        if (!game.race.active) game.putPlayerOutOfCar();
      }
      if (e.code === 'KeyQ' && game.playerInCar && !game.paused) game.playerVehicle.shiftDown();
      if (e.code === 'KeyE' && game.playerInCar && !game.paused) {
        // handled by exit above; manual upshift uses the same key only when racing
      }
      if (e.code === 'KeyH' && !game.paused) game.audio.horn();
      if (e.code === 'KeyF' && game.worldActive && !game.paused) {
        game.hud.toast('CAMERA: ' + game.cameraRig.cycleCamera(), '', 1200);
      }
      if (e.code === 'KeyE' && game.playerInCar && game.race.active && game.playerVehicle.transmission === 'manual') {
        game.playerVehicle.shiftUp();
      }
    });

    // click-to-lock once the player is in the world
    canvas.addEventListener('click', () => {
      if (game.worldActive && !game.paused && !game.input.locked) game.input.requestLock();
    });
    // first user gesture unlocks audio
    const unlockAudio = () => {
      game.audio.init();
      game.audio.resume();
      game.audio.applyVolumes();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // pause when the tab loses focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.worldActive && !game.paused) game.pause();
    });
  } catch (err) {
    fatal(err);
  }
}

boot();
