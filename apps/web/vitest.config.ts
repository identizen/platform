import { defineConfig } from 'vitest/config';

// Feature tests live in @identizen/dashboard; this app only tests its own shell and deploy files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
