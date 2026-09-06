/**
 * The deep-link route: what a headless browser gets when it clicks "Open in Identizen" on the
 * hosted login page with APP_URL pointed at this phone. The index is stubbed; the challenge
 * handling itself is covered by the index e2e suite.
 */
import { describe, expect, it, vi } from 'vitest';
import { FakePhone, type PendingChallenge } from './phone.js';
import { createPhoneApp } from './server.js';

function phoneWithIndex(states: { status: string; redirect?: string | null }[]): FakePhone {
  const queue = [...states];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith('/state')) {
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return new Response(JSON.stringify(next), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  const phone = new FakePhone({ indexUrl: 'http://index.test', fetchImpl });
  vi.spyOn(phone, 'scan').mockResolvedValue({} as PendingChallenge);
  return phone;
}

describe('GET /l/:id', () => {
  it('scans the challenge, waits for approval, and redirects to the site', async () => {
    const phone = phoneWithIndex([
      { status: 'pending', redirect: null },
      { status: 'approved', redirect: 'https://site.example/callback?code=abc&state=s' },
    ]);
    const res = await createPhoneApp(phone).request('/l/ch_1', { redirect: 'manual' });
    expect(phone.scan).toHaveBeenCalledWith('ch_1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://site.example/callback?code=abc&state=s');
  });

  it('answers 409 with the state when the login was denied or expired', async () => {
    const phone = phoneWithIndex([{ status: 'denied', redirect: null }]);
    const res = await createPhoneApp(phone).request('/l/ch_2');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, status: 'denied' });
  });

  it('answers 202 when the index has not resolved the login within the timeout', async () => {
    const phone = phoneWithIndex([{ status: 'pending', redirect: null }]);
    const result = await phone.openDeepLink('ch_3', 50);
    expect(result).toEqual({ status: 'pending', redirect: null });
  });

  it('answers 400 when the challenge does not verify', async () => {
    const phone = phoneWithIndex([]);
    vi.spyOn(phone, 'scan').mockRejectedValue(new Error('challenge rejected: wrong_index'));
    const res = await createPhoneApp(phone).request('/l/ch_4');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: /wrong_index/ });
  });
});
