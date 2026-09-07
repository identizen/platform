/**
 * The request guard's state survives the object being rebuilt (review S04): a replayed
 * signature stays replayed, a spent push quota stays spent, and a queued challenge is still in
 * the inbox when a fresh GuardState is built over the same storage.
 */
import { describe, expect, it } from 'vitest';
import {
  GuardState,
  GUARD_KEY,
  INBOX_LIMIT,
  PUSH_LIMIT_PER_MINUTE,
  WINDOW_MS,
  type GuardRecord,
  type GuardStorage,
} from '../src/do/guard-state';

function memoryStorage(): GuardStorage & { map: Map<string, GuardRecord> } {
  const map = new Map<string, GuardRecord>();
  return {
    map,
    get: async (k) => {
      const v = map.get(k);
      return v ? (JSON.parse(JSON.stringify(v)) as GuardRecord) : undefined;
    },
    put: async (k, v) => {
      map.set(k, JSON.parse(JSON.stringify(v)) as GuardRecord);
    },
    delete: async (k) => {
      map.delete(k);
    },
  };
}

describe('GuardState', () => {
  it('a replayed signature is refused by a rebuilt guard over the same storage', async () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const first = new GuardState(storage, () => now);
    expect(await first.check(now, 'sig-a')).toBe(true);
    expect(await first.check(now, 'sig-a')).toBe(false);
    const rebuilt = new GuardState(storage, () => now);
    expect(await rebuilt.check(now, 'sig-a')).toBe(false);
    expect(await rebuilt.check(now, 'sig-b')).toBe(true);
    now += WINDOW_MS + 1;
    expect(await new GuardState(storage, () => now).check(now, 'sig-a')).toBe(true);
  });

  it('the push quota and rate buckets are spent across rebuilds and recover after a minute', async () => {
    const storage = memoryStorage();
    let now = 5_000_000;
    const g = new GuardState(storage, () => now);
    for (let i = 0; i < PUSH_LIMIT_PER_MINUTE; i++) expect(await g.allowPush()).toBe(true);
    expect(await new GuardState(storage, () => now).allowPush()).toBe(false);
    expect(await g.allowRate('ip', 2)).toBe(true);
    expect(await g.allowRate('ip', 2)).toBe(true);
    expect(await new GuardState(storage, () => now).allowRate('ip', 2)).toBe(false);
    now += 60_001;
    expect(await new GuardState(storage, () => now).allowPush()).toBe(true);
    expect(await new GuardState(storage, () => now).allowRate('ip', 2)).toBe(true);
  });

  it('the inbox is durable, deduplicated, bounded, and drained exactly once', async () => {
    const storage = memoryStorage();
    const g = new GuardState(storage);
    await g.enqueue('ch_1');
    await g.enqueue('ch_1');
    await g.enqueue('ch_2');
    expect(await new GuardState(storage).drain()).toEqual(['ch_1', 'ch_2']);
    expect(await new GuardState(storage).drain()).toEqual([]);
    for (let i = 0; i < INBOX_LIMIT + 5; i++) await g.enqueue(`ch_${i}`);
    const all = await new GuardState(storage).drain();
    expect(all).toHaveLength(INBOX_LIMIT);
    expect(all[0]).toBe('ch_5');
  });

  it('the sweep keeps live state and empties storage once everything has aged out', async () => {
    const storage = memoryStorage();
    let now = 9_000_000;
    const g = new GuardState(storage, () => now);
    await g.check(now, 'sig');
    expect(await g.sweep()).toBe(true);
    expect(storage.map.has(GUARD_KEY)).toBe(true);
    now += WINDOW_MS + 1;
    expect(await g.sweep()).toBe(false);
    expect(storage.map.has(GUARD_KEY)).toBe(false);
  });
});
