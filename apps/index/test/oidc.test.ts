import { SELF, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { sha256, toBase64Url, utf8Encode } from '@identizen/protocol';
import {
  BASE,
  approve,
  json,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  type Phone,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = toBase64Url(sha256(utf8Encode(VERIFIER)));

async function jwks() {
  const res = await SELF.fetch(`${BASE}/.well-known/jwks.json`);
  return res.json<{
    keys: { kid: string; kty: string; crv: string; x: string; y: string; alg: string }[];
  }>();
}

/** Local JWKS verifier built from the served JWKS. */
async function verifier() {
  const set = await jwks();
  return createLocalJWKSet(set);
}

interface AuthorizeOptions {
  acr?: string;
  loginHint?: string;
  prompt?: string;
  scope?: string;
  redirectUri?: string;
  state?: string;
  nonce?: string;
}

/** Drive GET /authorize -> phone approval -> code from the session state. */
async function authorizeAndApprove(
  site: { client_id: string },
  phone: Phone,
  opts: AuthorizeOptions = {},
) {
  const url = new URL(`${BASE}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', site.client_id);
  url.searchParams.set('redirect_uri', opts.redirectUri ?? 'https://app.example.com/callback');
  url.searchParams.set('scope', opts.scope ?? 'openid');
  url.searchParams.set('state', opts.state ?? 'st4te');
  url.searchParams.set('nonce', opts.nonce ?? 'n0nce');
  url.searchParams.set('code_challenge', CHALLENGE);
  url.searchParams.set('code_challenge_method', 'S256');
  if (opts.acr) url.searchParams.set('acr_values', opts.acr);
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint);
  if (opts.prompt) url.searchParams.set('prompt', opts.prompt);
  const page = await SELF.fetch(url);
  expect(page.status, await page.clone().text()).toBe(200);
  const html = await page.text();
  const challengeId = /"challengeId":"(ch_[0-9A-Z]{26})"/.exec(html)?.[1];
  if (!challengeId) throw new Error('no challenge id in page');
  const res = await approve(phone, challengeId);
  expect(res.status, await res.clone().text()).toBe(200);
  const body = await json<{ redirect: string; sub: string }>(res);
  const redirect = new URL(body.redirect);
  return {
    html,
    challengeId,
    code: redirect.searchParams.get('code') ?? '',
    state: redirect.searchParams.get('state'),
    redirect,
    sub: body.sub,
  };
}

async function exchange(
  site: { client_id: string; client_secret: string | null },
  code: string,
  over: Record<string, string> = {},
) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'https://app.example.com/callback',
    code_verifier: VERIFIER,
    client_id: site.client_id,
    ...(site.client_secret ? { client_secret: site.client_secret } : {}),
    ...over,
  });
  return SELF.fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

describe('discovery and JWKS', () => {
  it('serves a conformant openid-configuration', async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    const d = await json<Record<string, unknown>>(res);
    expect(d).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/token`,
      userinfo_endpoint: `${BASE}/userinfo`,
      jwks_uri: `${BASE}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['ES256'],
      code_challenge_methods_supported: ['S256'],
      acr_values_supported: ['idz:login', 'idz:mfa'],
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true,
    });
    for (const k of [
      'scopes_supported',
      'claims_supported',
      'grant_types_supported',
      'token_endpoint_auth_methods_supported',
    ]) {
      expect(Array.isArray(d[k]), k).toBe(true);
    }
  });

  it('publishes two active ES256 keys without private material', async () => {
    const set = await jwks();
    expect(set.keys).toHaveLength(2);
    expect(set.keys.map((k) => k.kid)).toEqual(['test-key-1', 'test-key-2']);
    for (const k of set.keys) {
      expect(k).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' });
      expect((k as { d?: string }).d).toBeUndefined();
    }
  });
});

describe('authorization code flow', () => {
  it('renders the login page, issues a code on approval, exchanges it for tokens; id_token validates and claims are exact', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const { html, code, state, redirect, sub } = await authorizeAndApprove(site, phone, {
      scope: 'openid handle',
    });
    expect(html).toContain('Example App');
    expect(html).toContain('<svg');
    expect(state).toBe('st4te');
    expect(redirect.origin + redirect.pathname).toBe('https://app.example.com/callback');
    expect(code).toMatch(/^ch_[0-9A-Z]{26}\.[A-Za-z0-9_-]+$/);

    const res = await exchange(site, code);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const tokens = await json<{
      access_token: string;
      id_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    }>(res);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('openid handle');

    const header = decodeProtectedHeader(tokens.id_token);
    expect(header).toMatchObject({ alg: 'ES256', kid: 'test-key-1' });
    const { payload } = await jwtVerify(tokens.id_token, await verifier(), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload.sub).toBe(sub);
    expect(payload.nonce).toBe('n0nce');
    expect(payload.acr).toBe('idz:login');
    expect(payload.amr).toEqual(['face', 'hwk']);
    expect(payload.idz_device).toBe(phone.deviceId);
    expect(payload.idz_handle).toBe('george');
    expect(payload.idz_org).toBeUndefined();
    expect(typeof payload.sid).toBe('string');
    expect(typeof payload.at_hash).toBe('string');
    expect(payload).not.toHaveProperty('email');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(3600);
    expect(Object.keys(payload).sort()).toEqual([
      'acr',
      'amr',
      'at_hash',
      'aud',
      'exp',
      'iat',
      'idz_device',
      'idz_handle',
      'iss',
      'nonce',
      'sid',
      'sub',
    ]);

    // userinfo
    const ui = await SELF.fetch(`${BASE}/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(ui.status).toBe(200);
    expect(await json(ui)).toEqual({ sub, idz_device: phone.deviceId, idz_handle: 'george' });

    // code is single use; wrong verifier fails
    expect((await exchange(site, code)).status).toBe(400);
    expect(await json(await exchange(site, code))).toMatchObject({ error: 'invalid_grant' });
  });

  it('id_token omits idz_handle without the handle scope', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const { code } = await authorizeAndApprove(site, phone);
    const tokens = await json<{ id_token: string }>(await exchange(site, code));
    const { payload } = await jwtVerify(tokens.id_token, await verifier(), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload.idz_handle).toBeUndefined();
  });

  it('rejects bad PKCE, wrong redirect_uri, wrong client, missing secret, and public clients work with PKCE only', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const a = await authorizeAndApprove(site, phone);
    expect(
      await json(
        await exchange(site, a.code, {
          code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier',
        }),
      ),
    ).toMatchObject({ error: 'invalid_grant' });
    const b = await authorizeAndApprove(site, phone);
    expect(
      await json(await exchange(site, b.code, { redirect_uri: 'https://evil.example/cb' })),
    ).toMatchObject({ error: 'invalid_grant' });
    const c = await authorizeAndApprove(site, phone);
    const noSecret = await exchange({ client_id: site.client_id, client_secret: null }, c.code);
    expect(noSecret.status).toBe(401);
    const other = await registerSite({
      rp_id: 'other.example.com',
      redirect_uris: ['https://app.example.com/callback'],
    });
    expect((await exchange(other, c.code)).status).toBe(400);
    // Basic auth works.
    const basic = await SELF.fetch(`${BASE}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${btoa(`${site.client_id}:${site.client_secret ?? ''}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: c.code,
        redirect_uri: 'https://app.example.com/callback',
        code_verifier: VERIFIER,
      }),
    });
    expect(basic.status, await basic.clone().text()).toBe(200);

    const pub = await registerSite({
      rp_id: 'pub.example.com',
      redirect_uris: ['https://app.example.com/callback'],
      public: true,
    });
    expect(pub.client_secret).toBeNull();
    const d = await authorizeAndApprove(pub, phone);
    expect((await exchange(pub, d.code)).status).toBe(200);
  });

  it('authorize validates the request (errors redirect when redirect_uri is valid)', async () => {
    const site = await registerSite();
    const base = `${BASE}/authorize?client_id=${site.client_id}&redirect_uri=${encodeURIComponent('https://app.example.com/callback')}&state=s`;
    const noPkce = await SELF.fetch(`${base}&response_type=code&scope=openid`, {
      redirect: 'manual',
    });
    expect(noPkce.status).toBe(302);
    expect(noPkce.headers.get('location')).toContain('error=invalid_request');
    expect(noPkce.headers.get('location')).toContain('state=s');
    const badType = await SELF.fetch(
      `${base}&response_type=token&scope=openid&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
      { redirect: 'manual' },
    );
    expect(badType.headers.get('location')).toContain('error=unsupported_response_type');
    const noScope = await SELF.fetch(
      `${base}&response_type=code&scope=profile&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
      { redirect: 'manual' },
    );
    expect(noScope.headers.get('location')).toContain('error=invalid_scope');
    const badRedirect = await SELF.fetch(
      `${BASE}/authorize?client_id=${site.client_id}&redirect_uri=https://evil.example/cb&response_type=code&scope=openid`,
    );
    expect(badRedirect.status).toBe(400);
    const badClient = await SELF.fetch(
      `${BASE}/authorize?client_id=nope&redirect_uri=https://app.example.com/callback&response_type=code&scope=openid`,
    );
    expect(badClient.status).toBe(400);
  });
});

describe('step-up and enrollment', () => {
  it('step-up on an unbound sub redirects with login_required; enroll then step-up succeeds with acr/amr exact', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const url = `${BASE}/authorize?client_id=${site.client_id}&redirect_uri=${encodeURIComponent('https://app.example.com/callback')}&response_type=code&scope=openid&state=s&code_challenge=${CHALLENGE}&code_challenge_method=S256&acr_values=idz:mfa&login_hint=${'A'.repeat(32)}`;
    const unbound = await SELF.fetch(url, { redirect: 'manual' });
    expect(unbound.status).toBe(302);
    expect(unbound.headers.get('location')).toContain('error=login_required');

    // Enroll: the site already knows the user; it gets a sub to store.
    const enrolled = await authorizeAndApprove(site, phone, { prompt: 'enroll' });
    const enrollTokens = await json<{ id_token: string }>(await exchange(site, enrolled.code));
    const enrollClaims = (
      await jwtVerify(enrollTokens.id_token, await verifier(), {
        issuer: BASE,
        audience: site.client_id,
      })
    ).payload;
    expect(enrollClaims.sub).toBe(enrolled.sub);
    expect(enrollClaims.acr).toBe('idz:login');

    // Step-up against the bound sub: pushed straight to the phone (no QR), acr idz:mfa.
    const stepUp = await authorizeAndApprove(site, phone, {
      acr: 'idz:mfa',
      loginHint: enrolled.sub,
    });
    expect(stepUp.html).toContain('We sent a notification to your phone.');
    expect(stepUp.html).toContain('class="qr hidden"');
    const tokens = await json<{ id_token: string }>(await exchange(site, stepUp.code));
    const { payload } = await jwtVerify(tokens.id_token, await verifier(), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload.sub).toBe(enrolled.sub);
    expect(payload.acr).toBe('idz:mfa');
    expect(payload.amr).toEqual(['face', 'hwk']);
  });
});

describe('sessions and back-channel logout', () => {
  it('revoking a session posts a valid logout token to the site within 1s; userinfo then fails', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const { code, sub } = await authorizeAndApprove(site, phone);
    const tokens = await json<{ access_token: string; id_token: string }>(
      await exchange(site, code),
    );
    const sid = (
      await jwtVerify(tokens.id_token, await verifier(), { issuer: BASE, audience: site.client_id })
    ).payload.sid;

    let received: string | null = null;
    fetchMock
      .get('https://app.example.com')
      .intercept({ path: '/oidc/logout', method: 'POST' })
      .reply(200, (opts) => {
        received = typeof opts.body === 'string' ? opts.body : '';
        return 'ok';
      });

    const sessions = await json<{ sessions: { sid: string }[] }>(
      await signedFetch(phone, 'GET', '/me/sessions'),
    );
    expect(sessions.sessions.map((s) => s.sid)).toEqual([sid]);
    const t0 = Date.now();
    const revoke = await signedFetch(phone, 'POST', `/me/sessions/${String(sid)}/revoke`, {});
    expect(revoke.status).toBe(200);
    for (let i = 0; i < 20 && received === null; i++) await new Promise((r) => setTimeout(r, 50));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(received).not.toBeNull();
    const logoutToken = new URLSearchParams(received ?? '').get('logout_token') ?? '';
    const { payload } = await jwtVerify(logoutToken, await verifier(), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload.sid).toBe(sid);
    expect(payload.sub).toBe(sub);
    expect(payload.events).toEqual({ 'http://schemas.openid.net/event/backchannel-logout': {} });
    expect(payload.nonce).toBeUndefined();
    expect(typeof payload.jti).toBe('string');

    const ui = await SELF.fetch(`${BASE}/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(ui.status).toBe(401);
  });

  it('revoking a device ends its sessions and fires logout', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const second = await registerPhone({ seed: phone.seed });
    const { code } = await authorizeAndApprove(site, phone);
    await exchange(site, code);
    let hits = 0;
    fetchMock
      .get('https://app.example.com')
      .intercept({ path: '/oidc/logout', method: 'POST' })
      .reply(200, () => {
        hits++;
        return 'ok';
      });
    const res = await signedFetch(second, 'POST', `/devices/${phone.deviceId}/revoke`, {});
    expect(await json(res)).toMatchObject({ sessions_revoked: 1 });
    for (let i = 0; i < 20 && hits === 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(hits).toBe(1);
    expect(env.CHALLENGE_SESSION).toBeDefined();
  });
});
