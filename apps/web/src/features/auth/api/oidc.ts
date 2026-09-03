import { authorizationUrl, pkceChallenge, randomString } from '@identizen/sdk';
import { INDEX_URL, redirectUri, resolveClientId } from '@/lib/config';
import { setSession, type DashboardSession, type SessionClaims } from './session';

const TX_KEY = 'idz:oidc-tx';

export interface OidcTransaction {
  state: string;
  nonce: string;
  verifier: string;
  clientId: string;
}

export interface SignInDeps {
  fetchImpl?: typeof fetch;
  cryptoImpl?: Crypto;
}

/** Build the /authorize URL (PKCE S256) and remember the transaction for the callback. */
export async function buildSignIn(
  deps: SignInDeps = {},
): Promise<{ url: string; tx: OidcTransaction }> {
  const cryptoImpl = deps.cryptoImpl ?? crypto;
  const clientId = await resolveClientId(deps.fetchImpl);
  const tx: OidcTransaction = {
    state: randomString(16, cryptoImpl),
    nonce: randomString(16, cryptoImpl),
    verifier: randomString(32, cryptoImpl),
    clientId,
  };
  sessionStorage.setItem(TX_KEY, JSON.stringify(tx));
  const url = authorizationUrl({
    indexUrl: INDEX_URL,
    clientId,
    redirectUri: redirectUri(),
    state: tx.state,
    nonce: tx.nonce,
    codeChallenge: await pkceChallenge(tx.verifier, cryptoImpl),
    scope: 'openid handle',
  });
  return { url, tx };
}

export async function startSignIn(): Promise<void> {
  const { url } = await buildSignIn();
  location.assign(url);
}

export function readTransaction(): OidcTransaction | null {
  try {
    const raw = sessionStorage.getItem(TX_KEY);
    sessionStorage.removeItem(TX_KEY);
    return raw ? (JSON.parse(raw) as OidcTransaction) : null;
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
}

/** Decode the id_token payload. The index signed it and just issued it over TLS; the dashboard only reads claims. */
export function decodeClaims(idToken: string): SessionClaims {
  const part = idToken.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(json) as Partial<SessionClaims> & { nonce?: string };
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
    throw new Error('id_token is missing sub or sid');
  return {
    sub: payload.sub,
    sid: payload.sid,
    acr: typeof payload.acr === 'string' ? payload.acr : 'idz:login',
    amr: Array.isArray(payload.amr) ? payload.amr : [],
    ...(typeof payload.idz_handle === 'string' ? { idz_handle: payload.idz_handle } : {}),
  };
}

/** Exchange the authorization code (public client: no secret) and store the session. */
let inflight: { key: string; promise: Promise<DashboardSession> } | null = null;

/**
 * `completeSignIn`, but at most once per callback URL for the life of the page. The exchange
 * consumes the stored transaction and the one-time code, so a second call for the same callback
 * (an effect re-running, StrictMode, a re-render mid-exchange) must join the first instead of
 * failing with a state mismatch after the first one already succeeded.
 */
export function completeSignInOnce(
  params: URLSearchParams,
  deps: SignInDeps = {},
): Promise<DashboardSession> {
  const key = params.toString();
  if (inflight?.key === key) return inflight.promise;
  const promise = completeSignIn(params, deps);
  inflight = { key, promise };
  return promise;
}

export async function completeSignIn(
  params: URLSearchParams,
  deps: SignInDeps = {},
): Promise<DashboardSession> {
  const fetchImpl =
    deps.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init));
  const error = params.get('error');
  if (error) throw new Error(`Sign-in failed: ${error}`);
  const tx = readTransaction();
  const code = params.get('code');
  if (!tx || !code || params.get('state') !== tx.state)
    throw new Error('Sign-in state mismatch. Try again.');
  const res = await fetchImpl(`${INDEX_URL}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: tx.verifier,
      client_id: tx.clientId,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}).`);
  const tokens = (await res.json()) as TokenResponse;
  const claims = decodeClaims(tokens.id_token);
  const payloadNonce = (
    JSON.parse(
      atob((tokens.id_token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
    ) as { nonce?: string }
  ).nonce;
  if (payloadNonce !== tx.nonce) throw new Error('Sign-in nonce mismatch. Try again.');
  const session: DashboardSession = {
    accessToken: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    claims,
  };
  setSession(session);
  return session;
}
