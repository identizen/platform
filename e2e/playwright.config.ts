import { defineConfig, devices } from '@playwright/test';

export const INDEX_URL = 'http://localhost:8787';
export const PHONE_URL = 'http://localhost:4400';
export const SITE_URL = 'http://localhost:3000';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: SITE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:e2e -w @identizen/index -- --port 8787',
      url: `${INDEX_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: DATABASE_URL,
        WRANGLER_SEND_METRICS: 'false',
      },
    },
    {
      command:
        'npm run dev -w @identizen/fake-phone -- --index http://localhost:8787 --port 4400 --url http://localhost:4400',
      url: `${PHONE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @identizen/e2e-site -- --port 3000',
      url: `${SITE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { IDENTIZEN_INDEX_URL: INDEX_URL, SITE_URL, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
