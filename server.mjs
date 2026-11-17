// ============================================================
// Zero-dependency static server / browser launcher.
//
//   node server.mjs               → serves the game on http://localhost:5173
//   node server.mjs --port 8080   → custom port
//   node server.mjs --no-open     → don't try to open a browser
//   node server.mjs --help
//
// It maps the bare module specifiers that the source uses ("three",
// "three/addons/…") onto files inside node_modules, so the game runs with no
// bundler, no build step and no Vite — only `npm install`.
//
// If the chosen port is taken (a stale server from an earlier run is the usual
// reason) it automatically falls through to the next free port instead of
// exiting, and prints which URL it ended up on.
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------ cli ---------
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const REQUESTED_PORT = portArg >= 0
  ? Number(args[portArg + 1])
  : Number(process.env.PORT || 5173);
const OPEN = !args.includes('--no-open');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  STREET EMPIRE — local server

    node server.mjs                 http://localhost:5173
    node server.mjs --port 8080     serve on another port
    node server.mjs --no-open       do not open a browser
    node server.mjs --help          this text

  Needs: Node 18+ and a completed "npm install" in this folder.
`);
  process.exit(0);
}

if (!Number.isInteger(REQUESTED_PORT) || REQUESTED_PORT < 0 || REQUESTED_PORT > 65535) {
  console.error(`\n  Invalid port: ${args[portArg + 1] || process.env.PORT}\n  Try: node server.mjs --port 5173\n`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

// ------------------------------------------------- three resolution -------
// three's package "exports" map → on-disk paths
function resolveThree(sub) {
  const threeDir = path.join(ROOT, 'node_modules', 'three');
  if (!sub || sub === 'three') return path.join(threeDir, 'build', 'three.module.js');
  // sibling chunks that three.module.js imports relatively (./three.core.js …)
  if (/^three\.[a-z0-9-]+\.js$/.test(sub)) return path.join(threeDir, 'build', sub);
  if (sub.startsWith('three/addons/')) {
    return path.join(threeDir, 'examples', 'jsm', sub.slice('three/addons/'.length));
  }
  if (sub.startsWith('three/examples/jsm/')) return path.join(threeDir, sub.slice('three/'.length));
  if (sub.startsWith('three/src/')) return path.join(threeDir, sub.slice('three/'.length));
  return null;
}

// Rewrite bare specifiers in served JS so the browser can load them natively.
// Module clauses only, so ordinary text inside strings or comments is never
// touched (a naive /import\s*\(?["']/ pattern mangles shader source strings).
function rewriteModuleSpecifiers(source) {
  if (!source.includes('three')) return source; // fast path: nothing to map
  return source
    // import … from 'three'   /   export … from 'three/addons/x.js'
    .replace(/(\b(?:import|export)\b[^;'"]*?\bfrom\s*)(['"])(three(?:\/[^'"]+)?)\2/g,
      (m, pre, q, spec) => `${pre}${q}${spec === 'three' ? '/three.module.js' : '/' + spec}${q}`)
    // import 'three'  /  import('three')
    .replace(/(\bimport\s*\(\s*|^\s*import\s+)(['"])(three(?:\/[^'"]+)?)\2/gm,
      (m, pre, q, spec) => `${pre}${q}${spec === 'three' ? '/three.module.js' : '/' + spec}${q}`)
    // relative chunks inside three's build folder
    .replace(/(\bfrom\s*)(['"])\.\/(three\.[a-z0-9-]+\.js)\2/g,
      (m, pre, q, file) => `${pre}${q}/${file}${q}`);
}

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  const rel = path.relative(base, p);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return p;
}

// three's build files are the only big ones and never change during a run.
const threeCache = new Map();
function threeFile(file) {
  if (!threeCache.has(file)) {
    threeCache.set(file, rewriteModuleSpecifiers(fs.readFileSync(file, 'utf8')));
  }
  return threeCache.get(file);
}

function send(res, status, type, body, head) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache' });
  if (head) res.end();
  else res.end(body);
}

const NOT_FOUND = 'not found';

// ------------------------------------------------- request handler --------
function handle(req, res) {
  const head = req.method === 'HEAD';
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'text/plain; charset=utf-8', 'bad request', head);
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/favicon.ico' && !fs.existsSync(path.join(ROOT, 'favicon.ico'))) {
    res.writeHead(204).end();
    return;
  }

  // --- module aliases ----------------------------------------------------
  if (urlPath === '/three.module.js' || /^\/three\.[a-z0-9-]+\.js$/.test(urlPath) || urlPath.startsWith('/three/')) {
    const spec = urlPath === '/three.module.js' ? 'three'
      : urlPath.startsWith('/three/') ? 'three/' + urlPath.slice('/three/'.length)
        : urlPath.slice(1);
    const file = resolveThree(spec);
    try {
      if (!file || !fs.existsSync(file)) throw new Error(NOT_FOUND);
      send(res, 200, MIME['.js'], threeFile(file), head);
    } catch {
      send(res, 404, 'text/plain; charset=utf-8',
        `Cannot serve "${spec}".\n\nnode_modules/three is missing or incomplete — run:  npm install\n`, head);
    }
    return;
  }

  const file = safeJoin(ROOT, urlPath);
  if (!file) {
    send(res, 403, 'text/plain; charset=utf-8', 'forbidden', head);
    return;
  }

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    stat = null;
  }
  if (!stat || stat.isDirectory()) {
    send(res, 404, 'text/plain; charset=utf-8', `404 — ${urlPath}`, head);
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const isJs = ext === '.js' || ext === '.mjs';
  try {
    const body = isJs
      ? rewriteModuleSpecifiers(fs.readFileSync(file, 'utf8'))
      : fs.readFileSync(file);
    send(res, 200, MIME[ext] || 'application/octet-stream', body, head);
  } catch (err) {
    // a locked file (antivirus / editor on Windows) must not kill the server
    send(res, 500, 'text/plain; charset=utf-8', `Cannot read ${urlPath}: ${err.message}`, head);
  }
}

function makeServer() {
  return http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error('  request failed:', req.url, err && err.message);
      try { send(res, 500, 'text/plain; charset=utf-8', 'internal error'); } catch { /* client gone */ }
    }
  });
}

// ------------------------------------------------- self check ------------
// Walk the module graph on disk once, the way the browser would, and report
// anything that would leave the page blank. Printed at startup so a blank
// page has a named cause instead of "the browser console said nothing".
function gatherModules() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

function moduleSpecifiers(src) {
  const specs = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) specs.push(m[1]);
  }
  return specs;
}

// Returns a list of human-readable problems; empty means "looks fine".
function selfCheck() {
  const problems = [];
  const threeDir = path.join(ROOT, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js'))) {
    problems.push('node_modules/three is missing → run: npm install');
    return problems;
  }
  for (const file of gatherModules()) {
    const rel = path.relative(ROOT, file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch (e) { problems.push(`${rel}: unreadable (${e.message})`); continue; }
    let mod;
    try {
      mod = new vm.SourceTextModule(src, { identifier: rel });
      mod.moduleSpecifiers; // eslint-disable-line no-unused-expressions
    } catch (e) {
      if (e instanceof SyntaxError) { problems.push(`${rel}: syntax error — ${e.message}`); continue; }
      // no --experimental-vm-modules: cheap structural check only
      mod = null;
    }
    for (const spec of moduleSpecifiers(src)) {
      if (spec.startsWith('data:') || spec.startsWith('node:') || spec.startsWith('http')) continue;
      // CSS first: "./ui/styles.css" also looks relative, but a JS import of it
      // is a bundler-only feature and aborts the module graph in a browser.
      if (spec.endsWith('.css')) {
        problems.push(`${rel}: imports CSS ("${spec}") — browsers cannot load CSS from JavaScript without a bundler; link it in index.html instead`);
      } else if (spec === 'three' || spec.startsWith('three/')) {
        if (!fs.existsSync(resolveThree(spec))) problems.push(`${rel}: cannot resolve "${spec}"`);
      } else if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(target)) problems.push(`${rel}: missing file "${spec}" — the import cannot load`);
      } else if (!spec.startsWith('/')) {
        problems.push(`${rel}: bare specifier "${spec}" cannot be served without a bundler`);
      }
    }
  }
  return problems;
}

// ------------------------------------------------- browser launcher -------
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
      : 'xdg-open';
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch { /* no browser / headless: the URL is printed anyway */ }
}

// ------------------------------------------------- listen with fallback ---
function tryListen(port) {
  return new Promise((resolve, reject) => {
    const server = makeServer();
    const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(server); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

const candidates = [];
for (let i = 0; i < 10; i++) candidates.push(REQUESTED_PORT + i);
if (REQUESTED_PORT === 0) candidates.length = 1; // let the OS choose

let server = null;
let PORT = REQUESTED_PORT;

for (const candidate of candidates) {
  try {
    server = await tryListen(candidate);
    PORT = server.address().port;
    break;
  } catch (err) {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      if (candidate === REQUESTED_PORT) {
        console.log(`\n  Port ${candidate} is already in use (a server from an earlier run?).`);
        console.log('  Looking for a free port…');
      }
      continue;
    }
    console.error(`\n  Cannot start the server: ${err.message}\n`);
    process.exit(1);
  }
}

if (!server) {
  console.error(`
  No free port found around ${REQUESTED_PORT}.

  Close the other server, or pick a port yourself:
      node server.mjs --port ${REQUESTED_PORT + 20}
`);
  process.exit(1);
}

const url = `http://localhost:${PORT}/`;
console.log(`
  STREET EMPIRE — SAN VELOR
  running at ${url}
  (press Ctrl+C to stop)
`);

const problems = selfCheck();
if (problems.length) {
  console.log(`  This copy has ${problems.length} problem(s) that will stop the game from loading:`);
  for (const p of problems.slice(0, 12)) console.log('    • ' + p);
  if (problems.length > 12) console.log(`    … and ${problems.length - 12} more`);
  console.log('');
} else {
  console.log('  Self-check: module graph OK.\n');
}
if (OPEN) openBrowser(url);

// Ctrl+C / window close: exit quietly, this is not a crash
const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
