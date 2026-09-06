/**
 * Specification-derived conformance checks for the index as an OpenID Provider, part 2:
 * OpenID Connect Core 1.0 §3.1.2 (authorization endpoint) and RFC 7636 (PKCE).
 * See docs: reference/oidc-conformance.
 */
import { SELF, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { pkceRequired } from '../src/routes/oidc';
import {
  BASE,
  PKCE,
  REDIRECT_URI,
  authorize,
  authorizeAndApprove,
  authorizeParams,
  discovery,
  exchange,
  json,
  loginAndExchange,
  redirectParams,
  registerPhone,
  registerSite,
  resetDb,
  type AuthorizeParams,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

/** Assert an OIDC error redirect (Core §3.1.2.6) and return its parameters. */
async function expectErrorRedirect(
  params: AuthorizeParams,
  error: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<URLSearchParams> {
  const res = await authorize(params, method);
  expect(res.status, `${error}: ${await res.clone().text()}`).toBe(302);
  const location = new URL(res.headers.get('location') ?? '');
  expect(location.origin + location.pathname).toBe(REDIRECT_URI);
  const p = location.searchParams;
  expect(p.get('error')).toBe(error);
  expect(p.get('error_description')).toBeTruthy();
  return p;
}

/** Assert a JSON error response that does not redirect anywhere (no open redirect). */
async function expectNoRedirect(res: Response, error: string): Promise<void> {
  expect(res.status).toBe(400);
  expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('content-type')).toMatch(/^application\/json/);
  expect(await json(res)).toMatchObject({ error });
}

describe('OpenID Connect Core 1.0 §3.1.2 authorization endpoint', () => {
  it('Core §3.1.2.1: GET and POST (form body) are both accepted and complete the code flow', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const get = await authorize(authorizeParams(site.client_id), 'GET');
    expect(get.status).toBe(200);
    const post = await authorize(authorizeParams(site.client_id), 'POST');
    expect(post.status, await post.clone().text()).toBe(200);
    expect(await post.text()).toContain('"challengeId":"ch_');
    const login = await authorizeAndApprove(site, phone, {}, 'POST');
    expect(login.state).toBe('st4te');
    expect((await exchange(site, login.code)).status).toBe(200);
    // Errors on POST redirect just like GET.
    await expectErrorRedirect(
      authorizeParams(site.client_id, { response_type: 'token' }),
      'unsupported_response_type',
      'POST',
    );
  });

  it('Core §3.1.2.4: a missing or unknown client_id yields an error response without redirecting', async () => {
    const site = await registerSite();
    await expectNoRedirect(
      await authorize(authorizeParams(site.client_id, { client_id: undefined })),
      'invalid_client',
    );
    await expectNoRedirect(
      await authorize(authorizeParams(site.client_id, { client_id: 'idz_test_nope' })),
      'invalid_client',
    );
    await expectNoRedirect(
      await authorize(authorizeParams(site.client_id, { client_id: '' })),
      'invalid_client',
    );
  });

  it('Core §3.1.2.1 / §3.1.2.4: an unregistered, mismatched or missing redirect_uri yields an error response without redirecting', async () => {
    const site = await registerSite();
    for (const bad of [
      undefined,
      '',
      'https://evil.example/cb',
      `${REDIRECT_URI}/`, // Core §3.1.2.1: MUST exactly match a registered value
      `${REDIRECT_URI}?x=1`,
      REDIRECT_URI.replace('https://', 'http://'),
      REDIRECT_URI.toUpperCase(),
      'not a url',
    ]) {
      await expectNoRedirect(
        await authorize(authorizeParams(site.client_id, { redirect_uri: bad })),
        'invalid_request',
      );
    }
  });

  it('Core §3.1.2.6: with a valid redirect_uri every other error redirects with error, error_description and the original state', async () => {
    const site = await registerSite();
    const cases: [AuthorizeParams, string][] = [
      [{ response_type: 'token' }, 'unsupported_response_type'],
      [{ response_type: undefined }, 'invalid_request'],
      [{ scope: 'profile' }, 'invalid_scope'],
      [{ scope: undefined }, 'invalid_scope'],
      [{ code_challenge: undefined }, 'invalid_request'],
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ prompt: 'none' }, 'interaction_required'],
      [{ request: 'eyJhbGciOiJub25lIn0.e30.' }, 'request_not_supported'],
      [{ request_uri: 'https://rp.example/req' }, 'request_uri_not_supported'],
      [{ acr_values: 'idz:mfa' }, 'invalid_request'],
      [{ acr_values: 'idz:mfa', login_hint: 'A'.repeat(32) }, 'login_required'],
    ];
    for (const [over, error] of cases) {
      const p = await expectErrorRedirect(
        authorizeParams(site.client_id, { ...over, state: `state-for-${error}` }),
        error,
      );
      expect(p.get('state'), error).toBe(`state-for-${error}`);
    }
    // Without a state parameter none is invented.
    const p = await expectErrorRedirect(
      authorizeParams(site.client_id, { response_type: 'token', state: undefined }),
      'unsupported_response_type',
    );
    expect(p.has('state')).toBe(false);
  });

  it('Core §3.1.2.2: response_type other than code is unsupported_response_type; a missing response_type is invalid_request', async () => {
    const site = await registerSite();
    for (const rt of ['token', 'id_token', 'code id_token', 'none', 'CODE']) {
      await expectErrorRedirect(
        authorizeParams(site.client_id, { response_type: rt }),
        'unsupported_response_type',
      );
    }
    await expectErrorRedirect(
      authorizeParams(site.client_id, { response_type: undefined }),
      'invalid_request',
    );
  });

  it('Core §3.1.2.2: scope without openid is rejected with invalid_scope (the spec allows invalid_scope or invalid_request)', async () => {
    const site = await registerSite();
    for (const scope of ['profile', 'handle', 'openidx', 'OPENID']) {
      const res = await authorize(authorizeParams(site.client_id, { scope }));
      expect(res.status, scope).toBe(302);
      const error = redirectParams(res).get('error');
      expect(['invalid_scope', 'invalid_request'], scope).toContain(error);
      expect(error, scope).toBe('invalid_scope');
    }
  });

  it('Core §3.1.2.2: a missing or empty scope is rejected with invalid_scope', async () => {
    const site = await registerSite();
    for (const scope of [undefined, '', '   ']) {
      const res = await authorize(authorizeParams(site.client_id, { scope }));
      expect(res.status).toBe(302);
      const error = redirectParams(res).get('error');
      expect(['invalid_scope', 'invalid_request']).toContain(error);
      expect(error).toBe('invalid_scope');
    }
  });

  it('Core §3.1.2.1 / §3.1.3.3: nonce is carried into the id_token unchanged and omitted when not sent', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const nonce = 'n-0nce_WITH.chars~and+plus/slash=eq';
    const withNonce = await loginAndExchange(site, phone, { nonce });
    expect(decodeJwt(withNonce.tokens.id_token).nonce).toBe(nonce);
    const without = await loginAndExchange(site, phone, { nonce: undefined });
    expect(decodeJwt(without.tokens.id_token)).not.toHaveProperty('nonce');
  });

  it('RFC 6749 §4.1.2: state is echoed exactly on success and error redirects, including URL-unsafe characters', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const state = 'a b&c=d/e?f#g%25h+i"j<k>lé';
    const err = await expectErrorRedirect(
      authorizeParams(site.client_id, { response_type: 'token', state }),
      'unsupported_response_type',
    );
    expect(err.get('state')).toBe(state);
    const login = await authorizeAndApprove(site, phone, { state });
    expect(login.state).toBe(state);
    expect(login.redirect.origin + login.redirect.pathname).toBe(REDIRECT_URI);
    expect(login.redirect.searchParams.get('code')).toBe(login.code);
  });

  it('Core §3.1.2.6: prompt=none yields interaction_required with state (a phone approval is always required)', async () => {
    const site = await registerSite();
    const p = await expectErrorRedirect(
      authorizeParams(site.client_id, { prompt: 'none', state: 'silent' }),
      'interaction_required',
    );
    expect(p.get('state')).toBe('silent');
  });

  it('Core §3.1.2.1: prompt=none combined with another value is invalid_request', async () => {
    const site = await registerSite();
    await expectErrorRedirect(
      authorizeParams(site.client_id, { prompt: 'none login' }),
      'invalid_request',
    );
    await expectErrorRedirect(
      authorizeParams(site.client_id, { prompt: 'consent none' }),
      'invalid_request',
    );
  });

  it('Core §3.1.2.1: prompt=login, consent and select_account (alone or combined) do not error', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    for (const prompt of ['login', 'consent', 'select_account', 'login consent select_account']) {
      const res = await authorize(authorizeParams(site.client_id, { prompt }));
      expect(res.status, prompt).toBe(200);
    }
    // Every login re-authenticates on the phone, so prompt=login is naturally satisfied.
    const { tokens } = await loginAndExchange(site, phone, { prompt: 'login' });
    expect(decodeJwt(tokens.id_token).acr).toBe('idz:login');
  });

  it('Core §3.1.2.1: an unknown prompt value is carried through without error (index behaviour; the spec defines no error for it)', async () => {
    const site = await registerSite();
    const res = await authorize(authorizeParams(site.client_id, { prompt: 'unknown_value' }));
    expect(res.status).toBe(200);
  });

  it('Core §6.1 / §3.1.2.6: request yields request_not_supported and request_uri yields request_uri_not_supported, matching discovery', async () => {
    const site = await registerSite();
    const d = await discovery();
    expect(d.request_parameter_supported).toBe(false);
    expect(d.request_uri_parameter_supported).toBe(false);
    const p = await expectErrorRedirect(
      authorizeParams(site.client_id, { request: 'eyJhbGciOiJub25lIn0.e30.', state: 'r' }),
      'request_not_supported',
    );
    expect(p.get('state')).toBe('r');
    await expectErrorRedirect(
      authorizeParams(site.client_id, { request_uri: 'https://rp.example.com/request.jwt' }),
      'request_uri_not_supported',
    );
  });

  it('Core §7.2.1: the registration parameter is ignored — it is defined only for Self-Issued OPs, so registration_not_supported does not apply', async () => {
    const site = await registerSite();
    const res = await authorize(
      authorizeParams(site.client_id, { registration: '{"client_name":"x"}' }),
    );
    expect(res.status).toBe(200);
  });

  it('Core §3.1.2.1: display, ui_locales, claims_locales, max_age, id_token_hint and acr_values do not break a valid request', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const first = await loginAndExchange(site, phone);
    for (const over of [
      { display: 'page' },
      { display: 'popup' },
      { display: 'touch' },
      { display: 'wap' },
      { ui_locales: 'fr-CA fr en' },
      { claims_locales: 'en de' },
      { max_age: '0' },
      { max_age: '86400' },
      { id_token_hint: first.tokens.id_token },
      { acr_values: 'idz:login' },
      { acr_values: 'idz:login urn:mace:incommon:iap:silver' },
      { acr_values: 'urn:mace:incommon:iap:bronze' },
      { display: 'page', ui_locales: 'en', claims_locales: 'en', max_age: '300' },
    ] satisfies AuthorizeParams[]) {
      const res = await authorize(authorizeParams(site.client_id, over));
      expect(res.status, JSON.stringify(over)).toBe(200);
    }
    // acr is a voluntary claim (§3.1.2.1, §5.5.1.1): an unsatisfiable value is ignored and the
    // id_token carries the acr that was actually achieved.
    const voluntary = await loginAndExchange(site, phone, {
      acr_values: 'urn:mace:incommon:iap:bronze',
    });
    expect(decodeJwt(voluntary.tokens.id_token).acr).toBe('idz:login');
  });

  it('Core §3.1.2.1: login_hint with a bound sub is honoured; an unbound sub yields login_required (Identizen reads login_hint as the per-site sub)', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const unbound = await expectErrorRedirect(
      authorizeParams(site.client_id, { login_hint: 'A'.repeat(32), state: 'lh' }),
      'login_required',
    );
    expect(unbound.get('state')).toBe('lh');
    // Enrol (prompt=enroll binds sub to the phone), then a login_hint login is pushed.
    const enrolled = await authorizeAndApprove(site, phone, { prompt: 'enroll' });
    expect((await exchange(site, enrolled.code)).status).toBe(200);
    const hinted = await authorizeAndApprove(site, phone, { login_hint: enrolled.sub });
    expect(hinted.html).toContain('We sent it to your phone.');
    expect(hinted.sub).toBe(enrolled.sub);
    const stepUp = await authorizeAndApprove(site, phone, {
      acr_values: 'idz:mfa',
      login_hint: enrolled.sub,
    });
    const tokens = await json<{ id_token: string }>(await exchange(site, stepUp.code));
    expect(decodeJwt(tokens.id_token).acr).toBe('idz:mfa');
  });

  // Core §3.1.2.1 (max_age) and §2 (auth_time): "auth_time ... REQUIRED when a max_age request
  // is made". The index does not issue auth_time yet; adding an id_token claim is a design
  // decision (CLAUDE.md: ask before changing id_token claims), so this stays skipped and is
  // listed as a deviation in reference/oidc-conformance.
  it.skip('Core §2 / §3.1.2.1: auth_time is present in the id_token when max_age was requested', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone, { max_age: '3600' });
    expect(typeof decodeJwt(tokens.id_token).auth_time).toBe('number');
  });

  it('RFC 7636 §4.3: code_challenge is required and code_challenge_method must be S256 (plain and missing are rejected; discovery agrees)', async () => {
    const site = await registerSite();
    const d = await discovery();
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    await expectErrorRedirect(
      authorizeParams(site.client_id, { code_challenge: undefined }),
      'invalid_request',
    );
    await expectErrorRedirect(
      authorizeParams(site.client_id, {
        code_challenge: PKCE.verifier,
        code_challenge_method: 'plain',
      }),
      'invalid_request',
    );
    await expectErrorRedirect(
      authorizeParams(site.client_id, { code_challenge_method: undefined }),
      'invalid_request',
    );
    await expectErrorRedirect(
      authorizeParams(site.client_id, { code_challenge_method: 's256' }),
      'invalid_request',
    );
  });

  it('RFC 7636 §4.2: a code_challenge outside 43–128 unreserved characters is rejected', async () => {
    const site = await registerSite();
    const ok43 = 'a'.repeat(43);
    const ok128 = 'A1-._~'.repeat(21) + 'zz'; // 128 chars of the unreserved set
    expect(ok128).toHaveLength(128);
    expect(
      (await authorize(authorizeParams(site.client_id, { code_challenge: ok43 }))).status,
    ).toBe(200);
    expect(
      (await authorize(authorizeParams(site.client_id, { code_challenge: ok128 }))).status,
    ).toBe(200);
    for (const bad of [
      'a'.repeat(42),
      'a'.repeat(129),
      'a'.repeat(42) + '+',
      'a'.repeat(42) + '/',
      'a'.repeat(42) + '=',
      'a'.repeat(42) + ' ',
      'a'.repeat(42) + '%',
      '',
    ]) {
      await expectErrorRedirect(
        authorizeParams(site.client_id, { code_challenge: bad }),
        'invalid_request',
      );
    }
  });

  it('Core §3.1.2.1: acr_values=idz:mfa without login_hint is invalid_request (Identizen step-up needs the bound sub)', async () => {
    const site = await registerSite();
    await expectErrorRedirect(
      authorizeParams(site.client_id, { acr_values: 'idz:mfa' }),
      'invalid_request',
    );
    expect((await SELF.fetch(`${BASE}/.well-known/openid-configuration`)).status).toBe(200);
  });
});

describe('RFC 7636 PKCE policy switch (OIDC_PKCE_OPTIONAL)', () => {
  const confidential = { clientSecretHash: 'hash' };
  const publicClient = { clientSecretHash: null };

  it('RFC 7636 §4.3: PKCE is required for every client unless the conformance switch is on', () => {
    expect(pkceRequired({}, confidential)).toBe(true);
    expect(pkceRequired({}, publicClient)).toBe(true);
    expect(pkceRequired({ OIDC_PKCE_OPTIONAL: 'false' }, confidential)).toBe(true);
    expect(pkceRequired({ OIDC_PKCE_OPTIONAL: 'TRUE' }, confidential)).toBe(true);
  });

  it('OIDC_PKCE_OPTIONAL=true relaxes PKCE for confidential clients only; public clients still need S256', () => {
    expect(pkceRequired({ OIDC_PKCE_OPTIONAL: 'true' }, confidential)).toBe(false);
    expect(pkceRequired({ OIDC_PKCE_OPTIONAL: 'true' }, publicClient)).toBe(true);
  });

  it('RFC 7636 §4.3: the test environment runs with PKCE mandatory, so a request without it is invalid_request', async () => {
    const site = await registerSite();
    const p = authorizeParams(site.client_id);
    delete p.code_challenge;
    delete p.code_challenge_method;
    await expectErrorRedirect(p, 'invalid_request');
  });
});

describe('Core §3.1.2.1 / §5.5.1.1 acr_values is voluntary', () => {
  it('Core §5.5.1.1: acr_values listing idz:login and idz:mfa without login_hint proceeds as a login and the id_token says acr=idz:login', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone, {
      acr_values: 'idz:login idz:mfa',
    });
    expect(decodeJwt(tokens.id_token).acr).toBe('idz:login');
  });
});
