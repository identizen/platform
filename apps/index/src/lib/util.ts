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

/** User-Agent and client IP of the request, for pairing records. */
export function browserMeta(c: { req: { header: (name: string) => string | undefined } }): {
  ua: string | null;
  ip: string | null;
} {
  return {
    ua: c.req.header('user-agent') ?? null,
    ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
  };
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
