import { createDb, type Db } from '@identizen/db';
import { fromHex, keyPairFromPrivateKey, type KeyPair } from '@identizen/protocol';
import type { Env } from '../env';
import { createPushSender, type PushSender } from '../push';

/** Per-request service bundle. Built once per request in `app.ts`. */
export interface Services {
  env: Env;
  db: Db;
  push: PushSender;
  /** Index Ed25519 signing key (challenges, pairings). */
  indexKey: KeyPair;
  indexUrl: string;
  appUrl: string;
  now: () => number;
  /** Register background work that must finish before the DB pool closes. */
  defer: (work: Promise<unknown>) => void;
  close: () => Promise<void>;
}

export function createServices(env: Env): Services {
  const handle = createDb(env.HYPERDRIVE.connectionString, { max: 2 });
  const indexKey = keyPairFromPrivateKey(fromHex(requireEnv(env, 'INDEX_SIGNING_KEY')));
  const pending: Promise<unknown>[] = [];
  return {
    env,
    db: handle.db,
    push: createPushSender(env),
    indexKey,
    indexUrl: stripSlash(requireEnv(env, 'INDEX_URL')),
    appUrl: stripSlash(env.APP_URL || requireEnv(env, 'INDEX_URL')),
    now: () => Math.floor(Date.now() / 1000),
    defer: (work) => {
      pending.push(work.catch((err: unknown) => console.error('background task failed', err)));
    },
    close: async () => {
      await Promise.allSettled(pending);
      await handle.close();
    },
  };
}

function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`missing env ${key}`);
  return v;
}

const stripSlash = (u: string): string => u.replace(/\/+$/, '');
