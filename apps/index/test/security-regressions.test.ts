/**
 * Regressions for the 2026-09-06 security review (S01, S02, S12, S13). Each test is the
 * reviewer's probe turned around: the attack must fail, and the legitimate path next to it must
 * still work.
 */
import { SELF, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { requireSite, updateSite } from '@identizen/db';
import { createServices } from '../src/lib/services';
import { verificationStatus } from '../src/services/site-verification';
import { startChallenge as startChallengeService } from '../src/services/challenge';
import {
  deriveMasterKey,
  generateKeyPair,
  generateSeed,
  rotatingBleIdString,
  sha256,
  signIdentityProof,
  toBase64Url,
  utf8Encode,
} from '@identizen/protocol';
import {
  BASE,
  REDIRECT_URI,
  approve,
  buildAssertion,
  exchange,
  fetchChallenge,
  json,
  loginAndExchange,
  pkcePair,
  registerPhone,
  registerSite,
  registrationNonce,
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

describe('S03: an enrollment proof cannot re-enroll a key the index knows', () => {
  async function proofFor(phone: Phone, nonce?: string) {
    const devicePub = toBase64Url(phone.device.publicKey);
    return {
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(phone.master.publicKey),
      master_sig: signIdentityProof(
        devicePub,
        phone.master.privateKey,
        nonce === undefined ? undefined : { index: BASE, nonce },
      ),
      ...(nonce !== undefined && { nonce }),
    };
  }

  it('a revoked device key is refused, with a fresh nonce and with a replayed legacy proof', async () => {
    const phone = await registerPhone();
    const legacy = await proofFor(phone);
    expect((await signedFetch(phone, 'POST', `/devices/${phone.deviceId}/revoke`, {})).status).toBe(
      200,
    );
    const replayed = await post('/devices', legacy);
    expect(replayed.status).toBe(403);
    expect(await json(replayed)).toMatchObject({ error: 'device_revoked' });
    const fresh = await post('/devices', await proofFor(phone, await registrationNonce()));
    expect(fresh.status).toBe(403);
    expect(await json(fresh)).toMatchObject({ error: 'device_revoked' });
  });

  it('an active key registering again gets its existing enrollment, not a second one', async () => {
    const phone = await registerPhone();
    const again = await post('/devices', await proofFor(phone, await registrationNonce()));
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ device_id: phone.deviceId, idz: phone.idz });
    const me = await json<{ devices: { id: string }[] }>(
      await signedFetch(phone, 'GET', '/me/devices'),
    );
    expect(me.devices).toHaveLength(1);
  });

  it('a nonce binds the proof to this index, and a replayed proof cannot enroll a second time', async () => {
    const seed = generateSeed();
    const master = deriveMasterKey(seed);
    const device = generateKeyPair();
    const devicePub = toBase64Url(device.publicKey);
    const nonce = await registrationNonce();
    const body = (n: string, index = BASE) => ({
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(master.publicKey),
      master_sig: signIdentityProof(devicePub, master.privateKey, { index, nonce: n }),
      nonce: n,
    });
    const wrongIndex = await post('/devices', body(nonce, 'https://other.example'));
    expect(wrongIndex.status).toBe(400);
    expect(await json(wrongIndex)).toMatchObject({ error: 'bad_identity_proof' });
    const forged = await post('/devices', body('A'.repeat(54)));
    expect(forged.status).toBe(400);
    expect(await json(forged)).toMatchObject({ error: 'bad_nonce' });
    const ok = await post('/devices', body(nonce));
    expect(ok.status).toBe(201);
    const first = await json<{ device_id: string }>(ok);
    // The same proof again (captured and replayed) yields the existing enrollment, never a new one.
    const replayed = await post('/devices', body(nonce));
    expect(replayed.status).toBe(200);
    expect(await json(replayed)).toMatchObject({ device_id: first.device_id });
  });
});

describe('S11: every push counts against the device quota', () => {
  it('a step-up and a Verification API request are refused once the device quota is spent', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const sub = await bindSub(site, phone);
    // Spend the quota the way an attacker would: BLE discovery pushes, until the index says stop.
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) {
      const started = await startChallenge({ client_id: site.client_id });
      const res = await post('/discover/ble', {
        challenge_id: started.challenge_id,
        rotating_id: rotatingBleIdString(phone.bleKey, Math.floor(Date.now() / 1000)),
      });
      limited = res.status === 429;
    }
    expect(limited).toBe(true);
    const stepUp = await post('/challenge', {
      client_id: site.client_id,
      acr: 'idz:mfa',
      login_hint: sub,
    });
    expect(stepUp.status).toBe(429);
    expect(await json(stepUp)).toMatchObject({ error: 'push_rate_limited' });
    const verify = await post('/v1/verify', { sub, reason: 'Approve' }, verifyHeaders(site));
    expect(verify.status).toBe(429);
  });
});

describe('S06: the device id a site sees is per site', () => {
  it('two sites get different idz_device values for the same phone; one site always gets the same', async () => {
    const a = await registerSite();
    const b = await registerSite({ rp_id: 'b.example' });
    const phone = await registerPhone();
    const first = await loginAndExchange(a, phone);
    const second = await loginAndExchange(a, phone);
    const other = await loginAndExchange(b, phone);
    const claim = (t: string) => decodeJwt(t).idz_device as string;
    expect(claim(first.tokens.id_token)).toBe(claim(second.tokens.id_token));
    expect(claim(first.tokens.id_token)).not.toBe(claim(other.tokens.id_token));
    expect(claim(first.tokens.id_token)).not.toBe(phone.deviceId);
    expect(claim(first.tokens.id_token)).toMatch(/^dev_[A-Za-z0-9_-]{26}$/);
    const ui = await json<{ idz_device: string }>(
      await SELF.fetch(`${BASE}/userinfo`, {
        headers: { authorization: `Bearer ${other.tokens.access_token}` },
      }),
    );
    expect(ui.idz_device).toBe(claim(other.tokens.id_token));
  });
});

describe('S07: the index only sends requests to destinations the policy allows', () => {
  // The test index runs with OUTBOUND_ALLOW_LOCAL=true (the fake phone lives on localhost), so
  // the scheme and credential rules are what can be exercised end to end here; the address rules
  // are covered in outbound.test.ts.
  it('a site cannot register a webhook or logout endpoint the index would refuse to call', async () => {
    for (const url of [
      'ftp://hooks.example.com/x',
      'https://user:pw@hooks.example.com/x',
      'javascript:alert(1)',
    ]) {
      const res = await post('/sites', {
        name: 'x',
        rp_id: 'x.example',
        redirect_uris: ['https://x.example/cb'],
        webhook_url: url,
      });
      expect(res.status, url).toBe(400);
      expect(await json(res)).toMatchObject({
        error: expect.stringMatching(/invalid_(destination|request)/),
      });
      const res2 = await post('/sites', {
        name: 'y',
        rp_id: 'y.example',
        redirect_uris: ['https://y.example/cb'],
        backchannel_logout_uri: url,
      });
      expect(res2.status, url).toBe(400);
    }
  });

  it('a device cannot register a push URL the index would refuse to call', async () => {
    const phone = await registerPhone();
    const res = await signedFetch(phone, 'POST', `/devices/${phone.deviceId}/push-token`, {
      push_token: 'https://user:pw@phone.example/push',
      push_platform: 'web',
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'invalid_destination' });
  });
});

describe('S05: the index trusts amr only as far as it goes', () => {
  it('a step-up refuses an approval that verified nobody; a login records it honestly', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const sub = await bindSub(site, phone);
    const stepUp = await startChallenge({
      client_id: site.client_id,
      acr: 'idz:mfa',
      login_hint: sub,
    });
    const { payload } = await fetchChallenge(stepUp.challenge_id);
    const soft = await signedFetch(
      phone,
      'POST',
      `/challenge/${stepUp.challenge_id}/assert`,
      buildAssertion(phone, payload, { amr: ['swk'] }),
    );
    expect(soft.status).toBe(403);
    expect(await json(soft)).toMatchObject({ error: 'insufficient_amr' });
    const real = await signedFetch(
      phone,
      'POST',
      `/challenge/${stepUp.challenge_id}/assert`,
      buildAssertion(phone, payload, { amr: ['pin'] }),
    );
    expect(real.status).toBe(200);

    // A plain login records a software-only approval as what it was.
    const login = await startChallenge({ client_id: site.client_id });
    const { payload: loginPayload } = await fetchChallenge(login.challenge_id);
    const soft2 = await signedFetch(
      phone,
      'POST',
      `/challenge/${login.challenge_id}/assert`,
      buildAssertion(phone, loginPayload, { amr: ['swk'] }),
    );
    expect(soft2.status).toBe(200);
    const state = await env.CHALLENGE_SESSION.getByName(login.challenge_id).getState();
    expect(state?.assertion?.amr).toEqual(['swk']);
  });
});

describe('S08: a site the phone will name must have proved its domain', () => {
  const required = { SITE_VERIFICATION: 'required', OUTBOUND_ALLOW_LOCAL: 'true' };

  it('a pending registration cannot start a login; localhost is exempt', async () => {
    const services = createServices(env);
    const live = await registerSite({ rp_id: 'squat.example' });
    const row = await requireSite(services.db, live.client_id);
    // The test index runs with verification off (auto-verified); model the hosted policy.
    await updateSite(services.db, row.clientId, { verifiedAt: null, verificationMethod: null });
    await expect(
      startChallengeService(
        services,
        { clientId: live.client_id, acr: 'idz:login' },
        { ...env, ...required },
      ),
    ).rejects.toMatchObject({ code: 'site_unverified', status: 403 });

    const local = await registerSite({ rp_id: 'localhost', name: 'dev' });
    await updateSite(services.db, local.client_id, { verifiedAt: null });
    await expect(
      startChallengeService(
        services,
        { clientId: local.client_id, acr: 'idz:login' },
        { ...env, ...required },
      ),
    ).resolves.toBeTruthy();
  });

  it('a site registered before verification existed gets its token the first time it is asked for', async () => {
    const site = await registerSite({ rp_id: 'legacy.example' });
    const services = createServices(env);
    await updateSite(services.db, site.client_id, {
      verificationToken: null,
      verificationMethod: 'grandfathered',
    });
    const first = await json<{ instructions: { token: string } | null }>(
      await SELF.fetch(`${BASE}/sites/${site.client_id}/verification`),
    );
    expect(first.instructions?.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const again = await json<{ instructions: { token: string } | null }>(
      await SELF.fetch(`${BASE}/sites/${site.client_id}/verification`),
    );
    expect(again.instructions?.token).toBe(first.instructions?.token);
  });

  it('a registration is verified by a DNS TXT record at the host or a parent zone, or the well-known file', async () => {
    const site = await registerSite({ rp_id: 'app.login.example.com' });
    const info = await json<{ instructions: { token: string; dns: { name: string } } }>(
      await SELF.fetch(`${BASE}/sites/${site.client_id}/verification`),
    );
    expect(info.instructions.dns.name).toBe('_identizen.app.login.example.com');
    const token = info.instructions.token;
    const doh = fetchMock.get('https://cloudflare-dns.com');
    const answer = (name: string, data: string[]) =>
      doh
        .intercept({ path: (p) => p.startsWith(`/dns-query?name=${encodeURIComponent(name)}`) })
        .reply(200, { Answer: data.map((d) => ({ type: 16, data: `"${d}"` })) });
    // Nothing published anywhere: 409 and the places that were checked.
    answer('_identizen.app.login.example.com', []);
    answer('_identizen.login.example.com', []);
    answer('_identizen.example.com', []);
    fetchMock
      .get('https://app.login.example.com')
      .intercept({ path: '/.well-known/identizen-site' })
      .reply(404, '');
    const missing = await SELF.fetch(`${BASE}/sites/${site.client_id}/verify`, { method: 'POST' });
    expect(missing.status).toBe(409);
    expect(await json(missing)).toMatchObject({ error: 'verification_failed' });
    // A record at the parent zone, pinning another index, does not count; pinning this one does.
    answer('_identizen.app.login.example.com', []);
    answer('_identizen.login.example.com', [
      `idz-site-verification=${token} index=https://other.example`,
    ]);
    answer('_identizen.example.com', [`idz-site-verification=${token} index=${BASE}`]);
    const ok = await SELF.fetch(`${BASE}/sites/${site.client_id}/verify`, { method: 'POST' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const okBody = await json<{ status: string; method: string }>(ok);
    expect(okBody.method).toBe('dns');
    expect(['verified', 'not_required']).toContain(okBody.status);
    // The well-known file alone is enough too.
    const site2 = await registerSite({ rp_id: 'files.example' });
    const info2 = await json<{ instructions: { token: string } }>(
      await SELF.fetch(`${BASE}/sites/${site2.client_id}/verification`),
    );
    answer('_identizen.files.example', []);
    fetchMock
      .get('https://files.example')
      .intercept({ path: '/.well-known/identizen-site' })
      .reply(200, `# proof\nidz-site-verification=${info2.instructions.token}\n`);
    const viaHttp = await SELF.fetch(`${BASE}/sites/${site2.client_id}/verify`, { method: 'POST' });
    expect(viaHttp.status).toBe(200);
    expect(await json(viaHttp)).toMatchObject({ method: 'http' });
  });
});

describe('F01: a test client is held to the same domain proof as a live one', () => {
  const required = { SITE_VERIFICATION: 'required', OUTBOUND_ALLOW_LOCAL: 'true' };
  const registerTest = async (rp_id: string) =>
    json<RegisteredSite>(
      await post('/sites', {
        name: 'Looks like the bank',
        rp_id,
        redirect_uris: [REDIRECT_URI],
        environment: 'test',
      }),
    );
  const login = (services: ReturnType<typeof createServices>, clientId: string) =>
    startChallengeService(services, { clientId, acr: 'idz:login' }, { ...env, ...required });

  it('a test client for a real host cannot start a login until the host is proved, even when registration auto-passed it', async () => {
    const services = createServices(env);
    const site = await registerTest('bank.example');
    expect(site.client_id).toMatch(/^idz_test_/);
    // This test index runs with verification off, so registration marks the row `not_required`:
    // the exact shape of the rows the probe created on the hosted index before the fix.
    const row = await requireSite(services.db, site.client_id);
    expect(row.verificationMethod).toBe('not_required');
    expect(verificationStatus({ ...env, ...required }, row)).toBe('pending');
    await expect(login(services, site.client_id)).rejects.toMatchObject({
      code: 'site_unverified',
      status: 403,
    });
    // Proving the domain works exactly as for a live client.
    const info = await json<{ instructions: { token: string } }>(
      await SELF.fetch(`${BASE}/sites/${site.client_id}/verification`),
    );
    fetchMock
      .get('https://cloudflare-dns.com')
      .intercept({ path: (p) => p.startsWith('/dns-query?name=_identizen.bank.example') })
      .reply(200, {
        Answer: [{ type: 16, data: `"idz-site-verification=${info.instructions.token}"` }],
      });
    const ok = await SELF.fetch(`${BASE}/sites/${site.client_id}/verify`, { method: 'POST' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const proved = await requireSite(services.db, site.client_id);
    expect(verificationStatus({ ...env, ...required }, proved)).toBe('verified');
    await expect(login(services, site.client_id)).resolves.toBeTruthy();
  });

  it('a test client on localhost still needs no proof', async () => {
    const services = createServices(env);
    const site = await registerTest('localhost');
    await expect(login(services, site.client_id)).resolves.toBeTruthy();
  });
});
