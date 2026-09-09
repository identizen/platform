// @ts-check
import { createHash } from 'node:crypto';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { THEME_INIT_SCRIPT } from '@identizen/ui/theme';

/** CSP hash source for an inline script rendered verbatim. */
const sha256 = (source) => `sha256-${createHash('sha256').update(source).digest('base64')}`;
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://identizen.com',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/api/') && !page.endsWith('/404/'),
      changefreq: 'weekly',
      lastmod: new Date(),
    }),
  ],
  vite: {
    resolve: { alias: { 'react-dom/server': 'react-dom/server.edge' } },
    plugins: [tailwindcss()],
    ssr: { noExternal: ['@identizen/ui'] },
  },
  build: { inlineStylesheets: 'auto' },
  // Astro 7 defaults to JSX whitespace rules; keep the lossless output the pages were written for.
  compressHTML: true,
  prefetch: { prefetchAll: true },
  // No server sessions: keeps the adapter from wiring a SESSION KV namespace into the Worker.
  session: false,
  // Hash-based CSP (F08): Astro hashes every script and stylesheet it emits; Turnstile is the one
  // external script and frame, the playground talks to the index, and React islands set inline
  // style attributes. Frame-ancestors and the rest of the header baseline live in public/_headers.
  security: {
    csp: {
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com'],
        // The theme-init script is rendered inline by Base.astro (is:inline, so Astro does not
        // hash it); scripts/check-csp.mjs fails the build if this ever stops matching.
        hashes: [sha256(THEME_INIT_SCRIPT)],
      },
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
      directives: [
        "default-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://*.identizen.com",
        'frame-src https://challenges.cloudflare.com',
        "form-action 'self'",
        "base-uri 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
      ],
    },
  },
});
