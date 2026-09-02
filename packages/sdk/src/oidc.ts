/** OIDC / PKCE helpers that run anywhere WebCrypto exists (browser, Node 20+, Workers, Bun). */

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(bytes = 32, cryptoImpl: Crypto = crypto): string {
  return b64url(cryptoImpl.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(
  verifier: string,
  cryptoImpl: Crypto = crypto,
): Promise<string> {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export interface AuthorizationRequest {
  indexUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scope?: string;
  acr?: 'idz:login' | 'idz:mfa';
  loginHint?: string;
  prompt?: 'enroll' | 'login';
}

/** Build the `/authorize` URL for the hosted login page. */
export function authorizationUrl(req: AuthorizationRequest): string {
  const url = new URL('/authorize', req.indexUrl.replace(/\/+$/, '') + '/');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', req.clientId);
  url.searchParams.set('redirect_uri', req.redirectUri);
  url.searchParams.set('scope', req.scope ?? 'openid');
  url.searchParams.set('state', req.state);
  url.searchParams.set('nonce', req.nonce);
  url.searchParams.set('code_challenge', req.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (req.acr) url.searchParams.set('acr_values', req.acr);
  if (req.loginHint) url.searchParams.set('login_hint', req.loginHint);
  if (req.prompt) url.searchParams.set('prompt', req.prompt);
  return url.toString();
}
