import { readFileSync } from 'node:fs';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const oidcKeys = readFileSync(new URL('./test/oidc-keys.json', import.meta.url), 'utf8');

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/global-setup.ts'],
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            INDEX_URL: 'http://index.test',
            APP_URL: 'http://app.test',
            PUSH_PROVIDER: 'noop',
            OPEN_SITE_REGISTRATION: 'true',
            DASHBOARD_CLIENT_IDS: '*',
            RATE_LIMIT_CHALLENGES_PER_CLIENT: '40',
            RATE_LIMIT_REQUESTS_PER_IP: '12',
            INDEX_SIGNING_KEY: '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f',
            OIDC_SIGNING_KEYS: oidcKeys,
          },
          hyperdrives: {
            HYPERDRIVE:
              process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen',
          },
        },
      },
    },
  },
});
