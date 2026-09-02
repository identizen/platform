import { expect, type Page } from '@playwright/test';
import { INDEX_URL, PHONE_URL } from '../playwright.config';

export { INDEX_URL, PHONE_URL };

export interface PhoneState {
  registered: boolean;
  device_id: string | null;
  idz: string | null;
  policy: string;
  pending: {
    challenge_id: string;
    code: string;
    rp_name: string;
    acr: string;
    reason: string | null;
    via: string;
  }[];
}

export interface PhoneLogEntry {
  at: number;
  event: string;
  detail?: Record<string, unknown>;
}

/** Thin client for the fake phone's HTTP API. */
export const phone = {
  async state(): Promise<PhoneState> {
    return (await (await fetch(`${PHONE_URL}/state`)).json()) as PhoneState;
  },
  async log(): Promise<PhoneLogEntry[]> {
    return ((await (await fetch(`${PHONE_URL}/log`)).json()) as { log: PhoneLogEntry[] }).log;
  },
  async reset(): Promise<PhoneState> {
    const res = await fetch(`${PHONE_URL}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`phone reset failed: ${res.status}`);
    return this.state();
  },
  async policy(policy: 'approve' | 'deny' | 'ignore' | 'manual'): Promise<void> {
    await fetch(`${PHONE_URL}/policy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policy }),
    });
  },
  async scan(
    url: string,
  ): Promise<{
    ok: boolean;
    challenge_id: string;
    code: string;
    rp_name: string;
    acr: string;
    reason: string | null;
  }> {
    const res = await fetch(`${PHONE_URL}/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return (await res.json()) as {
      ok: boolean;
      challenge_id: string;
      code: string;
      rp_name: string;
      acr: string;
      reason: string | null;
    };
  },
  async approve(id: string): Promise<Response> {
    return fetch(`${PHONE_URL}/approve/${id}`, { method: 'POST' });
  },
  async pairings(): Promise<{ id: string; status: string }[]> {
    return (
      (await (await fetch(`${PHONE_URL}/me/pairings`)).json()) as {
        pairings: { id: string; status: string }[];
      }
    ).pairings;
  },
  async sessions(): Promise<{ sid: string }[]> {
    return (
      (await (await fetch(`${PHONE_URL}/me/sessions`)).json()) as { sessions: { sid: string }[] }
    ).sessions;
  },
  async revokePairing(id: string): Promise<void> {
    await fetch(`${PHONE_URL}/me/pairings/${id}/revoke`, { method: 'POST' });
  },
  async revokeSelf(): Promise<void> {
    const res = await fetch(`${PHONE_URL}/revoke-self`, { method: 'POST' });
    if (!res.ok) throw new Error(`revoke-self failed: ${res.status}`);
  },
  /** Wait until the phone log has an entry matching `event` after `sinceIndex`. */
  async waitForEvent(
    event: string,
    sinceIndex: number,
    timeoutMs = 15_000,
  ): Promise<PhoneLogEntry> {
    const t0 = Date.now();
    for (;;) {
      const log = await this.log();
      const hit = log.slice(sinceIndex).find((e) => e.event === event);
      if (hit) return hit;
      if (Date.now() - t0 > timeoutMs) throw new Error(`phone never logged ${event}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  },
};

/** On the hosted login page: read the deep link and hand it to the phone as if scanned. */
export async function scanFromPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/authorize/);
  await expect(page.locator('body[data-ready="1"]')).toBeAttached();
  const href = await page.locator('a', { hasText: 'Open in Identizen' }).getAttribute('href');
  if (!href) throw new Error('no deep link on the login page');
  const result = await phone.scan(href);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  // The match code on the page equals the one the phone saw.
  await expect(page.locator('.code')).toHaveText(result.code);
}

/** The hosted page hides the QR and shows the push hint when the challenge was pushed. */
export async function expectPushed(page: Page): Promise<void> {
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#qr')).toBeHidden();
}
