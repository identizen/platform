import type { PairingStorage, StoredPairing } from './types.js';

const DB_NAME = 'identizen';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve((tx.result as T | undefined) ?? null);
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB get failed'));
  });
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const tx = value === null ? store.delete(key) : store.put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
  });
}

/**
 * Browser storage: the non-extractable P-256 key lives in IndexedDB (the only place a CryptoKey
 * can be persisted); the pairing record sits next to it. Everything is per origin.
 */
export function browserStorage(): PairingStorage {
  return {
    getKey: () => kvGet<CryptoKeyPair>('browserKey').catch(() => null),
    setKey: (key) => kvSet('browserKey', key).catch(() => undefined),
    getPairing: () => kvGet<StoredPairing>('pairing').catch(() => null),
    setPairing: (p) => kvSet('pairing', p).catch(() => undefined),
  };
}

/** In-memory storage for tests and non-browser hosts. */
export function memoryStorage(
  initial: { key?: CryptoKeyPair | null; pairing?: StoredPairing | null } = {},
): PairingStorage & {
  key: CryptoKeyPair | null;
  pairing: StoredPairing | null;
} {
  const s = {
    key: initial.key ?? null,
    pairing: initial.pairing ?? null,
    getKey: () => Promise.resolve(s.key),
    setKey: (k: CryptoKeyPair) => {
      s.key = k;
      return Promise.resolve();
    },
    getPairing: () => Promise.resolve(s.pairing),
    setPairing: (p: StoredPairing | null) => {
      s.pairing = p;
      return Promise.resolve();
    },
  };
  return s;
}
