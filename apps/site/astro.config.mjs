// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { ORIGIN, WORKER_DEV } from './src/lib/site';

export default defineConfig({
  site: ORIGIN,
  output: 'static',

  // Extensionless, trailing-slash-free URLs (`/privacy`): `format: 'file'` emits
  // `privacy.html`, which Workers' `auto-trailing-slash` handling serves at exactly that URL.
  build: { format: 'file' },
  trailingSlash: 'never',

  // No integrations: every page here is static HTML. `/` is the app shell — the
  // SPA bundle is built by apps/worker, not here.

  vite: {
    plugins: [tailwindcss()],
    // The middleware below redirects anything this site 404s to the Worker, which
    // is right for a navigation but loses a request body: a 302 downgrades POST
    // to GET, and Astro hands middleware a bodyless stub request for prerendered
    // routes anyway, so it cannot forward one itself. These are proxied at the
    // dev server instead, where the body is still intact.
    server: { proxy: { '^/(f|api)(/.*)?$': { target: WORKER_DEV, changeOrigin: true } } },
  },
});
