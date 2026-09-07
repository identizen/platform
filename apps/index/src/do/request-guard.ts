import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { GuardState, WINDOW_MS, type GuardRecord } from './guard-state';

/**
 * Per-device guard: replay protection for `Idz-Signature`, rate limits, and the challenge inbox.
 * The state lives in Durable Object storage (see GuardState), so an eviction, a deploy, or a
 * restart neither reopens a replay window nor loses a queued challenge. The alarm sweeps aged
 * entries once per window.
 */
export class RequestGuard extends DurableObject<Env> {
  private readonly state = new GuardState({
    get: (key) => this.ctx.storage.get<GuardRecord>(key),
    put: (key, value) => this.ctx.storage.put(key, value),
    delete: async (key) => {
      await this.ctx.storage.delete(key);
    },
  });
  private armed = false;

  /** Schedule the sweep once per window instead of on every call (fewer timers). */
  private async arm(): Promise<void> {
    if (this.armed) return;
    this.armed = true;
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + WINDOW_MS);
    }
  }

  /** Returns false if `(timestamp, sig)` was already seen or the device exceeds its rate limit. */
  async check(timestamp: number, sig: string): Promise<boolean> {
    const ok = await this.state.check(timestamp, sig);
    await this.arm();
    return ok;
  }

  /** Returns false when the device has been pushed too often in the last minute. */
  async allowPush(): Promise<boolean> {
    const ok = await this.state.allowPush();
    await this.arm();
    return ok;
  }

  /**
   * Generic sliding-window limiter: at most `limit` events per minute for `bucket`.
   * The DO instance name scopes it (e.g. `client:<id>`, `ip:<addr>`).
   */
  async allowRate(bucket: string, limit: number): Promise<boolean> {
    const ok = await this.state.allowRate(bucket, limit);
    await this.arm();
    return ok;
  }

  /** Queue a challenge id for the device's inbox (every phone drains it; idempotent per id). */
  async enqueue(challengeId: string): Promise<void> {
    await this.state.enqueue(challengeId);
    await this.arm();
  }

  /** Return and clear queued challenge ids. */
  drain(): Promise<string[]> {
    return this.state.drain();
  }

  override async alarm(): Promise<void> {
    this.armed = false;
    if (await this.state.sweep()) await this.arm();
  }
}
