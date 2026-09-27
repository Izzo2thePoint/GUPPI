// Builds GUPPI Mobile and copies it to ./public, where wrangler serves it as the
// relay's static site. Run automatically by `npx wrangler deploy`.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../guppi2/', import.meta.url));
const out = fileURLToPath(new URL('./public/', import.meta.url));
const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });

if (!fs.existsSync(`${app}node_modules`)) run('pnpm install --frozen-lockfile');
run('pnpm run build:renderer');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(`${app}renderer`, out, { recursive: true });
// The site opens straight into the phone app.
fs.copyFileSync(`${out}mobile.html`, `${out}index.html`);
fs.copyFileSync(fileURLToPath(new URL('./_headers', import.meta.url)), `${out}_headers`);
console.log('GUPPI Mobile built into relay/public');
