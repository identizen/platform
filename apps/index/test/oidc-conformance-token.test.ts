/**
 * Specification-derived conformance checks for the index as an OpenID Provider, part 3:
 * RFC 6749 / RFC 7636 token endpoint, OpenID Connect Core 1.0 id_token and UserInfo, and
 * OpenID Connect Back-Channel Logout 1.0. See docs: reference/oidc-conformance.
 */
import { SELF, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { sha256, toBase64Url, utf8Encode } from '@identizen/protocol';
import { pairwiseDeviceId } from '../src/oidc/pairwise';
import { ID_TOKEN_TTL_SECONDS, LOGOUT_TOKEN_TTL_SECONDS } from '../src/oidc/tokens';
import {
  BASE,
  PKCE,
  REDIRECT_URI,
  authorizeAndApprove,
  discovery,
  exchange,
  json,
  jwks,
  loginAndExchange,
  pkcePair,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  type Phone,
  type RegisteredSite,
  type TokenResponse,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

const ID_TOKEN_CLAIMS = [
  'iss',
  'sub',
  'aud',
  'exp',
  'iat',
  'nonce',
  'sid',
  'amr',
  'acr',
  'auth_time',
  'at_hash',
  'idz_device',
  'idz_handle',
  'idz_org',
];
const USERINFO_CLAIMS = ['sub', 'idz_device', 'idz_handle', 'idz_org'];
const PROFILE_CLAIMS = [
  'email',
  'email_verified',
  'name',
  'given_name',
  'family_name',
  'preferred_username',
  'picture',
  'phone_number',
  'address',
  'azp',
];

async function verifier() {
  return createLocalJWKSet(await jwks());
}

async function verifiedIdToken(site: RegisteredSite, tokens: TokenResponse) {
  const { payload, protectedHeader } = await jwtVerify(tokens.id_token, await verifier(), {
    issuer: BASE,
    audience: site.client_id,
    algorithms: ['ES256'],
  });
  return { payload, header: protectedHeader };
}

function userinfo(token: string | null, method: 'GET' | 'POST' = 'GET'): Promise<Response> {
  return SELF.fetch(`${BASE}/userinfo`, {
    method,
    ...(token !== null && { headers: { authorization: `Bearer ${token}` } }),
  });
}

describe('RFC 6749 §4.1.3, §5.1, §5.2 and RFC 7636 §4.6 token endpoint', () => {
  it('RFC 6749 §4.1.3 / §5.2: grant_type must be authorization_code — other values are unsupported_grant_type and a missing one is invalid_request', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(site, phone);
    const missing = await exchange(site, code, { grant_type: undefined });
    expect(missing.status).toBe(400);
    expect(await json(missing)).toMatchObject({ error: 'invalid_request' });
    for (const gt of ['refresh_token', 'client_credentials', 'password', 'Authorization_Code']) {
      const res = await exchange(site, code, { grant_type: gt });
      expect(res.status, gt).toBe(400);
      expect(await json(res), gt).toMatchObject({ error: 'unsupported_grant_type' });
    }
    // None of the rejected attempts consumed the code.
    expect((await exchange(site, code)).status).toBe(200);
  });

  it('RFC 6749 §4.1.2 / §10.5: the code is single use; the second exchange fails with invalid_grant', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(site, phone);
    expect((await exchange(site, code)).status).toBe(200);
    const again = await exchange(site, code);
    expect(again.status).toBe(400);
    expect(await json(again)).toMatchObject({ error: 'invalid_grant' });
    // A garbage code is also invalid_grant, never a server error.
    for (const bad of ['nope', 'ch_' + 'A'.repeat(26) + '.secret', 'ch_.x', '.']) {
      const res = await exchange(site, bad);
      expect(res.status, bad).toBe(400);
      expect(await json(res), bad).toMatchObject({ error: 'invalid_grant' });
    }
  });

  it('RFC 6749 §4.1.3: redirect_uri must match the authorization request exactly', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    for (const bad of [
      `${REDIRECT_URI}/`,
      `${REDIRECT_URI}?x=1`,
      'https://evil.example/cb',
      REDIRECT_URI.toUpperCase(),
      undefined, // §4.1.3: REQUIRED when it was in the authorization request
    ]) {
      const { code } = await authorizeAndApprove(site, phone);
      const res = await exchange(site, code, { redirect_uri: bad });
      expect(res.status, String(bad)).toBe(400);
      expect(await json(res), String(bad)).toMatchObject({ error: 'invalid_grant' });
    }
  });

  it('RFC 7636 §4.6: a wrong code_verifier is invalid_grant, a missing one is invalid_request, and only the S256 pre-image is accepted', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const pair = pkcePair();
    const wrongPair = pkcePair();
    const a = await authorizeAndApprove(site, phone, { code_challenge: pair.challenge });
    const missing = await exchange(site, a.code, { code_verifier: undefined });
    expect(missing.status).toBe(400);
    expect(await json(missing)).toMatchObject({ error: 'invalid_request' });
    const wrong = await exchange(site, a.code, { code_verifier: wrongPair.verifier });
    expect(wrong.status).toBe(400);
    expect(await json(wrong)).toMatchObject({ error: 'invalid_grant' });
    // The challenge itself is not a valid verifier (S256, not plain).
    const b = await authorizeAndApprove(site, phone, { code_challenge: pair.challenge });
    const asPlain = await exchange(site, b.code, { code_verifier: pair.challenge });
    expect(await json(asPlain)).toMatchObject({ error: 'invalid_grant' });
    // The correct verifier: base64url(SHA-256(verifier)) === code_challenge.
    expect(toBase64Url(sha256(utf8Encode(pair.verifier)))).toBe(pair.challenge);
    const c = await authorizeAndApprove(site, phone, { code_challenge: pair.challenge });
    const ok = await exchange(site, c.code, { code_verifier: pair.verifier });
    expect(ok.status, await ok.clone().text()).toBe(200);
  });

  it('RFC 6749 §4.1.3 / §10.5: a code issued to client A cannot be redeemed by client B', async () => {
    const a = await registerSite({ rp_id: 'a.example.com' });
    const b = await registerSite({ rp_id: 'b.example.com' });
    const pub = await registerSite({ rp_id: 'pub.example.com', public: true });
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(a, phone);
    const byB = await exchange(b, code);
    expect(byB.status).toBe(400);
    expect(await json(byB)).toMatchObject({ error: 'invalid_grant' });
    const byPublic = await exchange(pub, code);
    expect(byPublic.status).toBe(400);
    expect(await json(byPublic)).toMatchObject({ error: 'invalid_grant' });
    // The rightful client still can (the attempts above did not consume it).
    expect((await exchange(a, code)).status).toBe(200);
  });

  it('RFC 6749 §2.3.1: client_secret_basic (form-urlencoded credentials) and client_secret_post are both accepted', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const post = await authorizeAndApprove(site, phone);
    const postRes = await exchange(site, post.code);
    expect(postRes.status, await postRes.clone().text()).toBe(200);
    const basic = await authorizeAndApprove(site, phone);
    const creds = `${encodeURIComponent(site.client_id)}:${encodeURIComponent(site.client_secret ?? '')}`;
    const basicRes = await exchange(
      { client_id: site.client_id, client_secret: null },
      basic.code,
      { client_id: undefined },
      { authorization: `Basic ${btoa(creds)}` },
    );
    expect(basicRes.status, await basicRes.clone().text()).toBe(200);
    // Basic with the client_id repeated in the body is tolerated when they agree.
    const both = await authorizeAndApprove(site, phone);
    const bothRes = await exchange(
      { client_id: site.client_id, client_secret: null },
      both.code,
      {},
      { authorization: `Basic ${btoa(creds)}` },
    );
    expect(bothRes.status, await bothRes.clone().text()).toBe(200);
  });

  it('RFC 6749 §5.2: a wrong secret is 401 invalid_client, with WWW-Authenticate when the client used the Authorization header', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(site, phone);
    const post = await exchange(site, code, { client_secret: 'wrong' });
    expect(post.status).toBe(401);
    expect(await json(post)).toMatchObject({ error: 'invalid_client' });
    expect(post.headers.get('cache-control')).toBe('no-store');
    const basic = await exchange(
      { client_id: site.client_id, client_secret: null },
      code,
      { client_id: undefined },
      { authorization: `Basic ${btoa(`${site.client_id}:wrong`)}` },
    );
    expect(basic.status).toBe(401);
    expect(await json(basic)).toMatchObject({ error: 'invalid_client' });
    expect(basic.headers.get('www-authenticate')).toMatch(/^Basic\b/);
    // Unknown client via Basic.
    const unknown = await exchange(
      { client_id: site.client_id, client_secret: null },
      code,
      { client_id: undefined },
      { authorization: `Basic ${btoa('idz_test_nope:secret')}` },
    );
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get('www-authenticate')).toMatch(/^Basic\b/);
    // Failed authentication did not consume the code.
    expect((await exchange(site, code)).status).toBe(200);
  });

  it('RFC 6749 §2.3.1: malformed Basic credentials are 401 invalid_client, not a server error', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(site, phone);
    for (const header of ['Basic !!!not-base64!!!', `Basic ${btoa('nocolon')}`, 'Basic ']) {
      const res = await exchange(
        { client_id: site.client_id, client_secret: null },
        code,
        { client_id: undefined },
        { authorization: header },
      );
      expect(res.status, header).toBe(401);
      expect(await json(res), header).toMatchObject({ error: 'invalid_client' });
      expect(res.headers.get('www-authenticate'), header).toMatch(/^Basic\b/);
    }
  });

  it('RFC 6749 §2.1 / §4.1.3: a public client exchanges with PKCE only and a confidential client cannot omit its secret', async () => {
    const site = await registerSite();
    const pub = await registerSite({ rp_id: 'pub.example.com', public: true });
    const phone = await registerPhone();
    expect(pub.client_secret).toBeNull();
    const p = await authorizeAndApprove(pub, phone);
    const pubRes = await exchange(pub, p.code);
    expect(pubRes.status, await pubRes.clone().text()).toBe(200);
    const c = await authorizeAndApprove(site, phone);
    const noSecret = await exchange({ client_id: site.client_id, client_secret: null }, c.code);
    expect(noSecret.status).toBe(401);
    expect(await json(noSecret)).toMatchObject({ error: 'invalid_client' });
    const noClient = await exchange(site, c.code, {
      client_id: undefined,
      client_secret: undefined,
    });
    expect(noClient.status).toBe(401);
    expect(await json(noClient)).toMatchObject({ error: 'invalid_client' });
  });

  it('RFC 6749 §5.1 / Core §3.1.3.3: the success response has token_type Bearer, access_token, id_token, expires_in, Cache-Control no-store and Pragma no-cache', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { res, tokens } = await loginAndExchange(site, phone);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('pragma')).toBe('no-cache');
    expect(tokens.token_type.toLowerCase()).toBe('bearer');
    expect(typeof tokens.access_token).toBe('string');
    expect(typeof tokens.id_token).toBe('string');
    expect(tokens.id_token.split('.')).toHaveLength(3);
    expect(Number.isInteger(tokens.expires_in)).toBe(true);
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.scope).toBe('openid');
    expect(tokens.access_token).not.toBe(tokens.id_token);
  });

  it('RFC 6749 §6 / Discovery grant_types_supported: no refresh_token is issued and the refresh_token grant is unsupported', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone, { scope: 'openid offline_access' });
    expect(tokens).not.toHaveProperty('refresh_token');
    const res = await SELF.fetch(`${BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: 'whatever',
        client_id: site.client_id,
        client_secret: site.client_secret ?? '',
      }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('RFC 6749 §4.1.2: a code older than the five-minute redemption window is invalid_grant', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const login = await authorizeAndApprove(site, phone);
    // Redemption checks the code's age against CODE_TTL_MS inside the session, so ask the
    // session directly with a clock six minutes ahead (the route passes Date.now()).
    const stub = env.CHALLENGE_SESSION.getByName(login.challengeId);
    const late = await stub.redeemCode({
      code: login.code,
      clientId: site.client_id,
      registeredRedirectUris: [REDIRECT_URI],
      redirectUri: REDIRECT_URI,
      codeVerifier: PKCE.verifier,
      now: Date.now() + 6 * 60 * 1000,
    });
    expect(late).toMatchObject({
      ok: false,
      error: 'invalid_grant',
      description: 'code has expired',
    });
    // Not consumed by the failed attempt: the same code still redeems in time.
    const res = await exchange(site, login.code);
    expect(res.status).toBe(200);
  });
});

describe('OpenID Connect Core 1.0 §2 and §3.1.3.7 id_token', () => {
  it('Core §3.1.3.7 / §2: header alg is ES256 with a kid from the JWKS and the signature verifies against jwks_uri', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const header = decodeProtectedHeader(tokens.id_token);
    expect(header.alg).toBe('ES256');
    expect(header.typ).toBe('JWT');
    expect((await jwks()).keys.map((k) => k.kid)).toContain(header.kid);
    const { payload } = await verifiedIdToken(site, tokens);
    expect(payload.sub).toBeTypeOf('string');
    // Tampering breaks the signature.
    const [h, p, s] = tokens.id_token.split('.');
    const tampered = `${h}.${toBase64Url(utf8Encode(JSON.stringify({ ...decodeJwt(tokens.id_token), sub: 'x' })))}.${s}`;
    await expect(jwtVerify(tampered, await verifier())).rejects.toThrow();
    expect(p).toBeTruthy();
  });

  it('Core §2: iss, aud, exp, iat and nonce are exact; exp - iat is the documented lifetime and iat is now', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const before = Math.floor(Date.now() / 1000);
    const { tokens } = await loginAndExchange(site, phone, { nonce: 'n-1' });
    const after = Math.floor(Date.now() / 1000);
    const { payload } = await verifiedIdToken(site, tokens);
    expect(payload.iss).toBe(BASE);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    expect(aud).toEqual([site.client_id]);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp ?? 0).toBeGreaterThan(payload.iat ?? 0);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(ID_TOKEN_TTL_SECONDS);
    expect(ID_TOKEN_TTL_SECONDS).toBe(3600);
    expect(payload.iat ?? 0).toBeGreaterThanOrEqual(before - 5);
    expect(payload.iat ?? 0).toBeLessThanOrEqual(after + 5);
    expect(payload.nonce).toBe('n-1');
  });

  it('Core §3.3.2.11 / §3.1.3.6: at_hash is base64url of the left-most 128 bits of SHA-256(access_token)', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const { payload } = await verifiedIdToken(site, tokens);
    const expected = toBase64Url(sha256(utf8Encode(tokens.access_token)).slice(0, 16));
    expect(payload.at_hash).toBe(expected);
    expect(String(payload.at_hash)).toHaveLength(22);
  });

  it('Core §2 / §8: sub is at most 255 ASCII characters, stable per site and pairwise across sites', async () => {
    const a = await registerSite({ rp_id: 'a.example.com' });
    const b = await registerSite({ rp_id: 'b.example.com' });
    const phone = await registerPhone();
    const a1 = await loginAndExchange(a, phone);
    const a2 = await loginAndExchange(a, phone);
    const b1 = await loginAndExchange(b, phone);
    const sub = (t: TokenResponse) => String(decodeJwt(t.id_token).sub);
    expect(sub(a1.tokens)).toMatch(/^[\x21-\x7e]{1,255}$/);
    expect(sub(a1.tokens)).toBe(sub(a2.tokens));
    expect(sub(a1.tokens)).toBe(a1.login.sub);
    expect(sub(b1.tokens)).not.toBe(sub(a1.tokens));
    // A different person at the same site has a different sub.
    const other = await registerPhone();
    const o = await loginAndExchange(a, other);
    expect(sub(o.tokens)).not.toBe(sub(a1.tokens));
  });

  it('Core §2: sid, acr idz:login and a non-empty amr are present; no profile claims, no azp, nothing outside the documented list', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const { tokens } = await loginAndExchange(site, phone, { scope: 'openid handle' });
    const { payload } = await verifiedIdToken(site, tokens);
    expect(typeof payload.sid).toBe('string');
    expect(String(payload.sid).length).toBeGreaterThan(0);
    expect(payload.acr).toBe('idz:login');
    expect(Array.isArray(payload.amr)).toBe(true);
    expect((payload.amr as unknown[]).length).toBeGreaterThan(0);
    for (const m of payload.amr as unknown[]) expect(typeof m).toBe('string');
    expect(typeof payload.idz_device).toBe('string');
    for (const c of PROFILE_CLAIMS) expect(payload, c).not.toHaveProperty(c);
    for (const c of Object.keys(payload)) expect(ID_TOKEN_CLAIMS, c).toContain(c);
    // azp is only needed when aud has several values (§2); it is absent or equals aud.
    if (payload.azp !== undefined) expect(payload.azp).toBe(site.client_id);
  });

  it('Core §5.4: idz_handle is released only with the handle scope and only when the user set one', async () => {
    const site = await registerSite();
    const named = await registerPhone({ handle: 'george' });
    const anon = await registerPhone();
    const withScope = await loginAndExchange(site, named, { scope: 'openid handle' });
    expect(decodeJwt(withScope.tokens.id_token).idz_handle).toBe('george');
    const withoutScope = await loginAndExchange(site, named, { scope: 'openid' });
    expect(decodeJwt(withoutScope.tokens.id_token)).not.toHaveProperty('idz_handle');
    const noHandle = await loginAndExchange(site, anon, { scope: 'openid handle' });
    expect(decodeJwt(noHandle.tokens.id_token)).not.toHaveProperty('idz_handle');
    expect(noHandle.tokens.scope).toBe('openid handle');
  });
});

describe('OpenID Connect Core 1.0 §5.3 UserInfo', () => {
  it('Core §5.3.1: GET and POST with Authorization: Bearer both return application/json', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    for (const method of ['GET', 'POST'] as const) {
      const res = await userinfo(tokens.access_token, method);
      expect(res.status, method).toBe(200);
      expect(res.headers.get('content-type'), method).toMatch(/^application\/json/);
      expect((await json<{ sub: string }>(res)).sub, method).toBe(decodeJwt(tokens.id_token).sub);
    }
  });

  it('Core §5.3.2: sub equals the id_token sub and no claims beyond the documented set are returned', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const { tokens } = await loginAndExchange(site, phone, { scope: 'openid handle' });
    const body = await json<Record<string, unknown>>(await userinfo(tokens.access_token));
    expect(body.sub).toBe(decodeJwt(tokens.id_token).sub);
    for (const c of Object.keys(body)) expect(USERINFO_CLAIMS, c).toContain(c);
    for (const c of PROFILE_CLAIMS) expect(body, c).not.toHaveProperty(c);
    expect(body).toEqual({
      sub: decodeJwt(tokens.id_token).sub,
      idz_device: pairwiseDeviceId('app.example.com', phone.deviceId),
      idz_handle: 'george',
    });
  });

  it('RFC 6750 §3 / §3.1: a missing token is 401 with a WWW-Authenticate: Bearer challenge carrying no error code', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const res = await userinfo(null, method);
      expect(res.status, method).toBe(401);
      const challenge = res.headers.get('www-authenticate') ?? '';
      expect(challenge, method).toMatch(/^Bearer\b/);
      expect(challenge, method).not.toContain('error=');
      expect(await json(res), method).toMatchObject({ error: 'invalid_token' });
    }
    // A non-Bearer scheme is treated as no token.
    const basic = await SELF.fetch(`${BASE}/userinfo`, {
      headers: { authorization: `Basic ${btoa('a:b')}` },
    });
    expect(basic.status).toBe(401);
    expect(basic.headers.get('www-authenticate')).toMatch(/^Bearer\b/);
  });

  it('RFC 6750 §3.1: a malformed, revoked, foreign or id_token bearer is 401 with error="invalid_token"', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const expectInvalid = async (token: string, label: string) => {
      const res = await userinfo(token);
      expect(res.status, label).toBe(401);
      expect(res.headers.get('www-authenticate'), label).toMatch(
        /^Bearer\b.*\berror="invalid_token"/,
      );
      expect(await json(res), label).toMatchObject({ error: 'invalid_token' });
    };
    await expectInvalid('not-a-jwt', 'malformed');
    await expectInvalid(tokens.access_token.slice(0, -4) + 'AAAA', 'bad signature');
    // Core §3.1.3.8 / RFC 9068 §4: an id_token is not an access token (typ JWT, not at+jwt).
    await expectInvalid(tokens.id_token, 'id_token as bearer');
    // Revoked session.
    const sid = String(decodeJwt(tokens.id_token).sid);
    const revoke = await signedFetch(phone, 'POST', `/me/sessions/${sid}/revoke`, {});
    expect(revoke.status).toBe(200);
    await expectInvalid(tokens.access_token, 'revoked');
  });

  it('Core §5.3.2 / §5.4: scope-based claim release at userinfo mirrors the id_token', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const withScope = await loginAndExchange(site, phone, { scope: 'openid handle' });
    const withoutScope = await loginAndExchange(site, phone, { scope: 'openid' });
    const a = await json<Record<string, unknown>>(await userinfo(withScope.tokens.access_token));
    const b = await json<Record<string, unknown>>(await userinfo(withoutScope.tokens.access_token));
    expect(a.idz_handle).toBe('george');
    expect(decodeJwt(withScope.tokens.id_token).idz_handle).toBe('george');
    expect(b).not.toHaveProperty('idz_handle');
    expect(decodeJwt(withoutScope.tokens.id_token)).not.toHaveProperty('idz_handle');
    expect(a.idz_device).toBe(decodeJwt(withScope.tokens.id_token).idz_device);
  });
});

describe('OpenID Connect Back-Channel Logout 1.0', () => {
  interface Delivery {
    body: string;
    headers: Record<string, string>;
  }

  /** Capture the next `n` logout POSTs to the site. */
  function captureLogouts(n: number): Delivery[] {
    const out: Delivery[] = [];
    fetchMock
      .get('https://app.example.com')
      .intercept({ path: '/oidc/logout', method: 'POST' })
      .reply(200, (opts) => {
        const raw = opts.headers as unknown;
        const headers: Record<string, string> = {};
        if (Array.isArray(raw)) {
          for (let i = 0; i + 1 < raw.length; i += 2)
            headers[String(raw[i]).toLowerCase()] = String(raw[i + 1]);
        } else if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw as Record<string, unknown>))
            headers[k.toLowerCase()] = String(v);
        }
        out.push({ body: typeof opts.body === 'string' ? opts.body : '', headers });
        return 'ok';
      })
      .times(n);
    return out;
  }

  async function waitFor(pred: () => boolean): Promise<void> {
    for (let i = 0; i < 60 && !pred(); i++) await new Promise((r) => setTimeout(r, 50));
    expect(pred()).toBe(true);
  }

  async function loginTwice(site: RegisteredSite, phone: Phone) {
    const first = await loginAndExchange(site, phone);
    const second = await loginAndExchange(site, phone);
    return [first, second].map((l) => ({
      sid: String(decodeJwt(l.tokens.id_token).sid),
      sub: String(decodeJwt(l.tokens.id_token).sub),
    }));
  }

  it('Back-Channel §2.4: the logout token has typ logout+jwt, iss, aud, iat, exp, a unique jti, sid, the logout event and no nonce, signed with a JWKS key', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const sessions = await loginTwice(site, phone);
    const deliveries = captureLogouts(2);
    for (const s of sessions) {
      const res = await signedFetch(phone, 'POST', `/me/sessions/${s.sid}/revoke`, {});
      expect(res.status).toBe(200);
    }
    await waitFor(() => deliveries.length === 2);

    const tokens = deliveries.map((d) => new URLSearchParams(d.body).get('logout_token') ?? '');
    const jtis = new Set<string>();
    const sids = new Set<string>();
    for (const token of tokens) {
      const header = decodeProtectedHeader(token);
      expect(header.typ).toBe('logout+jwt');
      expect(header.alg).toBe('ES256');
      expect((await jwks()).keys.map((k) => k.kid)).toContain(header.kid);
      const { payload } = await jwtVerify(token, await verifier(), {
        issuer: BASE,
        audience: site.client_id,
        typ: 'logout+jwt',
        algorithms: ['ES256'],
      });
      expect(payload.iss).toBe(BASE);
      expect(payload.aud).toBe(site.client_id);
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(LOGOUT_TOKEN_TTL_SECONDS);
      expect(typeof payload.jti).toBe('string');
      jtis.add(String(payload.jti));
      expect(typeof payload.sid).toBe('string');
      sids.add(String(payload.sid));
      expect(payload.sub).toBe(sessions[0]?.sub);
      expect(payload.events).toEqual({ 'http://schemas.openid.net/event/backchannel-logout': {} });
      expect(payload).not.toHaveProperty('nonce');
    }
    expect(jtis.size).toBe(2);
    expect(sids).toEqual(new Set(sessions.map((s) => s.sid)));
  });

  it('Back-Channel §2.6: the token is POSTed as application/x-www-form-urlencoded with logout_token', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const deliveries = captureLogouts(1);
    const sid = String(decodeJwt(tokens.id_token).sid);
    expect((await signedFetch(phone, 'POST', `/me/sessions/${sid}/revoke`, {})).status).toBe(200);
    await waitFor(() => deliveries.length === 1);
    const d = deliveries[0];
    if (!d) throw new Error('no delivery');
    expect(d.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    const form = new URLSearchParams(d.body);
    expect([...form.keys()]).toEqual(['logout_token']);
    expect(form.get('logout_token')?.split('.')).toHaveLength(3);
  });

  it('Back-Channel §2 / Discovery: backchannel_logout_supported and backchannel_logout_session_supported are advertised and honoured', async () => {
    const d = await discovery();
    expect(d.backchannel_logout_supported).toBe(true);
    // session_supported means the logout token carries sid, which §2.4 above verifies.
    expect(d.backchannel_logout_session_supported).toBe(true);
  });
});

describe('RFC 6750 §2.2 form-encoded body parameter', () => {
  it('RFC 6750 §2.2: POST /userinfo accepts access_token in an application/x-www-form-urlencoded body', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const res = await SELF.fetch(`${BASE}/userinfo`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: tokens.access_token }),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ sub: decodeJwt(tokens.id_token).sub });
  });

  it('RFC 6750 §2.3 is not implemented: a token in the query string is ignored and the request is 401', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const res = await SELF.fetch(`${BASE}/userinfo?access_token=${tokens.access_token}`);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer\b/);
  });
});

describe('RFC 6749 §4.1.2 code reuse', () => {
  it('RFC 6749 §4.1.2: presenting a code a second time revokes the session the first exchange created', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { login, tokens } = await loginAndExchange(site, phone);
    expect((await userinfo(tokens.access_token)).status).toBe(200);
    const again = await exchange(site, login.code);
    expect(again.status).toBe(400);
    expect(await json(again)).toMatchObject({ error: 'invalid_grant' });
    const after = await userinfo(tokens.access_token);
    expect(after.status).toBe(401);
    expect(after.headers.get('www-authenticate')).toContain('invalid_token');
  });
});
