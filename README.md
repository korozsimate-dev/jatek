# STREET EMPIRE — SAN VELOR

A browser-based 3D open-world street racing game. Walk, drive, tune, race — all
in a procedurally built city with a day/night cycle, traffic, police and an
underground racing scene.

Everything is generated in code: no external assets, no downloads, no server.

---

## Run it

You need **Node.js 18 or newer** (tested on 22) and a browser with WebGL2
(Chrome, Edge, Firefox, Safari 15+). Vite's dev server additionally needs
20.19+/22.12+, but `npm start` does not.

```bash
git clone https://github.com/korozsimate-dev/jatek.git
cd jatek
npm install
npm start
```

`npm start` runs a small bundled static server (`server.mjs`) that needs **no
build step and no bundler** — its only install-time dependency is `three` — and
it opens the browser for you.

What it prints on a healthy machine:

```
  STREET EMPIRE — SAN VELOR
  running at http://localhost:5173/
  (press Ctrl+C to stop)

  Self-check: module graph OK.
```

Open the URL it prints in Chrome, Edge or Firefox. The first load takes a moment
while the city, cars and textures are generated — there is a progress bar.

### If it does not run

The startup output now names the problem, and so does the page itself.

| What you see | What it means | Fix |
| --- | --- | --- |
| `Port 5173 is already in use` | a server from an earlier attempt is still running | nothing — it moves to **5174** (and so on) by itself and prints the new URL |
| `This copy has N problem(s)` | `server.mjs` checks the module graph before serving | the bullet list names the file and the import to fix |
| `Three.js is not installed yet` | `node_modules` is missing | `npm install` |
| `Node 16 … cannot start` | too old | install Node 18+ from [nodejs.org](https://nodejs.org) |
| Page: *"The game did not start"* | server is up but the module never ran | `npm install`, then hard-reload with **Ctrl+F5** |
| Page: *"WebGL2 is not available"* | hardware acceleration off / driver | enable it, then check `chrome://gpu` |
| Page: *"Serve the game, do not open the file directly"* | opened a `file://` URL | use `npm start`, or open `dist/index.html` after `npm run build` |
| Anything else | the page shows the thrown error and stack in a red panel | that text is the bug report — it is worth pasting into an issue |

Two things that are *not* bugs: the very first load is a few seconds of
generation, and audio only starts after your first click (browser policy — the
menu click does it).

### Ports and options

```bash
node server.mjs                 # 5173 (or the next free port)
node server.mjs --port 5200     # explicit port
node server.mjs --no-open       # do not launch a browser
node server.mjs --help
```

Use `npm run dev` if you want the Vite dev server (hot reload). Vite is an
optional dependency: if `npm install` could not fetch it, `npm run dev` fails but
`npm start` still works.

### Play without a dev server

```bash
npm run build      # writes dist/
```

`dist/` is fully self-contained and uses relative paths, so you can also just
double-click `dist/index.html` and play from disk. To serve it over HTTP
instead:

```bash
npm run preview    # http://localhost:4173
```

### Troubleshooting

* **Black screen / "failed to start"** — the browser has no WebGL2. Check
  `chrome://gpu` or enable hardware acceleration.
* **No sound** — browsers only allow audio after a click; click once on the
  page (the menu does this for you).
* **Mouse look doesn't work** — click the canvas to capture the pointer,
  `Esc` releases it.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm start` | Static server, no bundler needed (recommended) |
| `node server.mjs --port 5200` | Same server on another port |
| `npm run dev` | Vite dev server with hot reload on port 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built game on port 4173 |
| `npm test` | Unit suite |
| `npm run test:all` | All five suites in sequence |
| `node test/page-check.mjs` | Page + module graph + static server checks |
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

**Your ride.** You start in *the Bavar coupe* — a rear-drive straight-six
two-door with a kidney grille and gill vents ahead of the front wheels — and a
bankroll of $40,000 to spend on parts, paint or a second car. Every car is built
from real lofted bodywork: separate fenders, arches, bumpers, glass, mirrors,
door seams, working headlamps, brake and reverse lights.

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

**Racing.** Thirteen events: three sprints, two circuits, a highway run, two
time attacks (the canyon switchbacks and a lap over the stunt-yard kicker), a
drift battle apiece in Iron Yards and the hangar, a car-meet show, two
deliveries and an invite-only underground race. Eight of the thirteen are open
from the first minute.

Every start line sits on the carriageway of a real street — you can drive to it,
and the marker on the map is on the tarmac, never on a rooftop. If you would
rather not drive across town, **RACES** in the pause menu lists the whole
calendar: pick an event and the car is placed on its start line with the brief
open.

**Stunt driving.** Jumps are real physics, not animation. A 26 m kicker in the
Auto Row stunt yard launches the car ~3.5 m into the air for over a second if
you hit it flat out, and an 88 m overpass climbs to a 5 m deck and drops back to
the street — you keep steering (and losing it) while airborne. The surfaces are
declared once in `src/world/layout.js` and read by the meshes, the physics and
the tests alike, so what you see is exactly what you drive.

**Your character.** A full customiser at CUTS & CHROME: hair, outfit, body
build and skin tone, with a live 3D preview you can spin. The look follows you
on foot and is saved with your progress.
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

### Kormányzás és teljesítmény

- **Kormányzás:** a kocsi a kormány állását követi (kinematikai cél-yaw + stabilitásvezérlés). Nagy sebességnél is marad használható kormányút, ellenkormányzásra azonnal visszafordul, normál kanyarban nem csúszik ki. A kézifék (Space) továbbra is szándékos driftet indít.
- **Teljesítmény:** a forgalom és a parkoló autók egyetlen csoportosított mesh-be kerültek (autónként ~6 draw call a ~90 helyett), a gyalogosok és a távoli forgalom távolság alapján culled, az árnyéktérkép 2048 és csak akkor épül újra, ha a nap/kamera tényleg mozdult. A renderelés dinamikusan csökkenti a felbontást, ha a frame time 24 ms fölé megy.
