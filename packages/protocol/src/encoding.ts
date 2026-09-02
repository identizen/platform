/**
 * Byte/string encoding helpers. Runtime-neutral: works in browsers, Workers, Node, and Hermes.
 */

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_LOOKUP: Record<string, number> = Object.fromEntries(
  Array.from(B64URL).map((c, i) => [c, i]),
);

/** base64url without padding (RFC 4648 section 5). */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL.charAt((n >> 18) & 63);
    out += B64URL.charAt((n >> 12) & 63);
    out += B64URL.charAt((n >> 6) & 63);
    out += B64URL.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += B64URL.charAt((n >> 18) & 63);
    out += B64URL.charAt((n >> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64URL.charAt((n >> 18) & 63);
    out += B64URL.charAt((n >> 12) & 63);
    out += B64URL.charAt((n >> 6) & 63);
  }
  return out;
}

/** Decode base64url (padding optional). Throws on invalid input. */
export function fromBase64Url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) throw new Error('invalid base64url');
  if (clean.length % 4 === 1) throw new Error('invalid base64url length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let i = 0;
  for (; i + 3 < clean.length; i += 4) {
    const n =
      (lookup(clean, i) << 18) |
      (lookup(clean, i + 1) << 12) |
      (lookup(clean, i + 2) << 6) |
      lookup(clean, i + 3);
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  const rest = clean.length - i;
  if (rest === 2) {
    const n = (lookup(clean, i) << 18) | (lookup(clean, i + 1) << 12);
    out[o++] = (n >> 16) & 255;
  } else if (rest === 3) {
    const n = (lookup(clean, i) << 18) | (lookup(clean, i + 1) << 12) | (lookup(clean, i + 2) << 6);
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
  }
  return out;
}

function lookup(s: string, i: number): number {
  const v = B64URL_LOOKUP[s.charAt(i)];
  if (v === undefined) throw new Error('invalid base64url');
  return v;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(s: string): Uint8Array {
  return encoder.encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return decoder.decode(b);
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** Constant-time byte equality. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Cryptographically secure random bytes via the platform CSPRNG. */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
