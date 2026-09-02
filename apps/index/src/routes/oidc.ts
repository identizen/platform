import {
  createSession,
  getDevice,
  getIdentity,
  getSession,
  getSite,
  isSessionLive,
  recordAudit,
} from '@identizen/db';
import {
  AcrSchema,
  ACR_LOGIN,
  ACR_MFA,
  sha256,
  toBase64Url,
  utf8Encode,
  type Acr,
} from '@identizen/protocol';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../app';
import { ApiError, badRequest, unauthorized } from '../lib/errors';
import { bearer, hashSecret, randomToken, safeEqual } from '../lib/util';
import { loadKeyring, publicJwks, OIDC_ALG } from '../oidc/keys';
import { renderLoginPage } from '../oidc/login-page';
import {
  mintAccessToken,
  mintIdToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../oidc/tokens';
import { startChallenge } from '../services/challenge';
import { buildRedirect } from '../services/sessions';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function oidcRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/.well-known/openid-configuration', (c) => {
    const { indexUrl } = c.get('services');
    return c.json({
      issuer: indexUrl,
      authorization_endpoint: `${indexUrl}/authorize`,
      token_endpoint: `${indexUrl}/token`,
      userinfo_endpoint: `${indexUrl}/userinfo`,
      jwks_uri: `${indexUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: [OIDC_ALG],
      scopes_supported: ['openid', 'handle'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      claims_supported: [
        'iss',
        'sub',
        'aud',
        'exp',
        'iat',
        'nonce',
        'sid',
        'amr',
        'acr',
        'idz_device',
        'idz_handle',
        'idz_org',
      ],
      claims_parameter_supported: false,
      code_challenge_methods_supported: ['S256'],
      acr_values_supported: [ACR_LOGIN, ACR_MFA],
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true,
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      service_documentation: 'https://docs.identizen.com',
    });
  });

  r.get('/.well-known/jwks.json', async (c) => {
    const ring = await loadKeyring(c.env);
    return c.json(publicJwks(ring), 200, { 'cache-control': 'public, max-age=300' });
  });

  /**
   * OIDC Authorization Code + PKCE. Creates a ChallengeSession and renders the hosted login
   * page; on approval the page is redirected to `redirect_uri?code=…&state=…`.
   * - `acr_values=idz:mfa&login_hint=<sub>`: step-up, pushes to the bound device.
   * - `prompt=enroll`: discovery flow whose resulting `sub` the site stores as the binding.
   */
  r.get('/authorize', async (c) => {
    const services = c.get('services');
    const q = c.req.query();
    const site = q.client_id ? await getSite(services.db, q.client_id) : null;
    if (!site) throw badRequest('invalid_client', 'unknown client_id');
    const redirectUri = q.redirect_uri;
    if (!redirectUri || !site.redirectUris.includes(redirectUri)) {
      throw badRequest('invalid_request', 'redirect_uri is not registered for this client');
    }
    const state = q.state;
    const fail = (error: string, description: string): Response =>
      c.redirect(buildRedirect(redirectUri, { error, error_description: description, state }), 302);

    if (q.response_type !== 'code')
      return fail('unsupported_response_type', 'response_type must be code');
    const scopes = (q.scope ?? '').split(/\s+/).filter(Boolean);
    if (!scopes.includes('openid')) return fail('invalid_scope', 'scope must include openid');
    if (!q.code_challenge || q.code_challenge_method !== 'S256') {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    const acrValues = (q.acr_values ?? '').split(/\s+/).filter(Boolean);
    const acr: Acr = acrValues.includes(ACR_MFA) ? ACR_MFA : ACR_LOGIN;
    if (acrValues.some((a) => !AcrSchema.safeParse(a).success))
      return fail('invalid_request', 'unsupported acr_values');
    if (acr === ACR_MFA && !q.login_hint)
      return fail('invalid_request', 'acr_values=idz:mfa requires login_hint');
    if (q.prompt === 'none')
      return fail(
        'interaction_required',
        'Identizen always requires the user to approve on their phone',
      );

    let started;
    try {
      started = await startChallenge(
        services,
        {
          clientId: site.clientId,
          acr,
          reason: null,
          loginHint: q.login_hint ?? null,
          browserPubkey: null,
          oidc: {
            client_id: site.clientId,
            redirect_uri: redirectUri,
            ...(state !== undefined && { state }),
            ...(q.nonce !== undefined && { nonce: q.nonce }),
            code_challenge: q.code_challenge,
            code_challenge_method: 'S256',
            scope: scopes.join(' '),
            ...(q.prompt !== undefined && { prompt: q.prompt }),
            ...(q.login_hint !== undefined && { login_hint: q.login_hint }),
          },
        },
        c.env,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'login_required')
        return fail('login_required', err.message);
      throw err;
    }
    const id = started.signed.payload.id;
    const wsUrl = new URL(`/challenge/${id}/ws`, services.indexUrl);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return c.html(
      renderLoginPage({
        challengeId: id,
        code: started.signed.payload.code,
        rpName: site.name,
        acr,
        reason: null,
        deepLink: `${services.appUrl}/l/${id}`,
        wsUrl: wsUrl.toString(),
        indexUrl: services.indexUrl,
        exp: started.signed.payload.exp,
        pushed: started.pushedTo !== null,
        errorRedirect: buildRedirect(redirectUri, { state }),
      }),
      200,
      { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' },
    );
  });

  /** Token endpoint: authorization_code + PKCE. Client auth: basic, post, or none (public). */
  r.post('/token', async (c) => {
    const services = c.get('services');
    const form = await c.req.parseBody();
    const get = (k: string): string | undefined =>
      typeof form[k] === 'string' ? form[k] : undefined;
    const tokenError = (error: string, description: string, status: 400 | 401 = 400): Response =>
      c.json({ error, error_description: description }, status, { 'cache-control': 'no-store' });

    if (get('grant_type') !== 'authorization_code')
      return tokenError('unsupported_grant_type', 'only authorization_code is supported');
    const code = get('code');
    const verifier = get('code_verifier');
    if (!code || !verifier)
      return tokenError('invalid_request', 'code and code_verifier are required');

    // Client authentication.
    let clientId = get('client_id');
    let clientSecret = get('client_secret');
    const auth = c.req.header('authorization');
    if (auth?.toLowerCase().startsWith('basic ')) {
      const decoded = atob(auth.slice(6));
      const i = decoded.indexOf(':');
      clientId = decodeURIComponent(decoded.slice(0, i));
      clientSecret = decodeURIComponent(decoded.slice(i + 1));
    }
    if (!clientId) return tokenError('invalid_client', 'client_id is required', 401);
    const site = await getSite(services.db, clientId);
    if (!site) return tokenError('invalid_client', 'unknown client', 401);
    if (site.clientSecretHash) {
      if (!clientSecret || !safeEqual(hashSecret(clientSecret), site.clientSecretHash)) {
        return tokenError('invalid_client', 'client authentication failed', 401);
      }
    }

    // Redeem the code at the session DO (single use).
    const [challengeId, secret] = code.split('.');
    if (!challengeId || !secret) return tokenError('invalid_grant', 'malformed code');
    const stub = c.env.CHALLENGE_SESSION.getByName(challengeId);
    const state = await stub.redeemCode(code, site.clientId);
    if (!state?.oidc || !state.assertion)
      return tokenError('invalid_grant', 'code is invalid, expired, or already used');
    if (state.clientId !== site.clientId)
      return tokenError('invalid_grant', 'code was issued to another client');
    const redirectUri = get('redirect_uri');
    if (state.oidc.redirect_uri && redirectUri !== state.oidc.redirect_uri) {
      return tokenError('invalid_grant', 'redirect_uri does not match the authorization request');
    }
    const expected = state.oidc.code_challenge ?? '';
    if (toBase64Url(sha256(utf8Encode(verifier))) !== expected)
      return tokenError('invalid_grant', 'PKCE verification failed');

    const assertion = state.assertion;
    const device = await getDevice(services.db, assertion.device_id);
    const identity = device ? await getIdentity(services.db, device.idz) : null;
    if (!device || !identity) return tokenError('invalid_grant', 'device no longer exists');
    if (device.status !== 'active') return tokenError('invalid_grant', 'device is not active');

    const now = services.now();
    const sid = randomToken(24);
    await createSession(services.db, {
      sid,
      idz: device.idz,
      deviceId: device.id,
      clientId: site.clientId,
      expiresAt: new Date((now + SESSION_TTL_SECONDS) * 1000),
    });
    await recordAudit(services.db, {
      kind: 'session.created',
      idz: device.idz,
      deviceId: device.id,
      clientId: site.clientId,
      detail: { sid, acr: assertion.acr },
    });

    const ring = await loadKeyring(c.env);
    const scope = state.oidc.scope ?? 'openid';
    const accessToken = await mintAccessToken(ring, {
      issuer: services.indexUrl,
      clientId: site.clientId,
      sub: assertion.sub,
      sid,
      scope,
      now,
    });
    const idToken = await mintIdToken(ring, {
      issuer: services.indexUrl,
      clientId: site.clientId,
      sub: assertion.sub,
      sid,
      nonce: state.oidc.nonce,
      amr: assertion.amr,
      acr: assertion.acr,
      deviceId: device.id,
      handle: scope.split(' ').includes('handle') ? identity.handle : null,
      orgId: identity.orgId,
      accessToken,
      now,
    });
    return c.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        id_token: idToken,
        scope,
      },
      200,
      { 'cache-control': 'no-store', pragma: 'no-cache' },
    );
  });

  const userinfo = async (c: Context<AppEnv>): Promise<Response> => {
    const services = c.get('services');
    const token = bearer(c.req.header('authorization'));
    if (!token) throw unauthorized('invalid_token', 'bearer access token required');
    const ring = await loadKeyring(c.env);
    const claims = await verifyAccessToken(ring, services.indexUrl, token);
    if (!claims) throw unauthorized('invalid_token', 'access token is invalid or expired');
    const session = await getSession(services.db, claims.sid);
    if (!session || !isSessionLive(session))
      throw unauthorized('invalid_token', 'session has been revoked');
    const identity = await getIdentity(services.db, session.idz);
    return c.json({
      sub: claims.sub,
      idz_device: session.deviceId,
      ...(claims.scope.split(' ').includes('handle') && identity?.handle
        ? { idz_handle: identity.handle }
        : {}),
      ...(identity?.orgId ? { idz_org: identity.orgId } : {}),
    });
  };
  r.get('/userinfo', userinfo);
  r.post('/userinfo', userinfo);

  return r;
}
