import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256, toBase64Url, utf8Encode } from '@identizen/protocol';
import { BASE, approve, json, registerPhone, registerSite, resetDb, signedFetch } from './helpers';

beforeEach(resetDb);

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = toBase64Url(sha256(utf8Encode(VERIFIER)));

/** Dashboard-style login: public client, PKCE only, then exchange for an access token. */
async function dashboardToken(
  site: { client_id: string },
  phone: Awaited<ReturnType<typeof registerPhone>>,
): Promise<string> {
  const url = new URL(`${BASE}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', site.client_id);
  url.searchParams.set('redirect_uri', 'https://app.example.com/callback');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', 's');
  url.searchParams.set('code_challenge', CHALLENGE);
  url.searchParams.set('code_challenge_method', 'S256');
  const page = await SELF.fetch(url);
  const challengeId = /"challengeId":"(ch_[0-9A-Z]{26})"/.exec(await page.text())?.[1] ?? '';
  const approved = await json<{ redirect: string }>(await approve(phone, challengeId));
  const code = new URL(approved.redirect).searchParams.get('code') ?? '';
  const res = await SELF.fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://app.example.com/callback',
      code_verifier: VERIFIER,
      client_id: site.client_id,
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await json<{ access_token: string }>(res)).access_token;
}

describe('/me with a dashboard bearer token', () => {
  it('lists devices, pairings, sessions and audit; changes the handle; revokes a device', async () => {
    const dashboard = await registerSite({ public: true, rp_id: 'app.identizen.test' });
    const phone = await registerPhone();
    const second = await registerPhone({ seed: phone.seed });
    const token = await dashboardToken(dashboard, phone);
    const auth = { authorization: `Bearer ${token}` };

    const me = await json<{ idz: string; via: string; device: unknown }>(
      await SELF.fetch(`${BASE}/me`, { headers: auth }),
    );
    expect(me).toMatchObject({ idz: phone.idz, via: 'dashboard', device: null });

    const devices = await json<{ devices: { id: string; current: boolean }[] }>(
      await SELF.fetch(`${BASE}/me/devices`, { headers: auth }),
    );
    expect(devices.devices.map((d) => d.id).sort()).toEqual(
      [phone.deviceId, second.deviceId].sort(),
    );
    expect(devices.devices.every((d) => !d.current)).toBe(true);

    const sessions = await json<{ sessions: { sid: string }[] }>(
      await SELF.fetch(`${BASE}/me/sessions`, { headers: auth }),
    );
    expect(sessions.sessions).toHaveLength(1);

    const handle = await SELF.fetch(`${BASE}/me/handle`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'george' }),
    });
    expect(await json(handle)).toMatchObject({ handle: 'george' });

    const audit = await json<{ events: { kind: string }[] }>(
      await SELF.fetch(`${BASE}/me/audit`, { headers: auth }),
    );
    expect(audit.events[0]?.kind).toBe('identity.handle_changed');

    const revoke = await SELF.fetch(`${BASE}/me/devices/${second.deviceId}/revoke`, {
      method: 'POST',
      headers: auth,
    });
    expect(await json(revoke)).toMatchObject({ device_id: second.deviceId, status: 'revoked' });
    expect((await signedFetch(second, 'GET', '/me/devices')).status).toBe(403);
  });

  it('rejects other sites, bad tokens, and revoked sessions', async () => {
    const dashboard = await registerSite({ public: true, rp_id: 'app.identizen.test' });
    const phone = await registerPhone();
    const token = await dashboardToken(dashboard, phone);
    expect(
      (await SELF.fetch(`${BASE}/me/devices`, { headers: { authorization: 'Bearer nope' } }))
        .status,
    ).toBe(401);
    expect((await SELF.fetch(`${BASE}/me/devices`)).status).toBe(401);

    // The phone revokes the dashboard session -> the token stops working.
    const sessions = await json<{ sessions: { sid: string }[] }>(
      await signedFetch(phone, 'GET', '/me/sessions'),
    );
    const sid = sessions.sessions[0]?.sid ?? '';
    expect((await signedFetch(phone, 'POST', `/me/sessions/${sid}/revoke`, {})).status).toBe(200);
    expect(
      (await SELF.fetch(`${BASE}/me/devices`, { headers: { authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(401);

    // A phone cannot revoke itself through /me; it needs another device or the dashboard.
    const self = await signedFetch(phone, 'POST', `/me/devices/${phone.deviceId}/revoke`, {});
    expect(await json(self)).toMatchObject({ error: 'self_revoke' });
  });
});
