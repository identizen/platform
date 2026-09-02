/**
 * Keys and identifiers (PROTOCOL.md section 1).
 *
 * All Ed25519 operations go through @noble/ed25519 with a synchronous SHA-512 so the
 * same code runs on Hermes (no WebCrypto) and in browsers/Workers/Node.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import { concatBytes, randomBytes, toBase64Url, utf8Encode } from './encoding';

ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));

export const SEED_BYTES = 32;
export const MASTER_SALT = 'identizen/v1/master';
export const SITE_SALT = 'identizen/v1/site';

export interface KeyPair {
  /** 32-byte Ed25519 private key (RFC 8032 seed). Never leaves the device. */
  readonly privateKey: Uint8Array;
  /** 32-byte Ed25519 public key. */
  readonly publicKey: Uint8Array;
}

/** Generate a fresh 256-bit seed from the platform CSPRNG. */
export function generateSeed(): Uint8Array {
  return randomBytes(SEED_BYTES);
}

/** Encode a 32-byte seed as 24 BIP39 English words. */
export function seedToMnemonic(seed: Uint8Array): string {
  if (seed.length !== SEED_BYTES) throw new Error('seed must be 32 bytes');
  return entropyToMnemonic(seed, english);
}

/** Decode 24 BIP39 English words back to the 32-byte seed. Throws on invalid checksum. */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  if (!validateMnemonic(normalized, english)) throw new Error('invalid mnemonic');
  const seed = mnemonicToEntropy(normalized, english);
  if (seed.length !== SEED_BYTES) throw new Error('mnemonic must encode 256 bits');
  return seed;
}

/** The BIP39 English wordlist (for autocomplete UIs). */
export const BIP39_WORDLIST: readonly string[] = english;

/** Derive an Ed25519 key pair from a 32-byte private key. */
export function keyPairFromPrivateKey(privateKey: Uint8Array): KeyPair {
  if (privateKey.length !== 32) throw new Error('private key must be 32 bytes');
  return { privateKey, publicKey: ed.getPublicKey(privateKey) };
}

/** Fresh, non-derived Ed25519 key pair (device key). */
export function generateKeyPair(): KeyPair {
  return keyPairFromPrivateKey(ed.utils.randomPrivateKey());
}

/** HKDF-SHA256(seed, salt, info) -> 32 bytes -> Ed25519 key pair. */
export function deriveKeyPair(seed: Uint8Array, salt: string, info: string): KeyPair {
  if (seed.length !== SEED_BYTES) throw new Error('seed must be 32 bytes');
  const priv = hkdf(sha256, seed, utf8Encode(salt), utf8Encode(info), 32);
  return keyPairFromPrivateKey(priv);
}

/** Master key: anchors the identity in the index. */
export function deriveMasterKey(seed: Uint8Array): KeyPair {
  return deriveKeyPair(seed, MASTER_SALT, '');
}

/** Per-site key for `rp_id` (the site's registered origin host). */
export function deriveSiteKey(seed: Uint8Array, rpId: string): KeyPair {
  return deriveKeyPair(seed, SITE_SALT, normalizeRpId(rpId));
}

/** `base64url(SHA-256(pubkey))[0:32]` — used for both `idz` and `sub`. */
export function publicKeyId(publicKey: Uint8Array): string {
  return toBase64Url(sha256(publicKey)).slice(0, 32);
}

/** Identity ID from the master public key. */
export function identityId(masterPublicKey: Uint8Array): string {
  return publicKeyId(masterPublicKey);
}

/** Per-site `sub` from the per-site public key. */
export function siteSub(sitePublicKey: Uint8Array): string {
  return publicKeyId(sitePublicKey);
}

/** Lower-case host, no scheme, no port, no trailing dot. */
export function normalizeRpId(rpId: string): string {
  let host = rpId.trim().toLowerCase();
  if (host.includes('://')) host = host.slice(host.indexOf('://') + 3);
  host = host.split('/')[0] ?? host;
  host = host.split(':')[0] ?? host;
  host = host.replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || host.length === 0) throw new Error('invalid rp_id');
  return host;
}

/** Raw Ed25519 sign over `message`. Prefer the typed helpers in `sign.ts`. */
export function ed25519Sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

/** Raw Ed25519 verify. Never throws; returns false on malformed input. */
export function ed25519Verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export { sha256 };
