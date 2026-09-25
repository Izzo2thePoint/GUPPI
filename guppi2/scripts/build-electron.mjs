import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'build/electron/main.cjs' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'build/electron/preload.cjs' });
