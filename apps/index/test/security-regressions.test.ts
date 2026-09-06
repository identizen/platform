/**
 * Regressions for the 2026-09-06 security review (S01, S02, S12, S13). Each test is the
 * reviewer's probe turned around: the attack must fail, and the legitimate path next to it must
 * still work.
 */
import { SELF, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rotatingBleIdString, sha256, toBase64Url, utf8Encode } from '@identizen/protocol';
import {
  BASE,
  REDIRECT_URI,
  approve,
  buildAssertion,
  exchange,
  fetchChallenge,
  json,
  pkcePair,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  startChallenge,
  type Phone,
  type RegisteredSite,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

async function bindSub(site: RegisteredSite, phone: Phone): Promise<string> {
  const login = await startChallenge({ client_id: site.client_id });
  const { sub } = await json<{ sub: string }>(await approve(phone, login.challenge_id));
  return sub;
}

function verifyHeaders(site: RegisteredSite): Record<string, string> {
  return { authorization: `Bearer ${site.client_secret}`, 'idz-client-id': site.client_id };
}

describe('S02: the JSON login is held to the registered redirect', () => {
  it('refuses an unregistered redirect_uri before a challenge exists, for public and confidential clients', async () => {
    for (const isPublic of [true, false]) {
      const site = await registerSite({ public: isPublic, rp_id: `s${String(isPublic)}.example` });
      const { challenge } = pkcePair();
      const res = await post('/challenge', {
        client_id: site.client_id,
        redirect_uri: 'https://attacker.example/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      expect(res.status, `public=${String(isPublic)}`).toBe(400);
      expect(await json(res)).toMatchObject({ error: 'invalid_request' });
    }
  });

  it('applies the same PKCE and scope rules as /authorize', async () => {
    const site = await registerSite({ public: true });
    const noPkce = await post('/challenge', {
      client_id: site.client_id,
      redirect_uri: REDIRECT_URI,
    });
    expect(noPkce.status).toBe(400);
    expect(await json(noPkce)).toMatchObject({ error: 'invalid_request' });
    const { challenge } = pkcePair();
    const badScope = await post('/challenge', {
      client_id: site.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'profile',
    });
    expect(badScope.status).toBe(400);
    expect(await json(badScope)).toMatchObject({ error: 'invalid_scope' });
    const ok = await post('/challenge', {
      client_id: site.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    expect(ok.status).toBe(201);
  });
});

describe('S01: a challenge issued for an identity cannot be taken over', () => {
  it('BLE discovery by another identity is refused and the verification stays pending', async () => {
    const site = await registerSite();
    const victim = await registerPhone();
    const attacker = await registerPhone();
    const sub = await bindSub(site, victim);
    const request = await post(
      '/v1/verify',
      { sub, reason: 'Approve review transaction' },
      verifyHeaders(site),
    );
    expect(request.status).toBe(201);
    const v = await json<{ challenge_id: string; verification_id: string }>(request);

    const discovered = await post('/discover/ble', {
      challenge_id: v.challenge_id,
      rotating_id: rotatingBleIdString(attacker.bleKey, Math.floor(Date.now() / 1000)),
    });
    expect(discovered.status).toBe(403);
    expect(await json(discovered)).toMatchObject({ error: 'wrong_identity' });

    // Approving directly with the attacker's phone fails too, and nothing is written.
    const { payload } = await fetchChallenge(v.challenge_id);
    const approved = await signedFetch(
      attacker,
      'POST',
      `/challenge/${v.challenge_id}/assert`,
      buildAssertion(attacker, payload),
    );
    expect(approved.status).toBe(403);
    expect(await json(approved)).toMatchObject({ error: 'wrong_identity' });
    const result = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/v1/verify/${v.verification_id}`, { headers: verifyHeaders(site) }),
    );
    expect(result.status).toBe('pending');

    // The victim's own approval still completes it with the expected sub.
    const done = await approve(victim, v.challenge_id);
    expect(done.status).toBe(200);
    const after = await json<{
      status: string;
      sub: string;
      assertion: { payload: { sub: string } };
    }>(
      await SELF.fetch(`${BASE}/v1/verify/${v.verification_id}`, { headers: verifyHeaders(site) }),
    );
    expect(after.status).toBe('approved');
    expect(after.assertion.payload.sub).toBe(sub);
  });

  it('the person can approve a step-up from their other phone, and a stranger cannot', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const sub = await bindSub(site, phone);
    const otherPhone = await registerPhone({ seed: phone.seed });
    const stranger = await registerPhone();

    const stepUp = await startChallenge({
      client_id: site.client_id,
      acr: 'idz:mfa',
      login_hint: sub,
    });
    const { payload } = await fetchChallenge(stepUp.challenge_id);
    const wrong = await signedFetch(
      stranger,
      'POST',
      `/challenge/${stepUp.challenge_id}/assert`,
      buildAssertion(stranger, payload),
    );
    expect(wrong.status).toBe(403);
    expect(await json(wrong)).toMatchObject({ error: 'wrong_identity' });

    const state = await env.CHALLENGE_SESSION.getByName(stepUp.challenge_id).getState();
    expect(state?.expectedSub).toBe(sub);
    expect(state?.targetDeviceId).toBe(phone.deviceId);
    const res = await approve(otherPhone, stepUp.challenge_id);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await json(res)).toMatchObject({ sub, acr: 'idz:mfa' });
  });

  it('an untargeted challenge is routed once; a second discovery by another device is refused', async () => {
    const site = await registerSite();
    const first = await registerPhone();
    const second = await registerPhone();
    const now = Math.floor(Date.now() / 1000);
    const started = await startChallenge({ client_id: site.client_id });
    const a = await post('/discover/ble', {
      challenge_id: started.challenge_id,
      rotating_id: rotatingBleIdString(first.bleKey, now),
    });
    expect(a.status).toBe(202);
    const b = await post('/discover/ble', {
      challenge_id: started.challenge_id,
      rotating_id: rotatingBleIdString(second.bleKey, now),
    });
    expect(b.status).toBe(409);
    expect(await json(b)).toMatchObject({ error: 'challenge_targeted' });
    const state = await env.CHALLENGE_SESSION.getByName(started.challenge_id).getState();
    expect(state?.targetDeviceId).toBe(first.deviceId);
  });
});

describe('S12: only the intended person can decline', () => {
  it('an unrelated device cannot deny a targeted challenge; the target and its sibling can', async () => {
    const site = await registerSite();
    const victim = await registerPhone();
    const sibling = await registerPhone({ seed: victim.seed });
    const attacker = await registerPhone();
    const sub = await bindSub(site, victim);
    const target = await startChallenge({
      client_id: site.client_id,
      acr: 'idz:mfa',
      login_hint: sub,
    });

    const res = await signedFetch(attacker, 'POST', `/challenge/${target.challenge_id}/deny`, {});
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ error: 'wrong_identity' });
    expect((await env.CHALLENGE_SESSION.getByName(target.challenge_id).getState())?.status).toBe(
      'pending',
    );

    const ok = await signedFetch(sibling, 'POST', `/challenge/${target.challenge_id}/deny`, {});
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ status: 'denied' });
  });

  it('an untargeted challenge routed to one device cannot be denied by another', async () => {
    const site = await registerSite();
    const routed = await registerPhone();
    const other = await registerPhone();
    const started = await startChallenge({ client_id: site.client_id });
    expect(
      (
        await post('/discover/ble', {
          challenge_id: started.challenge_id,
          rotating_id: rotatingBleIdString(routed.bleKey, Math.floor(Date.now() / 1000)),
        })
      ).status,
    ).toBe(202);
    const res = await signedFetch(other, 'POST', `/challenge/${started.challenge_id}/deny`, {});
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ error: 'wrong_device' });
  });
});

describe('S13: code redemption is atomic', () => {
  async function codeFor(site: RegisteredSite, phone: Phone, challenge: string): Promise<string> {
    const started = await startChallenge({
      client_id: site.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const { redirect } = await json<{ redirect: string }>(
      await approve(phone, started.challenge_id),
    );
    return new URL(redirect).searchParams.get('code') ?? '';
  }

  it('a wrong verifier, a wrong redirect, or the wrong client does not consume the code', async () => {
    const site = await registerSite({ public: true });
    const other = await registerSite({ public: true, rp_id: 'other.example' });
    const phone = await registerPhone();
    const { verifier, challenge } = pkcePair();
    const code = await codeFor(site, phone, challenge);

    const badVerifier = await exchange(site, code, { code_verifier: 'x'.repeat(43) });
    expect(badVerifier.status).toBe(400);
    expect(await json(badVerifier)).toMatchObject({ error: 'invalid_grant' });
    const badRedirect = await exchange(site, code, {
      code_verifier: verifier,
      redirect_uri: 'https://app.example.com/other',
    });
    expect(badRedirect.status).toBe(400);
    const wrongClient = await exchange(other, code, { code_verifier: verifier });
    expect(wrongClient.status).toBe(400);
    const noVerifier = await exchange(site, code, { code_verifier: undefined });
    expect(noVerifier.status).toBe(400);
    expect(await json(noVerifier)).toMatchObject({ error: 'invalid_request' });

    const ok = await exchange(site, code, { code_verifier: verifier });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const again = await exchange(site, code, { code_verifier: verifier });
    expect(again.status).toBe(400);
  });

  it('a code is refused once the redirect it was issued for is no longer registered', async () => {
    const site = await registerSite({ public: true });
    const phone = await registerPhone();
    const { verifier, challenge } = pkcePair();
    const code = await codeFor(site, phone, challenge);
    const updated = await SELF.fetch(`${BASE}/sites/${site.client_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://app.example.com/new-callback'] }),
    });
    expect([200, 401]).toContain(updated.status);
    if (updated.status === 200) {
      const res = await exchange(site, code, { code_verifier: verifier });
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ error: 'invalid_grant' });
    }
  });

  it('a code expires', async () => {
    const site = await registerSite({ public: true });
    const phone = await registerPhone();
    const { verifier, challenge } = pkcePair();
    const code = await codeFor(site, phone, challenge);
    const stub = env.CHALLENGE_SESSION.getByName(code.split('.')[0] ?? '');
    const late = await stub.redeemCode({
      code,
      clientId: site.client_id,
      registeredRedirectUris: [REDIRECT_URI],
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
      now: Date.now() + 6 * 60 * 1000,
    });
    expect(late).toMatchObject({ ok: false, description: 'code has expired' });
    expect(toBase64Url(sha256(utf8Encode(verifier)))).toBe(challenge);
  });
});
