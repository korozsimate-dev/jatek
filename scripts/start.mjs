// Entry point for `npm start`.
//
// Checks the environment, then runs server.mjs in the foreground so Ctrl+C
// stops it normally. All the real work is in server.mjs — this wrapper only
// adds the "what do I do if the page is blank" hints, because that is the
// single most common report we get.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');

if (!fs.existsSync(THREE)) {
  console.error(`
  Three.js is not installed yet — the game cannot load without it.

  In this folder run:
      npm install
  then start it again:
      npm start

  (If you are offline, npm install needs network access once.)
`);
  process.exit(1);
}

const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs'), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(0);          // Ctrl+C
  process.exit(code ?? 0);
});

// Printed after the server has had a moment to announce its URL.
setTimeout(() => {
  if (process.env.STREET_EMPIRE_QUIET) return;
  console.log(`  If the browser shows a blank page or an error panel:
    • hard-reload the page:      Ctrl+F5   (Cmd+Shift+R on macOS)
    • make sure the URL matches the "running at" line above
    • an error panel on the page names the exact problem and the fix
`);
}, 1500);
