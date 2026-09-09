// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
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
});
