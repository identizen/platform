import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}-{platform}{ext}',
  updateSnapshots: 'missing',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: 'http://localhost:4301',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4301 --strictPort',
    url: 'http://localhost:4301',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_IDENTIZEN_MOCK: '1',
      VITE_IDENTIZEN_INDEX_URL: 'http://localhost:8787',
      VITE_IDENTIZEN_CLIENT_ID: 'idz_test_dashboard',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
