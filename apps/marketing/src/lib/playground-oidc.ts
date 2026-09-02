import { pkceChallenge, randomString } from '@identizen/sdk';

export interface Tx {
  state: string;
  nonce: string;
  verifier: string;
}

export interface Claims {
  sub: string;
  acr: string;
  amr: string[];
  idz_device: string;
  sid: string;
}

export const TX_KEY = 'idz:playground:tx';

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

export async function newTx(): Promise<{ tx: Tx; codeChallenge: string }> {
  const tx: Tx = { state: randomString(16), nonce: randomString(16), verifier: randomString(32) };
  return { tx, codeChallenge: await pkceChallenge(tx.verifier) };
}

/** Exchange the authorization code as a public PKCE client and return the id_token claims. */
export async function exchangeCode(
  indexUrl: string,
  clientId: string,
  code: string,
  tx: Tx,
  redirectUri: string,
): Promise<Claims> {
  const res = await fetch(`${indexUrl.replace(/\/+$/, '')}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: tx.verifier,
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `token ${res.status}`);
  }
  const { id_token } = (await res.json()) as { id_token: string };
  const claims = decodeJwtPayload(id_token);
  if (claims.nonce !== tx.nonce) throw new Error('nonce_mismatch');
  return {
    sub: String(claims.sub),
    acr: String(claims.acr),
    amr: Array.isArray(claims.amr) ? (claims.amr as string[]) : [],
    idz_device: String(claims.idz_device),
    sid: String(claims.sid),
  };
}
