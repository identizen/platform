import { importJWK, type CryptoKey, type JWK } from 'jose';
import type { Env } from '../env';

export const OIDC_ALG = 'ES256';

export interface OidcKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

export interface OidcKeyring {
  /** Signs new tokens. The first key in `OIDC_SIGNING_KEYS`. */
  signer: OidcKey;
  /** All keys accepted for verification and published in the JWKS (rotation: two active keys). */
  keys: OidcKey[];
}

let cache: { raw: string; ring: OidcKeyring } | null = null;

/**
 * Load the OP keyring from `OIDC_SIGNING_KEYS` (JSON array of private ES256 JWKs with `kid`).
 * Rotation: prepend a new key, deploy, wait for old tokens to expire, drop the old key.
 */
export async function loadKeyring(env: Env): Promise<OidcKeyring> {
  const raw = env.OIDC_SIGNING_KEYS;
  if (!raw) throw new Error('OIDC_SIGNING_KEYS is not configured');
  if (cache && cache.raw === raw) return cache.ring;
  const jwks = JSON.parse(raw) as JWK[];
  if (!Array.isArray(jwks) || jwks.length === 0)
    throw new Error('OIDC_SIGNING_KEYS must be a non-empty JSON array');
  const keys: OidcKey[] = [];
  for (const jwk of jwks) {
    if (!jwk.kid) throw new Error('every OIDC signing key needs a kid');
    const privateKey = (await importJWK(jwk, OIDC_ALG)) as CryptoKey;
    const { d: _d, ...pub } = jwk;
    keys.push({ kid: jwk.kid, privateKey, publicJwk: { ...pub, alg: OIDC_ALG, use: 'sig' } });
  }
  const signer = keys[0];
  if (!signer) throw new Error('no signing key');
  const ring = { signer, keys };
  cache = { raw, ring };
  return ring;
}

export function publicJwks(ring: OidcKeyring): { keys: JWK[] } {
  return { keys: ring.keys.map((k) => k.publicJwk) };
}
