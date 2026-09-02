import { sha256, toBase64Url, toHex, utf8Encode, randomBytes } from '@identizen/protocol';

/** SHA-256 hex of a secret, for at-rest comparison (client secrets, webhook secrets). */
export function hashSecret(secret: string): string {
  return toHex(sha256(utf8Encode(secret)));
}

/** Constant-time string equality. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomToken(bytes = 32): string {
  return toBase64Url(randomBytes(bytes));
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

/** Best-effort browser label from a User-Agent, e.g. "Safari on macOS". */
export function browserLabel(ua: string | undefined): string {
  if (!ua) return 'Browser';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('OPR/')
      ? 'Opera'
      : ua.includes('Firefox/')
        ? 'Firefox'
        : ua.includes('Chrome/')
          ? 'Chrome'
          : ua.includes('Safari/')
            ? 'Safari'
            : 'Browser';
  const os = ua.includes('Windows')
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : ua.includes('Android')
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : ua.includes('Linux')
            ? 'Linux'
            : 'unknown OS';
  return `${browser} on ${os}`;
}
