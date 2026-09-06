/**
 * One validator for every way a login can start with a redirect at the end of it: the OIDC
 * `/authorize` endpoint and the JSON `/challenge` twin the SDK uses. Both must agree on what a
 * registered redirect is, when PKCE is required, which scopes exist, and what `prompt` and
 * `acr_values` mean, or a code can be issued to a destination the site never registered.
 */
import { AcrSchema, ACR_LOGIN, ACR_MFA, type Acr } from '@identizen/protocol';
import type { OidcParams } from '../do/challenge-session';

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

/**
 * RFC 6749 §3.1.2.3 / OAuth 2.0 Security BCP §4.1.3: the redirect must match a registered URI
 * exactly, and a request that fails this check is never redirected. Returns the URI when it is
 * registered, null otherwise.
 */
export function registeredRedirect(
  site: { redirectUris: string[] },
  redirectUri: string | undefined,
): string | null {
  return redirectUri && site.redirectUris.includes(redirectUri) ? redirectUri : null;
}

export type AuthorizeRequestParams = Record<string, string | undefined>;

export type AuthorizeRequest =
  | { ok: true; acr: Acr; loginHint: string | null; oidc: OidcParams }
  | { ok: false; error: string; description: string };

/**
 * Validate an authorization request after the redirect has been checked. Errors are meant to be
 * redirected (OIDC) or returned as JSON (the `/challenge` twin); the caller chooses.
 */
export function validateAuthorizeRequest(
  env: { OIDC_PKCE_OPTIONAL?: string | undefined },
  site: { clientId: string; clientSecretHash: string | null },
  q: AuthorizeRequestParams,
  opts: { redirectUri: string; responseTypeRequired: boolean },
): AuthorizeRequest {
  const fail = (error: string, description: string): AuthorizeRequest => ({
    ok: false,
    error,
    description,
  });

  if (opts.responseTypeRequired) {
    // RFC 6749 §4.1.2.1: a missing required parameter is invalid_request; an unsupported
    // response_type is unsupported_response_type.
    if (!q.response_type) return fail('invalid_request', 'response_type is required');
    if (q.response_type !== 'code')
      return fail('unsupported_response_type', 'response_type must be code');
  }
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
    pkceRequired(env, site);
  if (usesPkce) {
    if (!q.code_challenge || q.code_challenge_method !== 'S256') {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    if (!CODE_CHALLENGE_RE.test(q.code_challenge))
      return fail('invalid_request', 'code_challenge must be 43-128 unreserved characters');
  }

  // Core §3.1.2.1: acr_values requests acr as a voluntary claim; unknown values are ignored.
  // Satisfy the strongest value the request can. Step-up (idz:mfa) needs login_hint to know
  // which phone to push to; when idz:login is also listed the login proceeds at that level, and
  // only a request for idz:mfa alone without a hint is refused.
  const acrValues = (q.acr_values ?? '').split(/\s+/).filter((a) => AcrSchema.safeParse(a).success);
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

  return {
    ok: true,
    acr,
    loginHint: q.login_hint ?? null,
    oidc: {
      client_id: site.clientId,
      redirect_uri: opts.redirectUri,
      ...(q.state !== undefined && { state: q.state }),
      ...(q.nonce !== undefined && { nonce: q.nonce }),
      ...(usesPkce && q.code_challenge !== undefined
        ? { code_challenge: q.code_challenge, code_challenge_method: 'S256' as const }
        : {}),
      scope: scopes.join(' '),
      ...(q.prompt !== undefined && { prompt: q.prompt }),
      ...(q.login_hint !== undefined && { login_hint: q.login_hint }),
    },
  };
}
