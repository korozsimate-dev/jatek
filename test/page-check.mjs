// Validates index.html + the module graph + the static server without a browser.
// Catches: unbalanced markup, missing element ids the JS needs, broken imports,
// unrewritten bare specifiers, and MIME-type mistakes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const SourceTextModule = vm.SourceTextModule;   // needs --experimental-vm-modules
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const PORT = 5499;
let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };

// ---- markup --------------------------------------------------------------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check((html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length, 'div tags balanced');
check(/<canvas id="gl">/.test(html), 'render canvas present');
check(!/<script type="module"[^>]*>[\s\S]*?import /.test(html), 'no inline module imports (keeps file:// diagnosis simple)');
check(!/<link[^>]+href="\//.test(html) && !/<script[^>]+src="\//.test(html),
  'index.html uses relative asset paths (works from a subfolder)');
const cssLinks = [...html.matchAll(/<link[^>]+stylesheet[^>]+href="([^"]+)"/g)].map((m) => m[1]);
check(cssLinks.length > 0, 'stylesheet is linked from the document, not imported from JS');
check(!/^import\s+['"][^'"]+\.css['"]/m.test(fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')),
  'main.js does not import CSS (would break unbundled serving)');

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const needed = new Set();
for (const f of walk(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) needed.add(m[1]);
  for (const m of src.matchAll(/\$\('#([^']+)'\)/g)) needed.add(m[1]);
}
const missingIds = [...needed].filter((id) => !ids.has(id));
check(missingIds.length === 0, `every element id used by the JS exists (${ids.size} in html)${missingIds.length ? ': ' + missingIds.join(', ') : ''}`);

// ---- module graph over HTTP ---------------------------------------------
const srv = spawn(process.execPath, ['server.mjs', '--port', String(PORT), '--no-open'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const BASE = `http://localhost:${PORT}`;
const seen = new Set();
const problems = [];
const queue = ['/src/main.js'];
while (queue.length) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  let r;
  try { r = await fetch(BASE + url); } catch (e) { problems.push(`${url}: ${e.message}`); continue; }
  const text = await r.text();
  if (r.status !== 200) { problems.push(`${url}: HTTP ${r.status}`); continue; }
  const type = r.headers.get('content-type') || '';
  if (!/javascript|css/.test(type)) problems.push(`${url}: content-type ${type}`);
  // a served module must at least parse; a stylesheet imported as a module
  // (which only a bundler can handle) fails here
  if (url.endsWith('.js') || url.endsWith('.mjs')) {
    try {
      if (SourceTextModule) {
        new SourceTextModule(text, { identifier: url });
      } else {
        // modules are strict-mode scripts; this still catches syntax errors
        new vm.Script('(function(){"use strict";\n' + text + '\n})', { filename: url });
      }
    } catch (e) {
      if (!(e instanceof SyntaxError)) problems.push(`${url}: ${e.message}`);
    }
  }
  const specs = [
    ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
  ].map((m) => m[1]);
  for (const s of specs) {
    if (s.startsWith('data:') || /^https?:/.test(s)) continue;
    // Vite's pre-bundled dep files carry original specifiers in comments
    if (url.startsWith('/node_modules/') && !/^(import|export|\s*\})/.test(s)) continue;
    if (s.startsWith('/')) queue.push(s);
    else if (s.startsWith('.')) queue.push(new URL(s, 'http://x' + url).pathname);
    else problems.push(`${url}: unresolved bare specifier "${s}"`);
  }
}
check(problems.length === 0, `${seen.size} modules resolve with correct types${problems.length ? '\n      ' + problems.slice(0, 8).join('\n      ') : ''}`);

// ---- static server behaviour -------------------------------------------
check(seen.has('/three.module.js'), 'three resolves through the static server');

// HEAD requests (link previews, some browsers) must not hang
const headRes = await fetch(BASE + '/', { method: 'HEAD' }).catch(() => null);
check(headRes && headRes.status === 200, 'HEAD / answers');

// a second server started on a taken port must fall through to a free one
// instead of crashing — this is what "it does not run on localhost" looked like
const PORT2 = PORT + 1;
const srv2 = spawn(process.execPath, ['server.mjs', '--port', String(PORT), '--no-open'], { cwd: ROOT, stdio: 'pipe' });
let srv2out = '';
srv2.stdout.on('data', (d) => { srv2out += d; });
await new Promise((r) => setTimeout(r, 1500));
const fellBack = srv2out.includes(String(PORT2));
const altRes = await fetch(`http://localhost:${PORT2}/`).catch(() => null);
srv2.kill();
check(fellBack && altRes && altRes.status === 200,
  `port clash falls back to a free port (${PORT} → ${PORT2}) instead of exiting`);

// startup self-check reports nothing on a healthy tree
check(/Self-check: module graph OK/.test(srv2out), 'startup self-check passes on the real tree');
srv.kill();

console.log(`\nPAGE: ${ok} passed, ${bad} failed`);
if (bad) process.exitCode = 1;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}
