import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
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
