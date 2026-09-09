import { ApiError } from './errors';
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

/**
 * The client address the index may believe: Cloudflare's own `CF-Connecting-IP`, or the first
 * `X-Forwarded-For` hop only when the operator declared a proxy of theirs in front
 * (`TRUST_PROXY_HEADERS=true`). Anyone can send `X-Forwarded-For`, so without that declaration
 * it is ignored rather than letting a caller pick their own rate-limit bucket (F09).
 */
export function clientIp(
  headers: { get: (name: string) => string | null },
  env: { TRUST_PROXY_HEADERS?: string | undefined },
): string | null {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  if (env.TRUST_PROXY_HEADERS !== 'true') return null;
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

/** User-Agent and client IP of the request, for pairing records. */
export function browserMeta(c: {
  req: { header: (name: string) => string | undefined; raw: Request };
  env: { TRUST_PROXY_HEADERS?: string | undefined };
}): {
  ua: string | null;
  ip: string | null;
} {
  return {
    ua: c.req.header('user-agent') ?? null,
    ip: clientIp(c.req.raw.headers, c.env),
  };
}

/** The most a signed request body may carry: an assertion or a device update, never a document. */
export const MAX_SIGNED_BODY_BYTES = 64 * 1024;

/**
 * Read a request body with a cap, before anything is buffered for signature checks: a declared
 * or actual size past the cap is refused as `413 payload_too_large` (F09).
 */
export async function readBodyCapped(
  c: {
    req: {
      raw: Request;
      header: (name: string) => string | undefined;
      /** Hono's parsed-body cache (promises at runtime): filled here so a later `c.req.json()` still works. */
      bodyCache?: { text?: Promise<string> | string };
    };
  },
  maxBytes = MAX_SIGNED_BODY_BYTES,
): Promise<string> {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > maxBytes)
    throw new ApiError(413, 'payload_too_large', 'request body is too large');
  const cached = c.req.bodyCache?.text;
  if (cached !== undefined) {
    const text = typeof cached === 'string' ? cached : await cached;
    if (text.length > maxBytes)
      throw new ApiError(413, 'payload_too_large', 'request body is too large');
    return text;
  }
  const text = await readRawCapped(c.req.raw, maxBytes);
  if (c.req.bodyCache) Object.assign(c.req.bodyCache, { text: Promise.resolve(text) });
  return text;
}

async function readRawCapped(raw: Request, maxBytes: number): Promise<string> {
  const body = raw.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('body cap reached').catch(() => undefined);
      throw new ApiError(413, 'payload_too_large', 'request body is too large');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export interface ParsedUserAgent {
  /** "Chrome", "Safari", "Firefox", "Edge", "Opera", "Samsung Internet", or null. */
  browser: string | null;
  /** Major version, e.g. "128". */
  version: string | null;
  /** "Windows", "macOS", "iOS", "iPadOS", "Android", "ChromeOS", "Linux", or null. */
  os: string | null;
  /** OS version where the UA still carries one (iOS, Android); null on frozen UAs. */
  osVersion: string | null;
}

const major = (v: string | undefined): string | null => (v ? (v.split('.')[0] ?? null) : null);

/** Best-effort parse of a browser User-Agent. Frozen UAs (Chrome, Safari on macOS) omit OS versions. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: null, version: null, os: null, osVersion: null };
  const m = (re: RegExp) => re.exec(ua)?.[1];
  let browser: string | null = null;
  let version: string | null = null;
  if (ua.includes('Edg/')) [browser, version] = ['Edge', major(m(/Edg\/([\d.]+)/))];
  else if (ua.includes('OPR/')) [browser, version] = ['Opera', major(m(/OPR\/([\d.]+)/))];
  else if (ua.includes('SamsungBrowser/'))
    [browser, version] = ['Samsung Internet', major(m(/SamsungBrowser\/([\d.]+)/))];
  else if (ua.includes('Firefox/') || ua.includes('FxiOS/'))
    [browser, version] = ['Firefox', major(m(/(?:Firefox|FxiOS)\/([\d.]+)/))];
  else if (ua.includes('CriOS/')) [browser, version] = ['Chrome', major(m(/CriOS\/([\d.]+)/))];
  else if (ua.includes('Chrome/')) [browser, version] = ['Chrome', major(m(/Chrome\/([\d.]+)/))];
  else if (ua.includes('Safari/')) [browser, version] = ['Safari', major(m(/Version\/([\d.]+)/))];

  let os: string | null = null;
  let osVersion: string | null = null;
  if (ua.includes('Windows')) os = 'Windows';
  else if (/iPhone|iPod/.test(ua))
    [os, osVersion] = ['iOS', m(/OS (\d+[_\d]*)/)?.replace(/_/g, '.') ?? null];
  else if (ua.includes('iPad'))
    [os, osVersion] = ['iPadOS', m(/OS (\d+[_\d]*)/)?.replace(/_/g, '.') ?? null];
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (ua.includes('Android')) [os, osVersion] = ['Android', m(/Android ([\d.]+)/) ?? null];
  else if (ua.includes('CrOS')) os = 'ChromeOS';
  else if (/Linux|X11/.test(ua)) os = 'Linux';
  return { browser, version, os, osVersion };
}

/** Human label from a User-Agent, e.g. "Chrome 128 on macOS" or "Safari 17 on iOS 17.5". */
export function browserLabel(ua: string | null | undefined): string {
  const p = parseUserAgent(ua);
  if (!p.browser && !p.os) return 'Browser';
  const b = p.browser ? (p.version ? `${p.browser} ${p.version}` : p.browser) : 'Browser';
  const o = p.os ? (p.osVersion ? `${p.os} ${p.osVersion}` : p.os) : 'unknown OS';
  return `${b} on ${o}`;
}
