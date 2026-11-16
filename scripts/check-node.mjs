// Preflight check: fail with a readable message instead of a cryptic Vite error
// when the installed Node version is too old for this toolchain.
export const REQUIRED = '^20.19.0 || >=22.12.0';

const [major, minor] = process.versions.node.split('.').map(Number);
const ok = (major === 20 && minor >= 19) || major > 20;

if (!ok) {
  console.error(`
  STREET EMPIRE cannot start on Node ${process.versions.node}.

  Required: Node ${REQUIRED}
  Found:    Node ${process.versions.node}

  Vite 8 (the dev server this project uses) refuses to run on older versions,
  which is why the startup fails with an unclear error.

  Fix: install a current LTS release from https://nodejs.org
       or, with nvm:  nvm install --lts && nvm use --lts
`);
  process.exit(1);
}
