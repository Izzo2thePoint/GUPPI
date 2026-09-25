import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'renderer', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    // Browser development: /game/* is forwarded to the real game API.
    proxy: {
      '/game': {
        target: 'https://neumann-probe.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/game/, ''),
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
