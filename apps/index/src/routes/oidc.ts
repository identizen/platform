import {
  createSession,
  getDevice,
  getIdentity,
  getSession,
  getSite,
  isSessionLive,
  recordAudit,
  revokeSession,
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
import { ApiError, badRequest } from '../lib/errors';
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
import { ipRateLimit } from '../middleware/rate-limit';
import { buildRedirect, fireBackchannelLogout } from '../services/sessions';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Scopes the OP grants; anything else in `scope` is ignored (RFC 6749 §3.3). */
export const SCOPES_SUPPORTED = ['openid', 'handle'] as const;

/** RFC 7636 §4.2: code_challenge is 43–128 unreserved characters. */
const CODE_CHALLENGE_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/**
 * PKCE (S256) is mandatory for every client. The one exception is a conformance run: with
 * `OIDC_PKCE_OPTIONAL=true` a confidential client may omit it, because the OpenID Foundation's
 * Basic OP plan sends plain Core requests. Public clients never get the exception.
 */
export function pkceRequired(
  env: { OIDC_PKCE_OPTIONAL?: string | undefined },
  site: { clientSecretHash: string | null },
): boolean {
  return env.OIDC_PKCE_OPTIONAL !== 'true' || site.clientSecretHash === null;
}

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
    const redirectUri = q.redirect_uri;
    if (!redirectUri || !site.redirectUris.includes(redirectUri)) {
      throw badRequest('invalid_request', 'redirect_uri is not registered for this client');
    }
    const state = q.state;
    const fail = (error: string, description: string): Response =>
      c.redirect(buildRedirect(redirectUri, { error, error_description: description, state }), 302);

    // RFC 6749 §4.1.2.1: a missing required parameter is invalid_request; an unsupported
    // response_type is unsupported_response_type.
    if (!q.response_type) return fail('invalid_request', 'response_type is required');
    if (q.response_type !== 'code')
      return fail('unsupported_response_type', 'response_type must be code');
    // Core §6.1 / §3.1.2.6: request objects are not supported (discovery says so).
    if (q.request !== undefined)
      return fail('request_not_supported', 'the request parameter is not supported');
    if (q.request_uri !== undefined)
      return fail('request_uri_not_supported', 'the request_uri parameter is not supported');
    const requested = (q.scope ?? '').split(/\s+/).filter(Boolean);
    if (!requested.includes('openid')) return fail('invalid_scope', 'scope must include openid');
    // RFC 6749 §3.3: unknown scopes are ignored; the token response carries the granted scope.
    const scopes = requested.filter((s) => (SCOPES_SUPPORTED as readonly string[]).includes(s));
    const usesPkce =
      q.code_challenge !== undefined ||
      q.code_challenge_method !== undefined ||
      pkceRequired(c.env, site);
    if (usesPkce) {
      if (!q.code_challenge || q.code_challenge_method !== 'S256') {
        return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
      }
      if (!CODE_CHALLENGE_RE.test(q.code_challenge))
        return fail('invalid_request', 'code_challenge must be 43-128 unreserved characters');
    }
    // Core §3.1.2.1: acr_values requests acr as a voluntary claim; unknown values are ignored.
    const acrValues = (q.acr_values ?? '')
      .split(/\s+/)
      .filter((a) => AcrSchema.safeParse(a).success);
    // acr_values is voluntary: satisfy the strongest value the request can. Step-up (idz:mfa)
    // needs login_hint to know which phone to push to; when idz:login is also listed the login
    // proceeds at that level, and only a request for idz:mfa alone without a hint is refused.
    const acr: Acr =
      acrValues.includes(ACR_MFA) && (q.login_hint || !acrValues.includes(ACR_LOGIN))
        ? ACR_MFA
        : ACR_LOGIN;
    if (acr === ACR_MFA && !q.login_hint)
      return fail('invalid_request', 'acr_values=idz:mfa requires login_hint');
    const prompts = (q.prompt ?? '').split(/\s+/).filter(Boolean);
    if (prompts.includes('none')) {
      // Core §3.1.2.1: `none` MUST NOT be combined with other prompt values.
      if (prompts.length > 1)
        return fail('invalid_request', 'prompt=none cannot be combined with other values');
      return fail(
        'interaction_required',
        'Identizen always requires the user to approve on their phone',
      );
    }

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
            ...(usesPkce && { code_challenge: q.code_challenge, code_challenge_method: 'S256' }),
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

    // Redeem the code at the session DO (single use).
    const [challengeId, secret] = code.split('.');
    if (!challengeId || !secret) return tokenError('invalid_grant', 'malformed code');
    const stub = c.env.CHALLENGE_SESSION.getByName(challengeId);
    const state = await stub.redeemCode(code, site.clientId);
    if (!state?.oidc || !state.assertion) {
      // RFC 6749 §4.1.2: a code presented twice has probably leaked; revoke the session the
      // first exchange created so the attacker and the victim both lose it.
      const leaked = await stub.exchangedSessionFor(code);
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
      return tokenError('invalid_grant', 'code is invalid, expired, or already used');
    }
    if (state.clientId !== site.clientId)
      return tokenError('invalid_grant', 'code was issued to another client');
    const redirectUri = get('redirect_uri');
    if (state.oidc.redirect_uri && redirectUri !== state.oidc.redirect_uri) {
      return tokenError('invalid_grant', 'redirect_uri does not match the authorization request');
    }
    // RFC 7636 §4.6: a code issued against a code_challenge needs the matching verifier. A code
    // issued without one (only possible with OIDC_PKCE_OPTIONAL) must not be exchanged with one.
    if (state.oidc.code_challenge !== undefined) {
      if (!verifier) return tokenError('invalid_request', 'code_verifier is required');
      if (toBase64Url(sha256(utf8Encode(verifier))) !== state.oidc.code_challenge)
        return tokenError('invalid_grant', 'PKCE verification failed');
    } else if (verifier !== undefined) {
      return tokenError('invalid_grant', 'code was issued without PKCE');
    }

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
