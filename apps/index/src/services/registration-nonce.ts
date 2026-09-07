/**
 * Registration nonces (PROTOCOL.md §8.1). `POST /devices/nonce` hands out a short-lived token
 * that the phone binds into its identity proof, so a proof only works on this index and only for
 * two minutes. The token is stateless: an HMAC under a key derived from the index signing key.
 * Nothing needs to remember it, because a device key is enrolled at most once: a replayed proof
 * finds its key already known and cannot create a second enrolment.
 */
import { fromBase64Url, randomBytes, sha256, toBase64Url, utf8Encode } from '@identizen/protocol';
import type { Services } from '../lib/services';

/** A nonce must be used within two minutes of issue: enrolment takes seconds. */
export const REGISTRATION_NONCE_TTL_MS = 2 * 60_000;
const EXP_BYTES = 8;
const RANDOM_BYTES = 16;
const MAC_BYTES = 16;

async function macKey(services: Services): Promise<CryptoKey> {
  const raw = sha256(
    new Uint8Array([
      ...utf8Encode('identizen/v1/registration-nonce\n'),
      ...services.indexKey.privateKey,
    ]),
  );
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function mac(services: Services, data: Uint8Array): Promise<Uint8Array> {
  const key = await macKey(services);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(data))).slice(
    0,
    MAC_BYTES,
  );
}

export async function issueRegistrationNonce(
  services: Services,
): Promise<{ nonce: string; exp: number }> {
  const expMs = Date.now() + REGISTRATION_NONCE_TTL_MS;
  const head = new Uint8Array(EXP_BYTES + RANDOM_BYTES);
  new DataView(head.buffer).setBigUint64(0, BigInt(expMs));
  head.set(randomBytes(RANDOM_BYTES), EXP_BYTES);
  const tag = await mac(services, head);
  const nonce = toBase64Url(new Uint8Array([...head, ...tag]));
  return { nonce, exp: Math.floor(expMs / 1000) };
}

export type NonceCheck = 'ok' | 'invalid' | 'expired';

/** Validate a nonce: issued by this index, and not older than two minutes. */
export async function checkRegistrationNonce(
  services: Services,
  nonce: string,
): Promise<NonceCheck> {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(nonce);
  } catch {
    return 'invalid';
  }
  if (bytes.length !== EXP_BYTES + RANDOM_BYTES + MAC_BYTES) return 'invalid';
  const head = bytes.slice(0, EXP_BYTES + RANDOM_BYTES);
  const tag = bytes.slice(EXP_BYTES + RANDOM_BYTES);
  const expected = await mac(services, head);
  let diff = 0;
  for (let i = 0; i < MAC_BYTES; i++) diff |= (tag[i] ?? 0) ^ (expected[i] ?? 0);
  if (diff !== 0) return 'invalid';
  const expMs = Number(new DataView(head.buffer, head.byteOffset).getBigUint64(0));
  if (Date.now() > expMs) return 'expired';
  return 'ok';
}
