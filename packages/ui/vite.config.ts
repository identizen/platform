import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'demo',
  plugins: [react(), tailwindcss()],
  server: { port: 4310, strictPort: true },
  preview: { port: 4310, strictPort: true },
  build: { outDir: '../dist-demo', emptyOutDir: true },
});
