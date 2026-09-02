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
  integrations: [react(), sitemap()],
  vite: {
    resolve: { alias: { 'react-dom/server': 'react-dom/server.edge' } },
    plugins: [tailwindcss()],
    ssr: { noExternal: ['@identizen/ui'] },
  },
  build: { inlineStylesheets: 'auto' },
  prefetch: { prefetchAll: true },
});
