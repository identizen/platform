/**
 * Specification-derived conformance checks for the index as an OpenID Provider, part 1:
 * OpenID Connect Discovery 1.0 (with RFC 8414), RFC 7517 JWKS, the RFC 6749 error format,
 * and cross-cutting behaviour. See docs: reference/oidc-conformance.
 */
import { SELF, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import {
  BASE,
  REDIRECT_URI,
  authorize,
  authorizeAndApprove,
  authorizeParams,
  discovery,
  exchange,
  json,
  jwks,
  loginAndExchange,
  redirectParams,
  registerPhone,
  registerSite,
  resetDb,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

/** The claims the docs (reference/oidc) list for the id_token; nothing else may appear. */
const DOCUMENTED_ID_TOKEN_CLAIMS = [
  'iss',
  'sub',
  'aud',
  'exp',
  'iat',
  'nonce',
  'sid',
  'amr',
  'acr',
  'at_hash',
  'idz_device',
  'idz_handle',
  'idz_org',
];

describe('OpenID Connect Discovery 1.0 §3, §4 and RFC 8414', () => {
  it('Discovery §3 / RFC 8414 §2: issuer equals INDEX_URL with no trailing slash and every REQUIRED field is present with a valid value', async () => {
    const d = await discovery();
    expect(d.issuer).toBe(BASE);
    expect(String(d.issuer).endsWith('/')).toBe(false);
    expect(new URL(String(d.issuer)).search).toBe('');
    expect(new URL(String(d.issuer)).hash).toBe('');
    // Discovery §3 REQUIRED: issuer, authorization_endpoint, token_endpoint (code flow),
    // jwks_uri, response_types_supported, subject_types_supported,
    // id_token_signing_alg_values_supported.
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint']) {
      expect(typeof d[k], k).toBe('string');
      expect(String(d[k]).startsWith(`${BASE}/`), k).toBe(true);
      expect(new URL(String(d[k])).protocol, k).toMatch(/^https?:$/);
    }
    expect(d.response_types_supported).toEqual(['code']);
    expect(d.subject_types_supported).toEqual(['pairwise']);
    expect(d.id_token_signing_alg_values_supported).toEqual(['ES256']);
    // RECOMMENDED / OPTIONAL fields that the index publishes must be well-formed.
    expect(d.scopes_supported).toContain('openid');
    expect(d.grant_types_supported).toEqual(['authorization_code']);
    expect(d.token_endpoint_auth_methods_supported).toEqual([
      'client_secret_basic',
      'client_secret_post',
      'none',
    ]);
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    expect(d.response_modes_supported).toEqual(['query']);
    expect(d.claims_parameter_supported).toBe(false);
    expect(d.request_parameter_supported).toBe(false);
    expect(d.request_uri_parameter_supported).toBe(false);
    expect(Array.isArray(d.claims_supported)).toBe(true);
    expect(d.claims_supported).toContain('sub');
  });

  it('Discovery §4.2: the document is served as application/json with status 200', async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    // Cacheability is not required by the spec; document what the index does.
    const cache = res.headers.get('cache-control');
    if (cache) expect(cache).not.toContain('no-store');
  });

  it('Discovery §3: the advertised endpoints are the ones that answer', async () => {
    const d = await discovery();
    const authz = await SELF.fetch(String(d.authorization_endpoint));
    expect(authz.status).toBe(400); // answers (invalid_client), not 404
    expect(await json(authz)).toMatchObject({ error: 'invalid_client' });
    const token = await SELF.fetch(String(d.token_endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({}),
    });
    expect(token.status).toBe(400);
    expect(await json(token)).toMatchObject({ error: 'invalid_request' });
    const userinfo = await SELF.fetch(String(d.userinfo_endpoint));
    expect(userinfo.status).toBe(401);
    const keys = await SELF.fetch(String(d.jwks_uri));
    expect(keys.status).toBe(200);
    expect(Array.isArray((await json<{ keys: unknown[] }>(keys)).keys)).toBe(true);
  });

  it('Discovery §3: response_types_supported is honoured and unadvertised response types are rejected', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const ok = await authorize(authorizeParams(site.client_id));
    expect(ok.status).toBe(200);
    for (const rt of ['token', 'id_token', 'code id_token', 'id_token token', 'code token']) {
      const res = await authorize(authorizeParams(site.client_id, { response_type: rt }));
      expect(res.status, rt).toBe(302);
      expect(redirectParams(res).get('error'), rt).toBe('unsupported_response_type');
    }
    // A full code flow works end to end.
    const { code } = await authorizeAndApprove(site, phone);
    expect((await exchange(site, code)).status).toBe(200);
  });

  it('Discovery §3: grant_types_supported is honoured and unadvertised grants are rejected with unsupported_grant_type', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { code } = await authorizeAndApprove(site, phone);
    for (const gt of [
      'refresh_token',
      'client_credentials',
      'password',
      'implicit',
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'urn:ietf:params:oauth:grant-type:device_code',
    ]) {
      const res = await exchange(site, code, { grant_type: gt });
      expect(res.status, gt).toBe(400);
      expect(await json(res), gt).toMatchObject({ error: 'unsupported_grant_type' });
    }
    expect((await exchange(site, code)).status).toBe(200);
  });

  it('Discovery §3: code_challenge_methods_supported is honoured (S256) and plain or missing methods are rejected', async () => {
    const site = await registerSite();
    const d = await discovery();
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    expect((await authorize(authorizeParams(site.client_id))).status).toBe(200);
    const plain = await authorize(
      authorizeParams(site.client_id, {
        code_challenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        code_challenge_method: 'plain',
      }),
    );
    expect(plain.status).toBe(302);
    expect(redirectParams(plain).get('error')).toBe('invalid_request');
    // RFC 7636 §4.3: a missing method means `plain`, which is not supported, so it is rejected.
    const missing = await authorize(
      authorizeParams(site.client_id, { code_challenge_method: undefined }),
    );
    expect(missing.status).toBe(302);
    expect(redirectParams(missing).get('error')).toBe('invalid_request');
    const unknown = await authorize(
      authorizeParams(site.client_id, { code_challenge_method: 'S512' }),
    );
    expect(redirectParams(unknown).get('error')).toBe('invalid_request');
  });

  it('Discovery §3: token_endpoint_auth_methods_supported — basic, post and none each work; an unadvertised method is rejected', async () => {
    const site = await registerSite();
    const pub = await registerSite({ rp_id: 'pub.example.com', public: true });
    const phone = await registerPhone();

    const post = await authorizeAndApprove(site, phone);
    expect((await exchange(site, post.code)).status).toBe(200);

    const basic = await authorizeAndApprove(site, phone);
    const basicRes = await exchange(
      { client_id: site.client_id, client_secret: null },
      basic.code,
      { client_id: undefined },
      { authorization: `Basic ${btoa(`${site.client_id}:${site.client_secret ?? ''}`)}` },
    );
    expect(basicRes.status, await basicRes.clone().text()).toBe(200);

    const none = await authorizeAndApprove(pub, phone);
    expect((await exchange(pub, none.code)).status).toBe(200);

    // private_key_jwt is not advertised: a confidential client presenting only a
    // client_assertion is not authenticated.
    const pkj = await authorizeAndApprove(site, phone);
    const res = await exchange({ client_id: site.client_id, client_secret: null }, pkj.code, {
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: 'eyJhbGciOiJub25lIn0.e30.',
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ error: 'invalid_client' });
  });

  it('Discovery §3: id_token_signing_alg_values_supported matches the id_token header', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const d = await discovery();
    const header = decodeProtectedHeader(tokens.id_token);
    expect(d.id_token_signing_alg_values_supported).toContain(header.alg);
    expect(header.alg).toBe('ES256');
  });

  it('Discovery §3: subject_types_supported is pairwise — sub differs between two sites', async () => {
    const a = await registerSite({ rp_id: 'a.example.com' });
    const b = await registerSite({ rp_id: 'b.example.com' });
    const phone = await registerPhone();
    const la = await loginAndExchange(a, phone);
    const lb = await loginAndExchange(b, phone);
    expect(decodeJwt(la.tokens.id_token).sub).toBe(la.login.sub);
    expect(decodeJwt(lb.tokens.id_token).sub).toBe(lb.login.sub);
    expect(la.login.sub).not.toBe(lb.login.sub);
  });

  it('Discovery §3 / RFC 6749 §3.3: every advertised scope is honoured; unadvertised scopes are ignored and absent from the granted scope', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const d = await discovery();
    const supported = d.scopes_supported as string[];
    expect(supported).toEqual(['openid', 'handle']);
    const all = await loginAndExchange(site, phone, { scope: supported.join(' ') });
    expect(all.tokens.scope.split(' ').sort()).toEqual([...supported].sort());
    expect(decodeJwt(all.tokens.id_token).idz_handle).toBe('george');
    // RFC 6749 §3.3: the server MAY ignore unknown scopes; the response then carries the
    // granted scope, which must not claim anything that was not granted.
    const extra = await loginAndExchange(site, phone, {
      scope: 'openid profile email offline_access',
    });
    expect(extra.tokens.scope).toBe('openid');
    expect(extra.tokens.refresh_token).toBeUndefined();
  });

  it('Discovery §3: claims_supported covers every claim the id_token and userinfo carry', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ handle: 'george' });
    const d = await discovery();
    const claimsSupported = d.claims_supported as string[];
    const { tokens } = await loginAndExchange(site, phone, { scope: 'openid handle' });
    const idClaims = Object.keys(decodeJwt(tokens.id_token));
    // Discovery §3 says claims_supported need not be exhaustive; at_hash is an id_token
    // integrity claim (Core §3.1.3.6) rather than an end-user claim, so it is excused.
    for (const c of idClaims) {
      if (c === 'at_hash') continue;
      expect(claimsSupported, c).toContain(c);
      expect(DOCUMENTED_ID_TOKEN_CLAIMS, c).toContain(c);
    }
    const ui = await json<Record<string, unknown>>(
      await SELF.fetch(`${BASE}/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    for (const c of Object.keys(ui)) expect(claimsSupported, c).toContain(c);
  });

  it('Discovery §3: jwks_uri serves the key that signed the id_token', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const d = await discovery();
    const set = await json<{ keys: Record<string, unknown>[] }>(
      await SELF.fetch(String(d.jwks_uri)),
    );
    const { kid } = decodeProtectedHeader(tokens.id_token);
    expect(set.keys.map((k) => k.kid)).toContain(kid);
    const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(set), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload.sub).toBeTypeOf('string');
  });
});

describe('RFC 7517 JSON Web Key Set', () => {
  it('RFC 7517 §4: every key has kty, kid, alg and use=sig, no private members, and kids are unique', async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/jwks.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const set = await json<{ keys: Record<string, unknown>[] }>(res);
    expect(set.keys.length).toBeGreaterThan(0);
    for (const k of set.keys) {
      expect(k.kty).toBe('EC');
      expect(typeof k.kid).toBe('string');
      expect(k.alg).toBe('ES256');
      expect(k.use).toBe('sig');
      expect(k.crv).toBe('P-256');
      expect(typeof k.x).toBe('string');
      expect(typeof k.y).toBe('string');
      // RFC 7518 §6.2.2 private parameter for EC keys, plus the RSA/oct ones for good measure.
      for (const priv of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth']) {
        expect(k, priv).not.toHaveProperty(priv);
      }
    }
    const kids = set.keys.map((k) => String(k.kid));
    expect(new Set(kids).size).toBe(kids.length);
  });

  it('RFC 7517 §4.5: the id_token header kid is present in the set', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const header = decodeProtectedHeader(tokens.id_token);
    expect(typeof header.kid).toBe('string');
    const set = await jwks();
    expect(set.keys.map((k) => k.kid)).toContain(header.kid);
  });
});

describe('RFC 6749 §5.2 error format', () => {
  it('RFC 6749 §5.2: every error body is JSON with string error and error_description at the documented status', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const check = async (res: Response, status: number, error: string) => {
      expect(res.status, `${error}: ${await res.clone().text()}`).toBe(status);
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      const body = await json<{ error: unknown; error_description: unknown }>(res);
      expect(body.error).toBe(error);
      expect(typeof body.error_description).toBe('string');
      expect(String(body.error_description).length).toBeGreaterThan(0);
    };
    await check(await SELF.fetch(`${BASE}/authorize`), 400, 'invalid_client');
    await check(
      await authorize(authorizeParams(site.client_id, { redirect_uri: 'https://evil.example/' })),
      400,
      'invalid_request',
    );
    const { code } = await authorizeAndApprove(site, phone);
    await check(await exchange(site, code, { grant_type: undefined }), 400, 'invalid_request');
    await check(await exchange(site, code, { grant_type: 'nope' }), 400, 'unsupported_grant_type');
    await check(await exchange(site, code, { client_secret: 'wrong' }), 401, 'invalid_client');
    await check(
      await exchange(site, code, { code_verifier: 'x'.repeat(43) }),
      400,
      'invalid_grant',
    );
    await check(await SELF.fetch(`${BASE}/userinfo`), 401, 'invalid_token');
    await check(
      await SELF.fetch(`${BASE}/userinfo`, { headers: { authorization: 'Bearer nope' } }),
      401,
      'invalid_token',
    );
  });

  it('Core §3.1.2.6: authorization error redirects carry error, error_description and state', async () => {
    const site = await registerSite();
    const res = await authorize(
      authorizeParams(site.client_id, { response_type: 'token', state: 'abc' }),
    );
    expect(res.status).toBe(302);
    const p = redirectParams(res);
    expect(p.get('error')).toBe('unsupported_response_type');
    expect(p.get('error_description')).toBeTruthy();
    expect(p.get('state')).toBe('abc');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
  });

  it('Threat model: the login page is served no-store with X-Frame-Options DENY', async () => {
    const site = await registerSite();
    const res = await authorize(authorizeParams(site.client_id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('Cross-cutting', () => {
  it('CORS: /token and /userinfo reflect the request Origin (index behaviour, not a spec requirement)', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { login } = await loginAndExchange(site, phone);
    // The app-wide CORS middleware echoes the Origin on every route, including the OIDC ones.
    const preflight = await SELF.fetch(`${BASE}/token`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://spa.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://spa.example.com');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    const token = await exchange(site, login.code, {}, { origin: 'https://spa.example.com' });
    expect(token.headers.get('access-control-allow-origin')).toBe('https://spa.example.com');
    const ui = await SELF.fetch(`${BASE}/userinfo`, {
      headers: { origin: 'https://spa.example.com' },
    });
    expect(ui.status).toBe(401);
    expect(ui.headers.get('access-control-allow-origin')).toBe('https://spa.example.com');
  });

  it('RFC 9068 §2: the access token is a JWT with typ at+jwt, distinct from the id_token, carrying sid and client_id', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    expect(tokens.access_token).not.toBe(tokens.id_token);
    const header = decodeProtectedHeader(tokens.access_token);
    expect(header.typ).toBe('at+jwt');
    expect(header.alg).toBe('ES256');
    const at = decodeJwt(tokens.access_token);
    const id = decodeJwt(tokens.id_token);
    expect(at.sid).toBe(id.sid);
    expect(at.client_id).toBe(site.client_id);
    expect(at.iss).toBe(BASE);
    expect(at.sub).toBe(id.sub);
    expect(typeof at.jti).toBe('string');
    expect((at.exp ?? 0) - (at.iat ?? 0)).toBe(tokens.expires_in);
  });
});
