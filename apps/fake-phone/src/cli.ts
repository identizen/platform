#!/usr/bin/env node
/**
 * identizen-fake-phone --index http://localhost:8787 --port 4400 --policy approve [--state ./phone.json]
 * Environment fallbacks: INDEX_URL, FAKE_PHONE_PORT, FAKE_PHONE_POLICY, FAKE_PHONE_STATE, FAKE_PHONE_URL, FAKE_PHONE_HANDLE
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FakePhone, type PhoneState, type Policy } from './phone';
import { startPhoneServer } from './server';

function arg(name: string, fallback: string | undefined): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const indexUrl = arg('index', process.env.INDEX_URL) ?? 'http://localhost:8787';
const port = Number(arg('port', process.env.FAKE_PHONE_PORT) ?? 4400);
const policy = (arg('policy', process.env.FAKE_PHONE_POLICY) ?? 'approve') as Policy;
const statePath = arg('state', process.env.FAKE_PHONE_STATE);
const publicUrl = arg('url', process.env.FAKE_PHONE_URL) ?? `http://localhost:${port}`;
const handle = arg('handle', process.env.FAKE_PHONE_HANDLE) ?? null;
const poll = process.argv.includes('--poll') || process.env.FAKE_PHONE_POLL === 'true';

let state: PhoneState | null = null;
if (statePath && existsSync(statePath)) {
  state = JSON.parse(readFileSync(statePath, 'utf8')) as PhoneState;
}

const phone = new FakePhone({
  indexUrl,
  pushUrl: poll ? null : publicUrl,
  policy,
  state,
  handle,
  poll,
  onStateChange: (s) => {
    if (!statePath) return;
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(s, null, 2));
  },
});

const server = startPhoneServer({ phone, port });
console.info(`fake phone listening on ${publicUrl} (index ${indexUrl}, policy ${policy})`);

// Register once the index is reachable; retry so `identizen dev` can start everything at once.
async function registerWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const s = await phone.register();
      console.info(`registered device ${s.deviceId ?? ''} for identity ${s.idz ?? ''}`);
      return;
    } catch (err) {
      if (attempt === 0) console.info(`waiting for index at ${indexUrl}… (${String(err)})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.error('could not register with the index');
}
void registerWithRetry();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
