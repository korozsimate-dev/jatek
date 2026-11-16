# STREET EMPIRE — SAN VELOR

A browser-based 3D open-world street racing game. Walk, drive, tune, race — all
in a procedurally built city with a day/night cycle, traffic, police and an
underground racing scene.

Everything is generated in code: no external assets, no downloads, no server.

---

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. (Vite binds to `0.0.0.0` so it also works
through a proxied preview URL.)

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built game on port 4173 |
| `npm test` | Unit suite |
| `node test/integration.mjs` | End-to-end headless playthrough of the real `Game` |
| `node test/validate-map.mjs` | Guarantees every venue, checkpoint and road is reachable |
| `node test/smoke-dom.mjs` | Boots the real app against a stub DOM (catches wiring errors) |
| `node test/preview.mjs car` | Renders a car to `out/car.png` (no browser needed) |
| `node test/check-all-cars.mjs` | Renders a set of cars into `out/cars/` |

---

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk / drive |
| `Shift` | Sprint (on foot) |
| `E` | Enter / exit a car, interact with a venue |
| `Space` | Handbrake |
| `C` | Cycle camera (chase / far / bumper / cockpit) |
| `R` | Change camera distance |
| `M` | Toggle the map |
| `Esc` | Pause |
| Mouse | Look around (click to capture the pointer) |

---

## What's in the game

**The city — San Velor.** Ten districts (Downtown, Midtown, The Strip, Nightlife,
Palm Heights, Auto Row, Iron Yards, Velor Harbor, Canyon Hills) laid out on a
connected street grid, wrapped by a ring freeway with barriers and overpasses,
plus a switchback canyon circuit in the north-west hills. Street lamps, traffic
lights, palms, wet zones at gas stations, and a full day/night cycle with
dynamic weather (clear / rain / fog).

**Cars.** 17 hand-tuned fictional vehicles across 7 categories: 90s JDM coupes,
German sedans, Euro sports cars, American muscle, hatchbacks, drift cars and
classic tuners. Every car has RWD / FWD / AWD, its own power curve, gearbox
(auto or manual), weight, grip and drag. Working steering, wheel spin, brake and
reverse lights, suspension travel, body damage and tire smoke. Handling is
driven by a bicycle model with a world-velocity integrator, so it drifts
properly and recovers properly.

**Tuning.** Seven categories — engine, transmission, suspension, wheels,
exterior, visual, interior — with 100+ parts across 24 engine options alone.
Every part changes both stats and the 3D model (wheel size and style, ride
height, camber, spoilers, body kits, exhaust tips, tint, paint finish, liveries,
underglow, seats, steering wheel). Live before/after stat comparison, prices,
and reputation gates on the good stuff.

**Racing.** Eight events: sprint, two circuits, a highway run, a canyon time
attack, a drift battle, a car-meet show, and an invite-only underground race.
Countdown, checkpoints, AI opponents, live position, lap counter, timer, prize
money and rep. Police patrols react to speeding and reckless driving: wanted
level, pursuit AI, roadblocks, and an escape cooldown.

**Progression.** Start with cash and a used car in a small garage; earn through
races, drift, deliveries and meets; buy cars, parts, paint and garage space.
Progress saves locally (money, cars, mods, results, unlocks, position).

---

## Project layout

```
index.html            app shell (all screens + HUD markup)
src/main.js           entry point, boot, global keys, pointer lock
src/config.js         world / physics / economy constants, quality tiers
src/core/             renderer + post FX, input, settings, maths helpers
src/data/cars.js      car definitions, parts catalogue, stat maths
src/physics/vehicle.js bicycle-model vehicle physics
src/world/            layout data, geometry batching, city, car mesh, weather
src/game/             Game orchestrator, camera, player, traffic, police, races
src/ui/               HUD, minimap, screens, styles
test/                 unit suite, integration suite, map validator, renderer
```

`src/world/layout.js` is the single source of truth for geography: districts,
landmarks, event routes, lots, gas stations and the canyon road all come from
it, and both the 3D world and the minimap read the same data.

---

## Notes

* Audio is synthesised with the Web Audio API at runtime (engine notes per
  category, turbo, tyre squeal, impacts, sirens, ambience, menu clicks). There
  are no audio files, so nothing is licensed from anyone.
* The renderer is Three.js with a bloom + colour-grade pass. Quality tiers
  (low / medium / high) scale shadows, draw distance, traffic and pedestrians.
* `test/preview.mjs` is a small software rasteriser used during development to
  check geometry without a browser; it writes PNGs into `out/`.
