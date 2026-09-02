/**
 * Signing and verification (PROTOCOL.md sections 2, 3, 4, 6.4, 8).
 *
 * Every signature is Ed25519 over `"identizen/v1/" + type + "\n" + canonicalize(payload)`.
 */
import { sha256 } from '@noble/hashes/sha256';
import { canonicalize } from './canonicalize';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding';
import { ed25519Sign, ed25519Verify, siteSub } from './keys';
import {
  AssertionSchema,
  CHALLENGE_TTL_SECONDS,
  CLOCK_SKEW_SECONDS,
  ChallengeSchema,
  PairingSchema,
  SignedAssertionSchema,
  SignedChallengeSchema,
  SignedPairingSchema,
  type Acr,
  type Amr,
  type Assertion,
  type Challenge,
  type Pairing,
  type SignedAssertion,
  type SignedChallenge,
  type SignedPairing,
} from './schemas';

export const SIGNING_PREFIX = 'identizen/v1/';

export type SignedType = 'challenge' | 'assertion' | 'pairing' | 'request' | 'identity' | 'paired';

/** Bytes that are signed for a payload of the given type. */
export function signingBytes(type: SignedType, payload: unknown): Uint8Array {
  return utf8Encode(`${SIGNING_PREFIX}${type}\n${canonicalize(payload)}`);
}

/** Generic sign: returns base64url signature. */
export function signPayload(type: SignedType, payload: unknown, privateKey: Uint8Array): string {
  return toBase64Url(ed25519Sign(signingBytes(type, payload), privateKey));
}

/** Generic verify: never throws. */
export function verifyPayload(
  type: SignedType,
  payload: unknown,
  sig: string,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed25519Verify(fromBase64Url(sig), signingBytes(type, payload), publicKey);
  } catch {
    return false;
  }
}

/** `base64url(SHA-256(UTF8(reason)))`, or null. */
export function reasonHash(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) return null;
  return toBase64Url(sha256(utf8Encode(reason)));
}

export type VerifyResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Challenge

export interface CreateChallengeInput {
  id: string;
  rp_id: string;
  rp_name: string;
  nonce: string;
  code: string;
  iat: number;
  index: string;
  acr: Acr;
  reason?: string | null;
}

/** Build a well-formed challenge (exp = iat + 60). Validates against the schema. */
export function createChallenge(input: CreateChallengeInput): Challenge {
  const c = {
    type: 'challenge' as const,
    id: input.id,
    rp_id: input.rp_id,
    rp_name: input.rp_name,
    nonce: input.nonce,
    code: input.code,
    iat: input.iat,
    exp: input.iat + CHALLENGE_TTL_SECONDS,
    index: input.index,
    acr: input.acr,
    reason: input.reason ?? null,
  };
  return ChallengeSchema.parse(c);
}

/** Sign a challenge with the index signing key. */
export function signChallenge(challenge: Challenge, indexPrivateKey: Uint8Array): SignedChallenge {
  const payload = ChallengeSchema.parse(challenge);
  return { payload, sig: signPayload('challenge', payload, indexPrivateKey) };
}

export interface VerifyChallengeOptions {
  /** Unix seconds; defaults to now. */
  now?: number;
  /** Expected `index` issuer URL; when given, must match exactly. */
  index?: string;
}

/** Verify shape, signature (against the pinned index key), and freshness. */
export function verifyChallenge(
  signed: unknown,
  indexPublicKey: Uint8Array,
  opts: VerifyChallengeOptions = {},
): VerifyResult<Challenge> {
  const parsed = SignedChallengeSchema.safeParse(signed);
  if (!parsed.success) return { ok: false, error: 'malformed_challenge' };
  const { payload, sig } = parsed.data;
  if (!verifyPayload('challenge', payload, sig, indexPublicKey)) {
    return { ok: false, error: 'bad_index_signature' };
  }
  if (opts.index !== undefined && payload.index !== opts.index) {
    return { ok: false, error: 'wrong_index' };
  }
  const now = opts.now ?? nowSeconds();
  if (now > payload.exp + CLOCK_SKEW_SECONDS) return { ok: false, error: 'expired' };
  if (now < payload.iat - CLOCK_SKEW_SECONDS) return { ok: false, error: 'not_yet_valid' };
  return { ok: true, value: payload };
}

// ---------------------------------------------------------------------------
// Assertion

export interface CreateAssertionInput {
  challenge: Challenge;
  sitePublicKey: Uint8Array;
  deviceId: string;
  amr: Amr[];
  iat?: number;
}

/** Build the unsigned assertion for a challenge. */
export function createAssertion(input: CreateAssertionInput): Assertion {
  const a = {
    type: 'assertion' as const,
    challenge_id: input.challenge.id,
    nonce: input.challenge.nonce,
    rp_id: input.challenge.rp_id,
    sub: siteSub(input.sitePublicKey),
    site_pubkey: toBase64Url(input.sitePublicKey),
    device_id: input.deviceId,
    iat: input.iat ?? nowSeconds(),
    amr: input.amr,
    acr: input.challenge.acr,
    reason_hash: reasonHash(input.challenge.reason),
  };
  return AssertionSchema.parse(a);
}

/** Sign an assertion with the per-site key and the device key. */
export function signAssertion(
  assertion: Assertion,
  sitePrivateKey: Uint8Array,
  devicePrivateKey: Uint8Array,
): SignedAssertion {
  const payload = AssertionSchema.parse(assertion);
  return {
    payload,
    site_sig: signPayload('assertion', payload, sitePrivateKey),
    device_sig: signPayload('assertion', payload, devicePrivateKey),
  };
}

export interface VerifyAssertionOptions {
  /** Unix seconds; defaults to now. */
  now?: number;
}

/**
 * Verify an assertion against its challenge and the registered device key
 * (PROTOCOL.md section 4.1 steps 1, 3, 5, 6). Revocation, TOFU binding and the
 * challenge lookup are the index's job and happen around this call.
 */
export function verifyAssertion(
  signed: unknown,
  challenge: Challenge,
  devicePublicKey: Uint8Array,
  opts: VerifyAssertionOptions = {},
): VerifyResult<Assertion> {
  const parsed = SignedAssertionSchema.safeParse(signed);
  if (!parsed.success) return { ok: false, error: 'malformed_assertion' };
  const { payload, site_sig, device_sig } = parsed.data;

  if (payload.challenge_id !== challenge.id) return { ok: false, error: 'challenge_mismatch' };
  if (payload.nonce !== challenge.nonce) return { ok: false, error: 'nonce_mismatch' };
  if (payload.rp_id !== challenge.rp_id) return { ok: false, error: 'rp_id_mismatch' };
  if (payload.acr !== challenge.acr) return { ok: false, error: 'acr_mismatch' };
  if (payload.reason_hash !== reasonHash(challenge.reason)) {
    return { ok: false, error: 'reason_mismatch' };
  }
  const now = opts.now ?? nowSeconds();
  if (now > challenge.exp + CLOCK_SKEW_SECONDS) return { ok: false, error: 'expired' };
  if (payload.iat < challenge.iat - CLOCK_SKEW_SECONDS)
    return { ok: false, error: 'iat_too_early' };
  if (payload.iat > challenge.exp + CLOCK_SKEW_SECONDS) return { ok: false, error: 'iat_too_late' };

  if (!verifyPayload('assertion', payload, device_sig, devicePublicKey)) {
    return { ok: false, error: 'bad_device_signature' };
  }
  let sitePub: Uint8Array;
  try {
    sitePub = fromBase64Url(payload.site_pubkey);
  } catch {
    return { ok: false, error: 'bad_site_pubkey' };
  }
  if (siteSub(sitePub) !== payload.sub) return { ok: false, error: 'sub_mismatch' };
  if (!verifyPayload('assertion', payload, site_sig, sitePub)) {
    return { ok: false, error: 'bad_site_signature' };
  }
  return { ok: true, value: payload };
}

// ---------------------------------------------------------------------------
// Pairing

export function signPairing(pairing: Pairing, indexPrivateKey: Uint8Array): SignedPairing {
  const payload = PairingSchema.parse(pairing);
  return { payload, sig: signPayload('pairing', payload, indexPrivateKey) };
}

export function verifyPairing(signed: unknown, indexPublicKey: Uint8Array): VerifyResult<Pairing> {
  const parsed = SignedPairingSchema.safeParse(signed);
  if (!parsed.success) return { ok: false, error: 'malformed_pairing' };
  if (!verifyPayload('pairing', parsed.data.payload, parsed.data.sig, indexPublicKey)) {
    return { ok: false, error: 'bad_index_signature' };
  }
  return { ok: true, value: parsed.data.payload };
}

/** Bytes a paired browser signs (ECDSA P-256) to prove it holds the browser key. */
export function pairedSignatureBytes(challengeId: string): Uint8Array {
  return utf8Encode(`${SIGNING_PREFIX}paired\n${challengeId}`);
}

// ---------------------------------------------------------------------------
// Idz-Signature request authentication (section 8)

export const REQUEST_SKEW_SECONDS = 60;

export interface RequestSignatureInput {
  method: string;
  /** Path including query string, e.g. `/me/devices?x=1`. */
  path: string;
  body: string | Uint8Array;
  timestamp: number;
}

export function requestSigningBytes(input: RequestSignatureInput): Uint8Array {
  const body = typeof input.body === 'string' ? utf8Encode(input.body) : input.body;
  const bodyHash = toBase64Url(sha256(body));
  return utf8Encode(
    `${SIGNING_PREFIX}request\n${input.method.toUpperCase()}\n${input.path}\n${bodyHash}\n${input.timestamp}`,
  );
}

export interface IdzSignature {
  device_id: string;
  timestamp: number;
  sig: string;
}

/** Produce the `Idz-Signature` header value. */
export function signRequest(
  input: RequestSignatureInput,
  deviceId: string,
  devicePrivateKey: Uint8Array,
): string {
  const sig = toBase64Url(ed25519Sign(requestSigningBytes(input), devicePrivateKey));
  return `v1,d=${deviceId},t=${input.timestamp},s=${sig}`;
}

/** Parse an `Idz-Signature` header. Returns null if malformed. */
export function parseIdzSignature(header: string | null | undefined): IdzSignature | null {
  if (!header) return null;
  const parts = header.split(',');
  if (parts[0] !== 'v1' || parts.length !== 4) return null;
  const kv = new Map<string, string>();
  for (const p of parts.slice(1)) {
    const i = p.indexOf('=');
    if (i <= 0) return null;
    kv.set(p.slice(0, i), p.slice(i + 1));
  }
  const d = kv.get('d');
  const t = kv.get('t');
  const s = kv.get('s');
  if (!d || !t || !s || !/^\d+$/.test(t)) return null;
  return { device_id: d, timestamp: Number(t), sig: s };
}

export interface VerifyRequestOptions {
  now?: number;
  skewSeconds?: number;
}

/** Verify an `Idz-Signature` against the device public key and the clock. */
export function verifyRequestSignature(
  parsed: IdzSignature,
  input: RequestSignatureInput,
  devicePublicKey: Uint8Array,
  opts: VerifyRequestOptions = {},
): VerifyResult<IdzSignature> {
  const now = opts.now ?? nowSeconds();
  const skew = opts.skewSeconds ?? REQUEST_SKEW_SECONDS;
  if (Math.abs(now - parsed.timestamp) > skew) return { ok: false, error: 'stale_timestamp' };
  if (parsed.timestamp !== input.timestamp) return { ok: false, error: 'timestamp_mismatch' };
  let sig: Uint8Array;
  try {
    sig = fromBase64Url(parsed.sig);
  } catch {
    return { ok: false, error: 'malformed_signature' };
  }
  if (!ed25519Verify(sig, requestSigningBytes(input), devicePublicKey)) {
    return { ok: false, error: 'bad_signature' };
  }
  return { ok: true, value: parsed };
}

// ---------------------------------------------------------------------------
// Identity registration proof: master key signs the device public key.

export function signIdentityProof(devicePubkey: string, masterPrivateKey: Uint8Array): string {
  return signPayload('identity', { device_pubkey: devicePubkey }, masterPrivateKey);
}

export function verifyIdentityProof(
  devicePubkey: string,
  sig: string,
  masterPublicKey: Uint8Array,
): boolean {
  return verifyPayload('identity', { device_pubkey: devicePubkey }, sig, masterPublicKey);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
