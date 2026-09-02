import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IdentizenError } from './errors';
import { IdentizenServer, createIdentizenServer } from './server';

const INDEX = 'https://index.test';
const CLIENT = 'idz_test_site';
const SECRET = 'shh';

let priv: CryptoKey;
let jwks: { keys: unknown[] };
const verifications = new Map<string, { status: string; polls: number }>();

async function sign(claims: Record<string, unknown>, typ: string, aud = CLIENT): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1', typ })
    .setIssuer(INDEX)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(priv);
}

const server = setupServer(
  http.get(`${INDEX}/.well-known/jwks.json`, () => HttpResponse.json(jwks)),
  http.post(`${INDEX}/token`, async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    if (form.get('client_secret') !== SECRET)
      return HttpResponse.json({ error: 'invalid_client' }, { status: 401 });
    if (form.get('code') !== 'good')
      return HttpResponse.json(
        { error: 'invalid_grant', error_description: 'bad code' },
        { status: 400 },
      );
    const id_token = await sign(
      {
        sub: 'S'.repeat(32),
        sid: 'sid1',
        nonce: 'n1',
        acr: 'idz:login',
        amr: ['face', 'hwk'],
        idz_device: 'dev_x',
      },
      'JWT',
    );
    return HttpResponse.json({
      access_token: 'at',
      id_token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid',
    });
  }),
  http.get(`${INDEX}/userinfo`, ({ request }) =>
    request.headers.get('authorization') === 'Bearer at'
      ? HttpResponse.json({ sub: 'S'.repeat(32) })
      : HttpResponse.json({ error: 'invalid_token' }, { status: 401 }),
  ),
  http.post(`${INDEX}/v1/verify`, async ({ request }) => {
    if (
      request.headers.get('authorization') !== `Bearer ${SECRET}` ||
      request.headers.get('idz-client-id') !== CLIENT
    ) {
      return HttpResponse.json({ error: 'invalid_client' }, { status: 401 });
    }
    const body = (await request.json()) as { sub: string; reason: string | null };
    verifications.set('vf_1', { status: 'pending', polls: 0 });
    return HttpResponse.json(
      {
        verification_id: 'vf_1',
        status: 'pending',
        sub: body.sub,
        reason: body.reason,
        created_at: 'now',
        resolved_at: null,
        assertion: null,
      },
      { status: 201 },
    );
  }),
  http.get(`${INDEX}/v1/verify/:id`, ({ params }) => {
    const v = verifications.get(String(params.id));
    if (!v) return HttpResponse.json({ error: 'unknown_verification' }, { status: 404 });
    v.polls++;
    if (v.polls >= 3) v.status = 'approved';
    return HttpResponse.json({
      verification_id: params.id,
      status: v.status,
      sub: 'S'.repeat(32),
      reason: 'r',
      created_at: 'now',
      resolved_at: null,
      assertion: v.status === 'approved' ? { payload: {}, site_sig: 'a', device_sig: 'b' } : null,
    });
  }),
);

beforeAll(async () => {
  const kp = await generateKeyPair('ES256', { extractable: true });
  priv = kp.privateKey;
  const pub = await exportJWK(kp.publicKey);
  jwks = { keys: [{ ...pub, kid: 'k1', alg: 'ES256', use: 'sig' }] };
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('IdentizenServer', () => {
  const idz = createIdentizenServer({ indexUrl: INDEX, clientId: CLIENT, clientSecret: SECRET });

  it('builds authorization URLs', () => {
    const url = new URL(
      idz.authorizationUrl({
        redirectUri: 'https://site.test/cb',
        state: 's',
        nonce: 'n',
        codeChallenge: 'c',
        acr: 'idz:mfa',
        loginHint: 'sub1',
        prompt: 'enroll',
        scope: 'openid handle',
      }),
    );
    expect(url.origin + url.pathname).toBe(`${INDEX}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: CLIENT,
      redirect_uri: 'https://site.test/cb',
      scope: 'openid handle',
      state: 's',
      nonce: 'n',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      acr_values: 'idz:mfa',
      login_hint: 'sub1',
      prompt: 'enroll',
    });
  });

  it('exchanges a code and verifies the id_token (nonce, issuer, audience)', async () => {
    const tokens = await idz.exchangeCode({
      code: 'good',
      redirectUri: 'https://site.test/cb',
      codeVerifier: 'v',
      nonce: 'n1',
    });
    expect(tokens.claims.sub).toBe('S'.repeat(32));
    expect(tokens.claims.acr).toBe('idz:login');
    expect(tokens.claims.amr).toEqual(['face', 'hwk']);
    await expect(
      idz.exchangeCode({
        code: 'good',
        redirectUri: 'https://site.test/cb',
        codeVerifier: 'v',
        nonce: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'nonce_mismatch' });
    await expect(
      idz.exchangeCode({ code: 'bad', redirectUri: 'https://site.test/cb', codeVerifier: 'v' }),
    ).rejects.toMatchObject({ code: 'invalid_grant', message: 'bad code', status: 400 });
    const wrongSecret = new IdentizenServer({
      indexUrl: INDEX,
      clientId: CLIENT,
      clientSecret: 'nope',
    });
    await expect(
      wrongSecret.exchangeCode({ code: 'good', redirectUri: 'x', codeVerifier: 'v' }),
    ).rejects.toBeInstanceOf(IdentizenError);
    expect(await idz.userinfo('at')).toEqual({ sub: 'S'.repeat(32) });
  });

  it('rejects id_tokens for another audience or issuer', async () => {
    const other = await sign({ sub: 'x', sid: 'y' }, 'JWT', 'someone-else');
    await expect(idz.verifyIdToken(other)).rejects.toThrow();
  });

  it('Verification API: verify, poll, wait', async () => {
    const v = await idz.verify({ sub: 'S'.repeat(32), reason: 'Pay $5' });
    expect(v.status).toBe('pending');
    const done = await idz.waitForVerification(v.verification_id, { intervalMs: 5 });
    expect(done.status).toBe('approved');
    expect(done.assertion?.site_sig).toBe('a');
    await expect(idz.getVerification('vf_nope')).rejects.toMatchObject({
      code: 'unknown_verification',
      status: 404,
    });
    const noSecret = new IdentizenServer({ indexUrl: INDEX, clientId: CLIENT });
    await expect(noSecret.verify({ sub: 'x' })).rejects.toMatchObject({
      code: 'config_client_secret',
    });
  });

  it('verifies webhook JWTs and logout tokens', async () => {
    const hook = await sign(
      {
        event: 'verification.resolved',
        verification_id: 'vf_1',
        status: 'approved',
        sub: 's',
        reason: null,
        assertion: null,
      },
      'idz-webhook+jwt',
    );
    const ev = await idz.verifyWebhook(hook);
    expect(ev.verification_id).toBe('vf_1');
    expect(ev.status).toBe('approved');
    const notHook = await sign({ event: 'other' }, 'idz-webhook+jwt');
    await expect(idz.verifyWebhook(notHook)).rejects.toMatchObject({ code: 'invalid_webhook' });

    const logout = await sign(
      {
        sub: 's',
        sid: 'sid1',
        jti: 'j',
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      },
      'logout+jwt',
    );
    expect((await idz.verifyLogoutToken(logout)).sid).toBe('sid1');
    const withNonce = await sign(
      {
        sid: 'sid1',
        nonce: 'n',
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      },
      'logout+jwt',
    );
    await expect(idz.verifyLogoutToken(withNonce)).rejects.toMatchObject({
      code: 'invalid_logout_token',
    });
    const wrongTyp = await sign(
      { sid: 'sid1', events: { 'http://schemas.openid.net/event/backchannel-logout': {} } },
      'JWT',
    );
    await expect(idz.verifyLogoutToken(wrongTyp)).rejects.toThrow();
  });

  it('validates config', () => {
    expect(() => new IdentizenServer({ indexUrl: '', clientId: 'x' })).toThrow(/indexUrl/);
    expect(() => new IdentizenServer({ indexUrl: INDEX, clientId: '' })).toThrow(/clientId/);
  });
});
