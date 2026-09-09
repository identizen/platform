import { nsName } from '../lib/names';
import {
  createSessionForActiveDevice,
  getDevice,
  getIdentity,
  getSession,
  getSite,
  isSessionLive,
  recordAudit,
  revokeSession,
} from '@identizen/db';
import { ACR_LOGIN, ACR_MFA } from '@identizen/protocol';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../app';
import { ApiError, badRequest } from '../lib/errors';
import { bearer, hashSecret, randomToken, safeEqual } from '../lib/util';
import { loadKeyring, publicJwks, OIDC_ALG } from '../oidc/keys';
import { registeredRedirect, validateAuthorizeRequest } from '../oidc/authorize-request';
import { pairwiseDeviceId } from '../oidc/pairwise';
import { loginPageCsp, renderLoginPage } from '../oidc/login-page';
import {
  mintAccessToken,
  mintIdToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../oidc/tokens';
import { startChallenge } from '../services/challenge';
import { ipRateLimit } from '../middleware/rate-limit';
import { buildRedirect, fireBackchannelLogout } from '../services/sessions';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

import { SCOPES_SUPPORTED } from '../oidc/authorize-request';
export { pkceRequired, SCOPES_SUPPORTED } from '../oidc/authorize-request';

/** Authorization request parameters from the query (GET) or the form body (POST), Core §3.1.2.1. */
async function authorizeParams(c: Context<AppEnv>): Promise<Record<string, string>> {
  if (c.req.method !== 'POST') return c.req.query();
  const form = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) if (typeof v === 'string') out[k] = v;
  return out;
}

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
      scopes_supported: [...SCOPES_SUPPORTED],
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
        'auth_time',
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
  r.on(['GET', 'POST'], '/authorize', ipRateLimit(), async (c) => {
    const services = c.get('services');
    const q = await authorizeParams(c);
    const site = q.client_id ? await getSite(services.db, q.client_id) : null;
    if (!site) throw badRequest('invalid_client', 'unknown client_id');
    const redirectUri = registeredRedirect(site, q.redirect_uri);
    if (!redirectUri) {
      throw badRequest('invalid_request', 'redirect_uri is not registered for this client');
    }
    const state = q.state;
    const fail = (error: string, description: string): Response =>
      c.redirect(buildRedirect(redirectUri, { error, error_description: description, state }), 302);

    const v = validateAuthorizeRequest(c.env, site, q, { redirectUri, responseTypeRequired: true });
    if (!v.ok) return fail(v.error, v.description);

    let started;
    try {
      started = await startChallenge(
        services,
        {
          clientId: site.clientId,
          acr: v.acr,
          reason: null,
          loginHint: v.loginHint,
          browserPubkey: null,
          oidc: v.oidc,
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
    // A per-response nonce marks the page's own script and style; nothing else may run (F08).
    const nonce = randomToken(16);
    c.header('Content-Security-Policy', loginPageCsp(nonce, services.indexUrl));
    c.header('Cache-Control', 'no-store');
    return c.html(
      renderLoginPage(
        {
          challengeId: id,
          code: started.signed.payload.code,
          rpName: site.name,
          acr: v.acr,
          reason: null,
          deepLink: `${services.appUrl}/l/${id}?index=${encodeURIComponent(services.indexUrl)}`,
          wsUrl: wsUrl.toString(),
          indexUrl: services.indexUrl,
          exp: started.signed.payload.exp,
          pushed: started.pushedTo !== null,
          errorRedirect: buildRedirect(redirectUri, { state }),
        },
        nonce,
      ),
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
    const auth = c.req.header('authorization');
    const usedBasic = /^basic(\s|$)/i.test(auth ?? '');
    const tokenError = (error: string, description: string, status: 400 | 401 = 400): Response =>
      c.json({ error, error_description: description }, status, {
        'cache-control': 'no-store',
        pragma: 'no-cache',
        // RFC 6749 §5.2: a 401 to a client that authenticated via the Authorization header
        // carries a WWW-Authenticate challenge for the scheme it used.
        ...(status === 401 && usedBasic ? { 'www-authenticate': 'Basic realm="identizen"' } : {}),
      });

    // RFC 6749 §5.2: a missing grant_type is invalid_request; an unknown one is unsupported.
    const grantType = get('grant_type');
    if (!grantType) return tokenError('invalid_request', 'grant_type is required');
    if (grantType !== 'authorization_code')
      return tokenError('unsupported_grant_type', 'only authorization_code is supported');
    const code = get('code');
    const verifier = get('code_verifier');
    if (!code) return tokenError('invalid_request', 'code is required');

    // Client authentication.
    let clientId = get('client_id');
    let clientSecret = get('client_secret');
    if (usedBasic && auth) {
      let decoded: string;
      try {
        decoded = atob(auth.slice(5).trim());
      } catch {
        return tokenError('invalid_client', 'malformed Basic credentials', 401);
      }
      const i = decoded.indexOf(':');
      if (i < 0) return tokenError('invalid_client', 'malformed Basic credentials', 401);
      try {
        clientId = decodeURIComponent(decoded.slice(0, i));
        clientSecret = decodeURIComponent(decoded.slice(i + 1));
      } catch {
        return tokenError('invalid_client', 'malformed Basic credentials', 401);
      }
    }
    if (!clientId) return tokenError('invalid_client', 'client_id is required', 401);
    const site = await getSite(services.db, clientId);
    if (!site) return tokenError('invalid_client', 'unknown client', 401);
    if (site.clientSecretHash) {
      if (!clientSecret || !safeEqual(hashSecret(clientSecret), site.clientSecretHash)) {
        return tokenError('invalid_client', 'client authentication failed', 401);
      }
    }

    // Redeem the code at the session store (single use).
    const [challengeId, secret] = code.split('.');
    if (!challengeId || !secret) return tokenError('invalid_grant', 'malformed code');
    const stub = services.stores.challenge(nsName(c.env, challengeId));
    // Every check (client, redirect, PKCE, expiry) runs inside the session and the code is only
    // consumed when all of them pass, so a wrong verifier cannot burn a legitimate login.
    const redeemed = await stub.redeemCode({
      code,
      clientId: site.clientId,
      registeredRedirectUris: site.redirectUris,
      redirectUri: get('redirect_uri'),
      codeVerifier: verifier,
      now: Date.now(),
    });
    if (!redeemed.ok) {
      // RFC 6749 §4.1.2: a code presented twice has probably leaked; revoke the session the
      // first exchange created so the attacker and the victim both lose it.
      const leaked = redeemed.reusedSid;
      if (leaked) {
        const session = await getSession(services.db, leaked);
        if (session && session.revokedAt === null) {
          const revoked = await revokeSession(services.db, leaked);
          await recordAudit(services.db, {
            kind: 'session.revoked',
            idz: revoked.idz,
            deviceId: revoked.deviceId,
            clientId: revoked.clientId,
            detail: { sid: leaked, via: 'code_reuse' },
          });
          services.defer(fireBackchannelLogout(services, [revoked], c.env));
        }
      }
      return tokenError(redeemed.error, redeemed.description);
    }
    const state = redeemed.state;
    if (!state.oidc || !state.assertion)
      return tokenError('invalid_grant', 'code is invalid, expired, or already used');

    const assertion = state.assertion;
    const device = await getDevice(services.db, assertion.device_id);
    const identity = device ? await getIdentity(services.db, device.idz) : null;
    if (!device || !identity) return tokenError('invalid_grant', 'device no longer exists');
    if (device.status !== 'active') return tokenError('invalid_grant', 'device is not active');

    const now = services.now();
    const sid = randomToken(24);
    const sessionPolicy = await services.hooks.onSessionCreate({
      services,
      site,
      identity,
      device,
      sid,
      assertion,
    });
    const ttl = Math.min(
      SESSION_TTL_SECONDS,
      Math.max(60, Math.floor(sessionPolicy?.ttlSeconds ?? SESSION_TTL_SECONDS)),
    );
    // Inserted only while the device is still active, serialized against revocation (F02).
    const session = await createSessionForActiveDevice(services.db, {
      sid,
      idz: device.idz,
      deviceId: device.id,
      clientId: site.clientId,
      expiresAt: new Date((now + ttl) * 1000),
    });
    if (!session) return tokenError('invalid_grant', 'device is not active');
    await recordAudit(services.db, {
      kind: 'session.created',
      idz: device.idz,
      deviceId: device.id,
      clientId: site.clientId,
      detail: { sid, acr: assertion.acr },
    });
    await stub.markExchanged(sid);

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
    const extra = await services.hooks.onTokenClaims({
      services,
      site,
      identity,
      device,
      sid,
      scope,
      assertion,
      audience: 'id_token',
    });
    const idToken = await mintIdToken(ring, {
      extra,
      issuer: services.indexUrl,
      clientId: site.clientId,
      sub: assertion.sub,
      sid,
      nonce: state.oidc.nonce,
      amr: assertion.amr,
      acr: assertion.acr,
      authTime: assertion.iat,
      deviceId: pairwiseDeviceId(site.rpId, device.id),
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
    // RFC 6750 §3: every 401 carries a `WWW-Authenticate: Bearer` challenge; when the request
    // had no token at all the challenge has no error code (§3.1).
    const tokenError = (description: string, challenge: string): Response =>
      c.json({ error: 'invalid_token', error_description: description }, 401, {
        'www-authenticate': challenge,
        'cache-control': 'no-store',
      });
    // RFC 6750 §2.1 (Authorization header) and §2.2 (form-encoded body on POST). Query strings
    // (§2.3) are not accepted: they leak into logs.
    let token = bearer(c.req.header('authorization'));
    if (
      !token &&
      c.req.method === 'POST' &&
      /^application\/x-www-form-urlencoded/i.test(c.req.header('content-type') ?? '')
    ) {
      const form = await c.req.parseBody();
      if (typeof form.access_token === 'string') token = form.access_token;
    }
    if (!token) return tokenError('bearer access token required', 'Bearer realm="identizen"');
    const invalid = (description: string): Response =>
      tokenError(
        description,
        `Bearer realm="identizen", error="invalid_token", error_description="${description}"`,
      );
    const ring = await loadKeyring(c.env);
    const claims = await verifyAccessToken(ring, services.indexUrl, token);
    if (!claims) return invalid('access token is invalid or expired');
    const session = await getSession(services.db, claims.sid);
    if (!session || !isSessionLive(session)) return invalid('session has been revoked');
    // Defense in depth for F02: a session whose device is no longer active is dead even if the
    // row was not ended.
    const device = await getDevice(services.db, session.deviceId);
    if (!device || device.status !== 'active') return invalid('device has been revoked');
    const identity = await getIdentity(services.db, session.idz);
    if (!identity) return invalid('identity no longer exists');
    const site = await getSite(services.db, session.clientId);
    const extra = await services.hooks.onTokenClaims({
      services,
      site: site ?? null,
      identity,
      device,
      sid: session.sid,
      scope: claims.scope,
      assertion: null,
      audience: 'userinfo',
    });
    return c.json({
      ...extra,
      sub: claims.sub,
      idz_device: pairwiseDeviceId(site?.rpId ?? session.clientId, session.deviceId),
      ...(claims.scope.split(' ').includes('handle') && identity.handle
        ? { idz_handle: identity.handle }
        : {}),
      ...(identity.orgId ? { idz_org: identity.orgId } : {}),
    });
  };
  r.get('/userinfo', userinfo);
  r.post('/userinfo', userinfo);

  return r;
}
