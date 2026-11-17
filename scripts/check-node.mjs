// Preflight check: fail with a readable message instead of a cryptic Vite error
// when the installed Node version is too old for this toolchain.
// The bundled static server only needs Node 18; Vite (optional, for the fast
// dev server) needs 20.19+. We therefore only hard-fail on really old Node.
export const REQUIRED = '>=18.0.0';

const [major, minor] = process.versions.node.split('.').map(Number);
const ok = major >= 18;

if (!ok) {
  console.error(`
  STREET EMPIRE cannot start on Node ${process.versions.node}.

  Required: Node ${REQUIRED}
  Found:    Node ${process.versions.node}

  Fix: install a current LTS release from https://nodejs.org
       or, with nvm:  nvm install --lts && nvm use --lts
`);
  process.exit(1);
}
