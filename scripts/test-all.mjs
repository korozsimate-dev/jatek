// Run every suite in sequence. `npm run test:all`
import { spawnSync } from 'node:child_process';

const suites = [
  ['unit', 'test/run-tests.mjs'],
  ['integration', 'test/integration.mjs'],
  ['map', 'test/validate-map.mjs'],
  ['geometry', 'test/geometry.mjs'],
  ['smoke', 'test/smoke-dom.mjs'],
  ['page', 'test/page-check.mjs'],
];

let failed = 0;
for (const [name, file] of suites) {
  console.log(`\n=== ${name} (${file}) ===`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${name} failed (exit ${r.status})`);
  }
}
if (failed) {
  console.error(`\n${failed} of ${suites.length} suites failed.`);
  process.exit(1);
}
console.log(`\nAll ${suites.length} suites passed.`);
