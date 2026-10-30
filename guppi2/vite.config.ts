import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * GUPPI Mobile's Content Security Policy, also written into the built page as a
 * <meta> tag so hosts that cannot send headers (GitHub Pages) still enforce it.
 * The PC's phone server and the Cloudflare relay send the same policy as a
 * header. Build only: Vite's dev client needs inline scripts.
 */
export const MOBILE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'none'";
const cspMeta = (): Plugin => ({
  name: 'guppi-csp-meta',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (_html, ctx) => (ctx.filename.endsWith('mobile.html') ? [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: MOBILE_CSP }, injectTo: 'head-prepend' }] : []),
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    // Desktop cockpit + GUPPI Mobile (served by the PC's phone remote and GitHub Pages).
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), mobile: fileURLToPath(new URL('./mobile.html', import.meta.url)) } },
  },
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
