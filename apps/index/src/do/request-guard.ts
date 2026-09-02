import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

const WINDOW_MS = 2 * 60_000;
/** Max signed requests per device per minute. */
const RATE_LIMIT_PER_MINUTE = 120;
/** Max challenge pushes per device per minute (push-bombing guard). */
const PUSH_LIMIT_PER_MINUTE = 10;

/**
 * Per-device guard: replay protection for `Idz-Signature` and rate limits.
 * Ephemeral coordination state only; nothing here outlives the two-minute window.
 */
export class RequestGuard extends DurableObject<Env> {
  private seen = new Map<string, number>();
  private requests: number[] = [];
  private pushes: number[] = [];
  private inbox: string[] = [];

  /** Returns false if `(timestamp, sig)` was already seen or the device exceeds its rate limit. */
  async check(timestamp: number, sig: string): Promise<boolean> {
    const now = Date.now();
    this.prune(now);
    const key = `${timestamp}:${sig}`;
    if (this.seen.has(key)) return false;
    if (this.requests.length >= RATE_LIMIT_PER_MINUTE) return false;
    this.seen.set(key, now);
    this.requests.push(now);
    await this.ctx.storage.setAlarm(now + WINDOW_MS);
    return true;
  }

  /** Returns false when the device has been pushed too often in the last minute. */
  async allowPush(): Promise<boolean> {
    const now = Date.now();
    this.prune(now);
    if (this.pushes.length >= PUSH_LIMIT_PER_MINUTE) return false;
    this.pushes.push(now);
    await this.ctx.storage.setAlarm(now + WINDOW_MS);
    return true;
  }

  /** Queue a challenge id for a device that polls instead of receiving pushes. */
  async enqueue(challengeId: string): Promise<void> {
    this.inbox.push(challengeId);
    if (this.inbox.length > 50) this.inbox.shift();
    await this.ctx.storage.setAlarm(Date.now() + WINDOW_MS);
  }

  /** Return and clear queued challenge ids. */
  drain(): string[] {
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  override async alarm(): Promise<void> {
    this.prune(Date.now());
    this.inbox = [];
    if (this.seen.size > 0 || this.requests.length > 0 || this.pushes.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + WINDOW_MS);
    }
  }

  private prune(now: number): void {
    for (const [k, t] of this.seen) if (now - t > WINDOW_MS) this.seen.delete(k);
    this.requests = this.requests.filter((t) => now - t < 60_000);
    this.pushes = this.pushes.filter((t) => now - t < 60_000);
  }
}
