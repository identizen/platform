/**
 * ULIDs and prefixed identifiers (PROTOCOL.md section 9).
 */
import { randomBytes } from './encoding';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** 26-char Crockford base32 ULID: 48-bit ms timestamp + 80 bits of randomness. */
export function ulid(now: number = Date.now()): string {
  let t = Math.floor(now);
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((rnd[i] ?? 0) & 31);
  return time + rand;
}

export type IdPrefix = 'ch' | 'dev' | 'pr' | 'vf';

export function prefixedId(prefix: IdPrefix, now?: number): string {
  return `${prefix}_${ulid(now)}`;
}

export const challengeId = (now?: number): string => prefixedId('ch', now);
export const deviceId = (now?: number): string => prefixedId('dev', now);
export const pairingId = (now?: number): string => prefixedId('pr', now);
export const verificationId = (now?: number): string => prefixedId('vf', now);

export function isPrefixedId(value: string, prefix: IdPrefix): boolean {
  return value.startsWith(`${prefix}_`) && ULID_RE.test(value.slice(prefix.length + 1));
}

/** 2-digit match code "00".."99", uniformly distributed. */
export function matchCode(): string {
  // Rejection sampling to avoid modulo bias over 256.
  for (;;) {
    const b = randomBytes(1)[0] ?? 0;
    if (b < 200) return String(b % 100).padStart(2, '0');
  }
}
