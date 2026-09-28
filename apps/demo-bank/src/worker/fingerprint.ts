/**
 * Content fingerprint and verify codes for Fromenance registrations. A port of the reference
 * sample at docs.fromenance.com/getting-started/integration-guide (samples/fingerprint.ts), with
 * the same pipeline bit for bit; only the style changed to pass this repo's lint. No dependencies;
 * runs in Node 18+ and Workers.
 *
 *   1. HTML to text (scripts, styles, hidden preheaders, and images dropped; link hrefs kept)
 *   2. Unwrap gateway rewritten links (Proofpoint v2 and v3, Microsoft Defender, Google, Mimecast)
 *   3. Strip forward chrome, header blocks, "wrote:" lines, device signatures, the Fromenance
 *      footer, and cut at "--"
 *   4. Replace every URL with the registered domain of its host
 *   5. Lowercase, keep letters, digits, and @, collapse whitespace
 *   6. SimHash: 64 bit, word 3-gram shingles hashed with FNV-1a 64; SHA-256 of the same text
 */

export interface ContentFingerprint {
  /** `0x` plus 16 lowercase hex characters, ready for the API. */
  simhash: string;
  /** 64 lowercase hex characters. */
  sha256: string;
  /** Number of normalized tokens. 0 means no usable text; omit content_fingerprint then. */
  tokens: number;
  /** The normalized text, for tests only. Never send or store it. */
  normalized: string;
}

export async function fingerprintContent(input: {
  html?: string | null;
  text?: string | null;
}): Promise<ContentFingerprint> {
  const normalized = normalizeContent(input);
  const simhash = simhash64(normalized);
  return {
    simhash: `0x${simhash.toString(16).padStart(16, '0')}`,
    sha256: await sha256Hex(normalized),
    tokens: normalized.length === 0 ? 0 : normalized.split(' ').length,
    normalized,
  };
}

/** Subject fingerprint: SHA-256 of the subject with Fwd/Re prefixes removed and collapsed. */
export async function fingerprintSubject(subject: string): Promise<string> {
  let s = subject.trim();
  for (let i = 0; i < 5; i++) s = s.replace(/^\s*(fwd?|fw|re|tr|wg|aw)\s*:\s*/i, '');
  return sha256Hex(collapse(s));
}

// ---- Normalization ------------------------------------------------------------------------------

export function normalizeContent(input: { html?: string | null; text?: string | null }): string {
  const source =
    input.html && input.html.trim().length > 0 ? htmlToText(input.html) : (input.text ?? '');
  const unwrapped = source.replace(URL_RE, (m) => unwrapUrl(m));
  const stripped = stripForwardChrome(unwrapped);
  const domains = stripped.replace(URL_RE, (m) => {
    const host = hostOf(m);
    return host ? registeredDomain(host) : '';
  });
  return collapse(domains);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '',
  zwj: '',
  ndash: '-',
  mdash: '-',
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: '...',
  copy: '(c)',
  reg: '(r)',
  trade: '(tm)',
  bull: '*',
  middot: '*',
};

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : whole;
    }
    if (body.startsWith('#')) {
      const cp = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : whole;
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? whole : named;
  });
}

const BLOCK_TAGS =
  'p|div|br|tr|li|h1|h2|h3|h4|h5|h6|table|blockquote|section|article|header|footer|ul|ol|pre|hr|td|th';

export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|head|title|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Preheader and hidden blocks that clients never show.
  s = s.replace(
    /<[^>]+style=("|')[^"']*(display\s*:\s*none|max-height\s*:\s*0|font-size\s*:\s*0)[^"']*\1[^>]*>[\s\S]*?<\/(div|span|p|td)>/gi,
    ' ',
  );
  // Tracking pixels and every other image: alt text is kept when it is a word, never the source.
  s = s.replace(/<img[^>]*alt=("|')([^"']*)\1[^>]*>/gi, (_m, _q, alt: string) => ` ${alt} `);
  s = s.replace(/<img[^>]*>/gi, ' ');
  // Anchors: keep the href as text so link domains flow into the normalized body, then the text.
  s = s.replace(
    /<a[^>]*href=("|')([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, _q, href: string, inner: string) => {
      const h = href.trim();
      const isHttp = /^https?:\/\//i.test(h);
      return ` ${inner} ${isHttp ? h : ''} `;
    },
  );
  s = s.replace(new RegExp(`<\\/?(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/\r\n?/g, '\n');
  return s;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'()[\]{}]+/gi;

function decodeProofpointV2(u: string): string {
  let out = '';
  for (let i = 0; i < u.length; i++) {
    const ch = u.charAt(i);
    if (ch === '_') out += '/';
    else if (ch === '-' && /^[0-9A-Fa-f]{2}$/.test(u.slice(i + 1, i + 3))) {
      out += String.fromCharCode(Number.parseInt(u.slice(i + 1, i + 3), 16));
      i += 2;
    } else out += ch;
  }
  return out;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function queryParam(url: string, name: string): string | null {
  const q = url.indexOf('?');
  if (q < 0) return null;
  const params = url.slice(q + 1).split('&');
  for (const p of params) {
    const eq = p.indexOf('=');
    const k = eq < 0 ? p : p.slice(0, eq);
    if (k === name) return eq < 0 ? '' : p.slice(eq + 1);
  }
  return null;
}

/** Unwrap one URL that a security gateway or mail client rewrote, up to four layers deep. */
export function unwrapUrl(url: string): string {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const next = unwrapOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function unwrapOnce(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('urldefense.proofpoint.com/v2/url')) {
    const u = queryParam(url, 'u');
    if (u) return decodeProofpointV2(u);
  }
  if (lower.includes('urldefense.com/v3/__')) {
    const start = url.indexOf('__') + 2;
    const end = url.indexOf('__;', start);
    if (start > 1 && end > start) return url.slice(start, end).replace(/\*/g, '');
  }
  if (lower.includes('safelinks.protection.outlook.com')) {
    const u = queryParam(url, 'url');
    if (u) return safeDecode(u);
  }
  if (/^https?:\/\/(www\.)?google\.[a-z.]+\/url\?/i.test(url)) {
    const q = queryParam(url, 'q') ?? queryParam(url, 'url');
    if (q) return safeDecode(q);
  }
  if (lower.includes('mimecastprotect.com/s/') || lower.includes('mimecast.com/s/')) {
    const d = queryParam(url, 'domain');
    if (d) return `https://${safeDecode(d)}/`;
  }
  return url;
}

const MULTI_PART_TLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'co.jp',
  'com.br',
  'com.mx',
  'co.in',
  'com.sg',
  'co.za',
  'com.ar',
  'com.tr',
]);

/** Registered domain: last two labels, or three when the suffix is a known multi part TLD. */
export function registeredDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  const labels = h.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

function hostOf(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url);
  return m?.[1] ? m[1].toLowerCase() : null;
}

const FORWARD_MARKERS = [
  /^-{2,}\s*forwarded message\s*-{2,}$/i,
  /^begin forwarded message:?$/i,
  /^-{3,}\s*original message\s*-{3,}$/i,
  /^_{8,}$/,
  /^-{10,}$/,
  /^forwarded message:?$/i,
  /^\[(external|ext)\]\s*.*$/i,
  /^caution:?\s+this (email|message) originated from outside/i,
  /^this (email|message) (originated|was sent) from (outside|an external)/i,
];
const HEADER_LINE = /^(from|sent|to|cc|bcc|date|subject|reply-to|sent by|de|para|von|an)\s*:/i;
const WROTE_LINE = /^on\b.{6,200}\bwrote:\s*$/i;
const DEVICE_SIG = [
  /^sent from my (iphone|ipad|galaxy|android|samsung|pixel|blackberry|windows phone).*$/i,
  /^sent froms+(mail|outlook)s+fors+(windows|ios|android).*$/i,
  /^get outlook for (ios|android).*$/i,
  /^sent from yahoo mail.*$/i,
  /^sent via .*$/i,
  /^sent from my mobile.*$/i,
];
const FOOTER_SENTENCE =
  /^(not sure|unsure|wondering) (if )?this (email|message|communication) (is|was|really).*$/i;

/**
 * Lines a mail client renders above an open message and that a select all copy carries along: the sender line
 * ("JT Merlin Bank <alerts@bank.com>" or a bare address), the time line ("1:40 PM (2 minutes ago)",
 * "Sat 9/27/2026 1:40 PM", "Sep 27, 2026, 1:40 PM"), Gmail's "to me", label words such as "Inbox", and the one or
 * two letter avatar initials Outlook on the web shows. None of these is part of what the sender registered.
 */
const SENDER_LINE =
  /^(?:[^<>@]{0,80}<[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>|[^\s<>@]+@[^\s<>@]+\.[a-z]{2,})$/i;
const CLOCK = /\b\d{1,2}:\d{2}\b/;
/** Every word a client's time line can be made of. A sentence fragment that happens to wrap onto its own line ("account on September 27 at 1:40 PM.") has other words and is kept. */
const TIME_WORD =
  /^(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}|\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|am|pm|a\.m|p\.m|at|on|ago|today|yesterday|minutes?|mins?|hours?|hrs?|days?|weeks?|(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|utc|gmt(?:[+-]\d{1,2}(?::?\d{2})?)?|[ecmp][sd]t|[+-]\d{4})$/i;
const TIME_LINE_START =
  /^(?:\d|today|yesterday|(?:mon|tue|wed|thu|fri|sat|sun)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
function isTimeLine(line: string): boolean {
  // Client time lines start with a date or a clock and never end a sentence; a wrapped fragment such as
  // "on September 27 at 1:40 PM." fails one of those and is kept.
  if (line.length > 60 || !CLOCK.test(line) || !TIME_LINE_START.test(line) || /[.!?]$/.test(line))
    return false;
  return line
    .split(/\s+/)
    .map((w) => w.replace(/^[([]+|[)\],.]+$/g, ''))
    .filter((w) => w.length > 0)
    .every((w) => TIME_WORD.test(w));
}
const RELATIVE_TIME_LINE = /^\(?\d+\s+(minute|min|hour|hr|day|week)s?\s+ago\)?$/i;
/** Gmail's "to me", or "To First Last": capitalized name words only, so a wrapped "to your account" is kept. */
const TO_ME_LINE = /^[Tt]o\s+(me|[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})$/;
const LABEL_LINE =
  /^(inbox|external|important|starred|promotions|updates|social|forums|unread|reply|reply all|forward)$/i;
const AVATAR_LINE = /^[A-Z]{1,2}$/;

function isClientChrome(line: string): boolean {
  return (
    SENDER_LINE.test(line) ||
    isTimeLine(line) ||
    RELATIVE_TIME_LINE.test(line) ||
    TO_ME_LINE.test(line) ||
    LABEL_LINE.test(line) ||
    AVATAR_LINE.test(line)
  );
}

/**
 * Remove everything a forward adds: forwarded message markers, From/Sent/To/Subject header
 * blocks, "wrote:" lines, quote markers, external banners, device signatures, and the Fromenance
 * footer. Also cuts at the "--" signature line.
 *
 * A select all copy of an open message carries the client's own header rendering too: subject,
 * sender, time, "to me". Those lines are dropped wherever they appear, and a sender line within
 * the first few lines drops what sits above it (subject, label words), like text above a forward.
 */
export function stripForwardChrome(text: string): string {
  const codes = new Set(extractVerifyCodes(text));
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  let inHeaderBlock = false;
  let pendingOn: string | null = null;
  let forwardStart: number | null = null;
  for (const raw of lines) {
    let line = raw.replace(/^\s*(?:>\s?)+/, '').trim();
    if (line === '--' || line === '-- ') break;
    if (pendingOn !== null) {
      const joined = `${pendingOn} ${line}`;
      if (WROTE_LINE.test(joined)) {
        pendingOn = null;
        continue;
      }
      kept.push(pendingOn);
      pendingOn = null;
    }
    if (line.length === 0) {
      inHeaderBlock = false;
      continue;
    }
    if (FORWARD_MARKERS.some((re) => re.test(line))) {
      inHeaderBlock = true;
      if (forwardStart === null) forwardStart = kept.length;
      continue;
    }
    if (HEADER_LINE.test(line)) {
      inHeaderBlock = true;
      if (forwardStart === null) forwardStart = kept.length;
      continue;
    }
    if (inHeaderBlock && /^[A-Za-z-]{2,20}:\s/.test(line)) continue;
    inHeaderBlock = false;
    if (SENDER_LINE.test(line)) {
      if (forwardStart === null && kept.length <= 2) forwardStart = kept.length;
      continue;
    }
    if (isClientChrome(line)) continue;
    if (WROTE_LINE.test(line)) continue;
    if (/^on\b.{6,200}$/i.test(line) && !/wrote:/i.test(line)) {
      pendingOn = line;
      continue;
    }
    if (DEVICE_SIG.some((re) => re.test(line))) continue;
    if (FOOTER_SENTENCE.test(line)) continue;
    if (/^reference:\s*[0-9a-z]{4}[\s-]?[0-9a-z]{4}\s*$/i.test(line)) continue;
    if (codes.size > 0) {
      let hasCode = false;
      for (const c of extractVerifyCodes(line)) if (codes.has(c)) hasCode = true;
      if (hasCode) continue;
    }
    line = line.replace(/\[(external|ext|caution)\]\s*/gi, '');
    kept.push(line);
  }
  if (pendingOn !== null) kept.push(pendingOn);
  const body = forwardStart === null ? kept : kept.slice(forwardStart);
  return body.join('\n');
}

/** Lowercase, drop everything that is not a letter, digit, or @, collapse whitespace. */
export function collapse(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Verify codes -------------------------------------------------------------------------------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VALUE_OF = new Map<string, number>();
for (let i = 0; i < CROCKFORD.length; i++) VALUE_OF.set(CROCKFORD.charAt(i), i);
VALUE_OF.set('O', 0);
VALUE_OF.set('I', 1);
VALUE_OF.set('L', 1);

function checksumSymbol(first7: string): string {
  let sum = 0;
  for (const ch of first7) sum += VALUE_OF.get(ch.toUpperCase()) ?? 0;
  return CROCKFORD.charAt(sum % 32);
}

/** 8 Crockford symbols with a checksum last; null when the checksum does not validate. */
export function canonicalizeVerifyCode(input: string): string | null {
  const stripped = input.replace(/[\s\-–—_.]/g, '').toUpperCase();
  if (stripped.length !== 8) return null;
  let body = '';
  for (const ch of stripped) {
    const v = VALUE_OF.get(ch);
    if (v === undefined) return null;
    body += CROCKFORD.charAt(v);
  }
  if (checksumSymbol(body.slice(0, 7)) !== body.charAt(7)) return null;
  return body;
}

const CODE_RE = /(?<![0-9A-Za-z])([0-9A-Za-z]{4})[\s\-–—_.]?([0-9A-Za-z]{4})(?![0-9A-Za-z])/g;

export function extractVerifyCodes(text: string): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(CODE_RE)) {
    const candidate = canonicalizeVerifyCode(`${m[1] ?? ''}${m[2] ?? ''}`);
    if (candidate) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

/** "KX73PQ9G" as "KX73-PQ9G", the way the footer shows it. */
export function formatVerifyCode(canonical: string): string {
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}

/**
 * A code that passes the checksum but was never issued by Fromenance, for the lure. The extractor
 * picks it up like a real one and the lookup fails, which is what happens with a fabricated code.
 */
export function randomVerifyCode(random: () => number = Math.random): string {
  let body = '';
  for (let i = 0; i < 7; i++) body += CROCKFORD.charAt(Math.floor(random() * 32) % 32);
  return formatVerifyCode(body + checksumSymbol(body));
}

// ---- Hashing ------------------------------------------------------------------------------------

const U64_MASK = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/** FNV-1a 64 over the UTF-8 bytes of the input. */
export function fnv1a64(input: string): bigint {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET;
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * FNV_PRIME) & U64_MASK;
  }
  return hash;
}

/** Word 3-gram shingles. Short texts fall back to a single shingle. */
export function shingles(text: string, n = 3): string[] {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [];
  if (tokens.length < n) return [tokens.join(' ')];
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

/** 64 bit SimHash over word 3-gram shingles hashed with FNV-1a 64. Returns 0n for empty input. */
export function simhash64(normalizedText: string): bigint {
  const grams = shingles(normalizedText);
  if (grams.length === 0) return 0n;
  const counts = new Array<number>(64).fill(0);
  for (const g of grams) {
    const h = fnv1a64(g);
    for (let bit = 0; bit < 64; bit++) {
      const current = counts[bit] ?? 0;
      counts[bit] = (h >> BigInt(bit)) & 1n ? current + 1 : current - 1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) if ((counts[bit] ?? 0) > 0) out |= 1n << BigInt(bit);
  return out;
}

/** Hamming distance between two 64 bit SimHashes. Fromenance matches at 6 or less by default. */
export function hamming(a: bigint, b: bigint): number {
  let x = (a ^ b) & U64_MASK;
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let s = '';
  for (const b of new Uint8Array(digest)) s += b.toString(16).padStart(2, '0');
  return s;
}
