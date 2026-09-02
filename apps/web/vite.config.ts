import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const mock = process.env.VITE_IDENTIZEN_MOCK === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The MSW mock worker and the PWA service worker cannot share a scope.
      disable: mock,
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Identizen',
        short_name: 'Identizen',
        description: 'Your devices, paired browsers, and sessions.',
        theme_color: '#1a1c23',
        background_color: '#fafbfc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/l\//],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 4300, strictPort: true },
  preview: { port: 4301, strictPort: true },
});
