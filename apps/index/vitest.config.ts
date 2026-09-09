import { readFileSync } from 'node:fs';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { fromHex, keyPairFromPrivateKey, signRotation, toBase64Url } from '@identizen/protocol';

const oidcKeys = readFileSync(new URL('./test/oidc-keys.json', import.meta.url), 'utf8');

/**
 * The test index signs with key 0x40..5f and publishes one rotation statement, signed by the
 * key it "retired" (0x41 repeated), so the suite can prove a phone pinned to the old key walks
 * to the current one (PROTOCOL.md §3.1).
 */
const INDEX_SIGNING_KEY = '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f';
const RETIRED_INDEX_KEY = '41'.repeat(32);
const retired = keyPairFromPrivateKey(fromHex(RETIRED_INDEX_KEY));
const current = keyPairFromPrivateKey(fromHex(INDEX_SIGNING_KEY));
const rotations = JSON.stringify([
  signRotation(
    {
      type: 'rotation',
      index: 'http://index.test',
      prev_pubkey: toBase64Url(retired.publicKey),
      next_pubkey: toBase64Url(current.publicKey),
      iat: 1_756_560_000,
    },
    retired.privateKey,
  ),
  { type: 'not-a-rotation' },
]);

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/global-setup.ts'],
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['@readme/openapi-parser', 'yaml'],
        },
      },
    },
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
            OUTBOUND_ALLOW_LOCAL: 'true',
            SITE_VERIFICATION: 'off',
            DASHBOARD_CLIENT_IDS: '*',
            RATE_LIMIT_CHALLENGES_PER_CLIENT: '40',
            RATE_LIMIT_REQUESTS_PER_IP: '12',
            INDEX_SIGNING_KEY,
            INDEX_KEY_ROTATIONS: rotations,
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
