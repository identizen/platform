import { SignJWT, jwtVerify, createLocalJWKSet, type JWTPayload } from 'jose';
import { randomToken } from '../lib/util';
import { OIDC_ALG, publicJwks, type OidcKeyring } from './keys';

export const ID_TOKEN_TTL_SECONDS = 60 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const LOGOUT_TOKEN_TTL_SECONDS = 2 * 60;
export const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

export interface IdTokenInput {
  issuer: string;
  clientId: string;
  sub: string;
  sid: string;
  nonce?: string | undefined;
  amr: string[];
  acr: string;
  deviceId: string;
  handle?: string | null | undefined;
  orgId?: string | null | undefined;
  accessToken: string;
  now: number;
}

/** id_token claims per PRD 8.3: sub, sid, amr, acr, idz_device, idz_handle?, idz_org?, at_hash. No email. */
export async function mintIdToken(ring: OidcKeyring, input: IdTokenInput): Promise<string> {
  const claims: JWTPayload & Record<string, unknown> = {
    sid: input.sid,
    amr: input.amr,
    acr: input.acr,
    idz_device: input.deviceId,
    at_hash: await atHash(input.accessToken),
    ...(input.nonce !== undefined && { nonce: input.nonce }),
    ...(input.handle ? { idz_handle: input.handle } : {}),
    ...(input.orgId ? { idz_org: input.orgId } : {}),
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: OIDC_ALG, kid: ring.signer.kid, typ: 'JWT' })
    .setIssuer(input.issuer)
    .setAudience(input.clientId)
    .setSubject(input.sub)
    .setIssuedAt(input.now)
    .setExpirationTime(input.now + ID_TOKEN_TTL_SECONDS)
    .sign(ring.signer.privateKey);
}

export interface AccessTokenInput {
  issuer: string;
  clientId: string;
  sub: string;
  sid: string;
  scope: string;
  now: number;
}

/** Self-contained bearer token for /userinfo. */
export function mintAccessToken(ring: OidcKeyring, input: AccessTokenInput): Promise<string> {
  return new SignJWT({ sid: input.sid, scope: input.scope, client_id: input.clientId })
    .setProtectedHeader({ alg: OIDC_ALG, kid: ring.signer.kid, typ: 'at+jwt' })
    .setIssuer(input.issuer)
    .setAudience(input.issuer)
    .setSubject(input.sub)
    .setJti(randomToken(16))
    .setIssuedAt(input.now)
    .setExpirationTime(input.now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(ring.signer.privateKey);
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  scope: string;
  client_id: string;
}

export async function verifyAccessToken(
  ring: OidcKeyring,
  issuer: string,
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet(publicJwks(ring)), {
      issuer,
      audience: issuer,
      algorithms: [OIDC_ALG],
      typ: 'at+jwt',
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return {
      sub: payload.sub,
      sid: payload.sid,
      scope: typeof payload.scope === 'string' ? payload.scope : '',
      client_id: typeof payload.client_id === 'string' ? payload.client_id : '',
    };
  } catch {
    return null;
  }
}

/** OpenID Connect Back-Channel Logout 1.0 logout token. */
export function mintLogoutToken(
  ring: OidcKeyring,
  input: { issuer: string; clientId: string; sub: string; sid: string; now: number },
): Promise<string> {
  return new SignJWT({ events: { [BACKCHANNEL_LOGOUT_EVENT]: {} }, sid: input.sid })
    .setProtectedHeader({ alg: OIDC_ALG, kid: ring.signer.kid, typ: 'logout+jwt' })
    .setIssuer(input.issuer)
    .setAudience(input.clientId)
    .setSubject(input.sub)
    .setJti(randomToken(16))
    .setIssuedAt(input.now)
    .setExpirationTime(input.now + LOGOUT_TOKEN_TTL_SECONDS)
    .sign(ring.signer.privateKey);
}

/** Signed webhook payload for Verification API results. */
export function mintWebhookToken(
  ring: OidcKeyring,
  input: { issuer: string; clientId: string; now: number; claims: Record<string, unknown> },
): Promise<string> {
  return new SignJWT(input.claims)
    .setProtectedHeader({ alg: OIDC_ALG, kid: ring.signer.kid, typ: 'idz-webhook+jwt' })
    .setIssuer(input.issuer)
    .setAudience(input.clientId)
    .setJti(randomToken(16))
    .setIssuedAt(input.now)
    .setExpirationTime(input.now + 10 * 60)
    .sign(ring.signer.privateKey);
}

/** OIDC at_hash for ES256: left-most 128 bits of SHA-256, base64url. */
async function atHash(accessToken: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken)),
  );
  const half = digest.slice(0, 16);
  let s = '';
  for (const b of half) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
