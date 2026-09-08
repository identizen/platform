/**
 * Enrollment deep links (IdentizenEnterprise docs/api/enroll.md): the admin portal, the MDM
 * profile and the QR code all carry `identizen://enroll?index=<https issuer>&token=<token>`.
 * The universal-link form `https://<host>/enroll?...` parses too; app.json only associates
 * app.identizen.com (iOS: every path, Android: `/l/` only), so tenant hosts reach the app through
 * the custom scheme.
 */
export interface EnrollmentLink {
  /** Tenant index issuer, no trailing slash. */
  index: string;
  token: string;
}

const TOKEN_RE = /^[A-Za-z0-9._~-]{16,256}$/;

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** Query string -> map, tolerant of a missing `?` and of repeated keys (first wins). */
export function parseQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of query.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = decode(i < 0 ? pair : pair.slice(0, i));
    const v = decode(i < 0 ? '' : pair.slice(i + 1));
    if (k && v !== null && !out.has(k)) out.set(k, v);
  }
  return out;
}

/** What to tell a person whose typed index address `normalizeIndexUrl` refused. */
export const INDEX_URL_HINT =
  'Enter the index address as https://host (plain http is accepted for localhost only).';

/** An index issuer the phone will talk to: https, or plain http on a loopback host for dev. */
export function normalizeIndexUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const m = /^(https?):\/\/([^/?#\s]+)$/i.exec(trimmed);
  if (!m) return null;
  const scheme = (m[1] ?? '').toLowerCase();
  const host = (m[2] ?? '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (scheme !== 'https' && !loopback) return null;
  return `${scheme}://${host}`;
}

/**
 * Parse an enrollment link: the custom scheme, the https form on any host with an `/enroll`
 * path, or a bare `index=…&token=…` query. Null for anything else, including a non-https index.
 */
export function parseEnrollmentLink(input: string | null | undefined): EnrollmentLink | null {
  if (!input) return null;
  const s = input.trim();
  let query: string;
  const custom = /^identizen:\/\/\/?enroll\/?(\?.*)?$/i.exec(s);
  const https = /^https:\/\/[^/?#]+\/enroll\/?(\?.*)?$/i.exec(s);
  if (custom) query = custom[1] ?? '';
  else if (https) query = https[1] ?? '';
  else if (/^\??(index|token)=/.test(s)) query = s;
  else return null;
  return enrollmentLinkFromParams(parseQuery(query));
}

/** From expo-router's `useLocalSearchParams` or a parsed query. */
export function enrollmentLinkFromParams(
  params: Map<string, string> | { index?: string | undefined; token?: string | undefined },
): EnrollmentLink | null {
  const get = (k: 'index' | 'token') => (params instanceof Map ? params.get(k) : params[k]);
  const index = normalizeIndexUrl(get('index') ?? '');
  const token = (get('token') ?? '').trim();
  if (!index || !TOKEN_RE.test(token)) return null;
  return { index, token };
}
