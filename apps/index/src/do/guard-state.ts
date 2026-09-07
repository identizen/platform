/**
 * The RequestGuard's state and rules, separated from the Durable Object so they can be tested
 * against a plain storage map, including what survives a restart. Everything the guard knows
 * is written to storage on every change: a replayed signature, a spent push quota, or a queued
 * challenge must not come back or vanish because the object was evicted or redeployed.
 */

export const WINDOW_MS = 2 * 60_000;
/** Max signed requests per device per minute. */
export const RATE_LIMIT_PER_MINUTE = 120;
/** Max challenge pushes per device per minute (push-bombing guard). */
export const PUSH_LIMIT_PER_MINUTE = 10;
/** Queued challenge ids kept per device. */
export const INBOX_LIMIT = 50;

export interface GuardRecord {
  /** `${timestamp}:${sig}` -> when it was first seen. */
  seen: [string, number][];
  requests: number[];
  pushes: number[];
  buckets: Record<string, number[]>;
  inbox: string[];
}

export interface GuardStorage {
  get(key: string): Promise<GuardRecord | undefined>;
  put(key: string, value: GuardRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

export const GUARD_KEY = 'guard';

function fresh(): GuardRecord {
  return { seen: [], requests: [], pushes: [], buckets: {}, inbox: [] };
}

export class GuardState {
  private record: GuardRecord | null = null;

  constructor(
    private readonly storage: GuardStorage,
    private readonly clock: () => number = Date.now,
  ) {}

  private async load(): Promise<GuardRecord> {
    if (!this.record) this.record = (await this.storage.get(GUARD_KEY)) ?? fresh();
    return this.record;
  }

  private async save(r: GuardRecord): Promise<void> {
    this.record = r;
    await this.storage.put(GUARD_KEY, r);
  }

  private prune(r: GuardRecord, now: number): void {
    r.seen = r.seen.filter(([, t]) => now - t <= WINDOW_MS);
    r.requests = r.requests.filter((t) => now - t < 60_000);
    r.pushes = r.pushes.filter((t) => now - t < 60_000);
    r.buckets = Object.fromEntries(
      Object.entries(r.buckets)
        .map(([name, events]) => [name, events.filter((t) => now - t < 60_000)] as const)
        .filter(([, events]) => events.length > 0),
    );
  }

  /** False if `(timestamp, sig)` was already seen or the device exceeds its rate limit. */
  async check(timestamp: number, sig: string): Promise<boolean> {
    const now = this.clock();
    const r = await this.load();
    this.prune(r, now);
    const key = `${timestamp}:${sig}`;
    if (r.seen.some(([k]) => k === key)) {
      await this.save(r);
      return false;
    }
    if (r.requests.length >= RATE_LIMIT_PER_MINUTE) {
      await this.save(r);
      return false;
    }
    r.seen.push([key, now]);
    r.requests.push(now);
    await this.save(r);
    return true;
  }

  /** False when the device has been pushed too often in the last minute. */
  async allowPush(): Promise<boolean> {
    const now = this.clock();
    const r = await this.load();
    this.prune(r, now);
    if (r.pushes.length >= PUSH_LIMIT_PER_MINUTE) {
      await this.save(r);
      return false;
    }
    r.pushes.push(now);
    await this.save(r);
    return true;
  }

  /** Sliding-window limiter: at most `limit` events per minute for `bucket`. */
  async allowRate(bucket: string, limit: number): Promise<boolean> {
    const now = this.clock();
    const r = await this.load();
    this.prune(r, now);
    const events = r.buckets[bucket] ?? [];
    if (events.length >= limit) {
      await this.save(r);
      return false;
    }
    events.push(now);
    r.buckets[bucket] = events;
    await this.save(r);
    return true;
  }

  /** Queue a challenge id for the device's inbox (idempotent per id, bounded). */
  async enqueue(challengeId: string): Promise<void> {
    const r = await this.load();
    if (r.inbox.includes(challengeId)) return;
    r.inbox.push(challengeId);
    if (r.inbox.length > INBOX_LIMIT) r.inbox.shift();
    await this.save(r);
  }

  /** Return and clear queued challenge ids. */
  async drain(): Promise<string[]> {
    const r = await this.load();
    if (r.inbox.length === 0) return [];
    const out = r.inbox;
    r.inbox = [];
    await this.save(r);
    return out;
  }

  /**
   * Periodic sweep: drop what has aged out. Returns true when something is still live and the
   * next sweep should be scheduled, false when storage was emptied.
   */
  async sweep(): Promise<boolean> {
    const now = this.clock();
    const r = await this.load();
    this.prune(r, now);
    const live =
      r.seen.length > 0 ||
      r.requests.length > 0 ||
      r.pushes.length > 0 ||
      Object.keys(r.buckets).length > 0 ||
      r.inbox.length > 0;
    if (live) {
      await this.save(r);
      return true;
    }
    this.record = null;
    await this.storage.delete(GUARD_KEY);
    return false;
  }
}
