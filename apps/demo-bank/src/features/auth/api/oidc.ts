/**
 * OIDC authorization code + PKCE against the Identizen index, from the browser (public client).
 *
 * 1. `beginSignIn` makes the PKCE verifier/challenge, state and nonce, and remembers them for
 *    this tab. The <IdentizenButton> starts the login with those values; when the phone approves,
 *    the index hands the browser a redirect to /callback?code=…&state=….
 * 2. `completeSignIn` exchanges the code at the index's /token endpoint, checks state and nonce,
 *    and stores the session.
 */
import { pkceChallenge, randomString } from '@identizen/sdk';
import { CLIENT_ID, INDEX_URL, redirectUri } from '@/lib/config';
import { setSession, type BankSession, type SessionClaims } from './session';

const TX_KEY = 'jtm:oidc-tx';

export interface SignInTransaction {
  state: string;
  nonce: string;
  verifier: string;
  codeChallenge: string;
  redirectUri: string;
}

export async function beginSignIn(cryptoImpl: Crypto = crypto): Promise<SignInTransaction> {
  const verifier = randomString(32, cryptoImpl);
  const tx: SignInTransaction = {
    state: randomString(16, cryptoImpl),
    nonce: randomString(16, cryptoImpl),
    verifier,
    codeChallenge: await pkceChallenge(verifier, cryptoImpl),
    redirectUri: redirectUri(),
  };
  sessionStorage.setItem(TX_KEY, JSON.stringify(tx));
  return tx;
}

function readTransaction(): SignInTransaction | null {
  try {
    const raw = sessionStorage.getItem(TX_KEY);
    sessionStorage.removeItem(TX_KEY);
    return raw ? (JSON.parse(raw) as SignInTransaction) : null;
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
}

function decodePayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

/** The index signed the id_token and just issued it over TLS; the browser only reads claims. */
export function decodeClaims(idToken: string): SessionClaims {
  const p = decodePayload(idToken);
  if (typeof p.sub !== 'string' || typeof p.sid !== 'string')
    throw new Error('id_token is missing sub or sid');
  return {
    sub: p.sub,
    sid: p.sid,
    acr: typeof p.acr === 'string' ? p.acr : 'idz:login',
    amr: Array.isArray(p.amr) ? (p.amr as string[]) : [],
    ...(typeof p.idz_handle === 'string' ? { idz_handle: p.idz_handle } : {}),
  };
}

export async function completeSignIn(
  params: URLSearchParams,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<BankSession> {
  const error = params.get('error');
  if (error) throw new Error(`Sign-in failed: ${error}`);
  const tx = readTransaction();
  const code = params.get('code');
  if (!tx)
    throw new Error('This sign-in was started in another window. Go back to it to continue.');
  if (!code || params.get('state') !== tx.state)
    throw new Error('Sign-in state mismatch. Try again.');
  const res = await fetchImpl(`${INDEX_URL}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: tx.redirectUri,
      code_verifier: tx.verifier,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}).`);
  const tokens = (await res.json()) as TokenResponse;
  if (decodePayload(tokens.id_token).nonce !== tx.nonce)
    throw new Error('Sign-in nonce mismatch. Try again.');
  const session: BankSession = {
    accessToken: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    claims: decodeClaims(tokens.id_token),
  };
  setSession(session);
  return session;
}

let inflight: { key: string; promise: Promise<BankSession> } | null = null;

/** At most one exchange per callback URL for the life of the page; later callers join it. */
export function completeSignInOnce(params: URLSearchParams): Promise<BankSession> {
  const key = params.toString();
  if (inflight?.key === key) return inflight.promise;
  const promise = completeSignIn(params);
  inflight = { key, promise };
  return promise;
}
