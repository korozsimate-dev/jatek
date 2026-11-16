// Render every car in the game to a contact sheet so a regression in the mesh
// code is visible immediately.  node test/check-all-cars.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const ids = ['hatch_kei', 'coupe_zen', 'muscle_coronet', 'exotic_velor', 'van_delivery', 'suv_path'];
fs.mkdirSync('out/cars', { recursive: true });
for (const id of ids) {
  execFileSync(process.execPath, ['test/preview.mjs', 'car'], { env: { ...process.env, CAR: id } });
  fs.copyFileSync('out/car.png', `out/cars/${id}.png`);
  console.log('rendered', id);
}
