/**
 * Egress policy for every request the index makes to a URL somebody else supplied: a device's
 * web push URL, a site's webhook, a site's back-channel logout endpoint. Without a policy the
 * index is a blind request proxy (SSRF) and a way to make approvals wait on someone else's
 * server. Destinations are checked when they are registered and again before every request;
 * every request has a deadline and does not follow redirects.
 */

export interface OutboundPolicy {
  /**
   * Allow plain http and loopback / private / link-local destinations. For local development
   * and the test suites only (`OUTBOUND_ALLOW_LOCAL=true`); a hosted or self-hosted index that
   * can reach anything internal must leave it unset.
   */
  allowLocal: boolean;
}

export function outboundPolicy(env: { OUTBOUND_ALLOW_LOCAL?: string | undefined }): OutboundPolicy {
  return { allowLocal: env.OUTBOUND_ALLOW_LOCAL === 'true' };
}

/** Per-attempt deadline for webhooks, logout tokens and web push. */
export const OUTBOUND_TIMEOUT_MS = 5_000;

const LOCAL_HOSTNAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** Loopback, private (RFC 1918), link-local, CGNAT, unspecified, and IPv6 equivalents. */
function isLocalAddress(hostname: string): boolean {
  const v4 = ipv4Parts(hostname);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const v6 = hostname.slice(1, -1).toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    if (/^fc|^fd/.test(v6)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(v6)) return true; // fe80::/10 link local
    // IPv4-mapped: URL parsing normalizes ::ffff:10.0.0.1 to ::ffff:a00:1.
    const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v6);
    if (dotted?.[1]) return isLocalAddress(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (hex?.[1] && hex[2]) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isLocalAddress(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return false;
  }
  return LOCAL_HOSTNAMES.test(hostname);
}

/**
 * The hostname as the resolver will see it: lower-case, without the trailing root dot(s) that
 * `localhost.` or `printer.local.` use to slip past a name check (F06).
 */
export function canonicalHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

/**
 * Why a URL may not be used as an outbound destination, or null when it may. Hostnames are
 * judged as written (canonicalized): the index cannot resolve DNS before connecting, so a
 * public name that resolves to a private address is a self-hoster's network policy to enforce.
 */
export function destinationProblem(url: string, policy: OutboundPolicy): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'not a valid URL';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'scheme must be https';
  if (u.username || u.password) return 'credentials in the URL are not allowed';
  const host = canonicalHostname(u.hostname);
  if (!host) return 'missing host';
  if (policy.allowLocal) return null;
  if (u.protocol !== 'https:') return 'scheme must be https';
  if (isLocalAddress(host)) return 'local, private and link-local destinations are not allowed';
  return null;
}

/** The most of a response body the index keeps; a site's answer is a status, not a document. */
export const OUTBOUND_MAX_BODY_BYTES = 64 * 1024;

/**
 * Read a response body up to `maxBytes` under `signal`: the deadline that covered the headers
 * covers the bytes too, and a body that keeps coming is cut at the cap rather than buffered.
 */
export async function readBounded(
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const abort = () => {
    reader.cancel(signal.reason).catch(() => undefined);
  };
  if (signal.aborted) {
    abort();
    throw signal.reason instanceof Error ? signal.reason : new Error('outbound aborted');
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted)
        throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
      const room = maxBytes - total;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        total += room;
        await reader.cancel('body cap reached').catch(() => undefined);
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    signal.removeEventListener('abort', abort);
  }
  // A cancelled reader reports "done": an abort is a failure, not a short body.
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export class DestinationBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`outbound request to ${url} blocked: ${reason}`);
  }
}

/**
 * `fetch` for a destination somebody else supplied: policy check, hard deadline, no redirects
 * (a 3xx is returned as-is and callers treat it as a failure). The body is read here, under the
 * same deadline and capped at `maxBodyBytes`, so what comes back is a finished response: a
 * server that answers headers and then trickles bytes cannot hold the caller past the deadline
 * or make it buffer without bound (F06).
 */
export async function fetchOutbound(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  policy: OutboundPolicy,
  timeoutMs = OUTBOUND_TIMEOUT_MS,
  maxBodyBytes = OUTBOUND_MAX_BODY_BYTES,
): Promise<Response> {
  const problem = destinationProblem(url, policy);
  if (problem) throw new DestinationBlockedError(url, problem);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('outbound deadline exceeded')),
    timeoutMs,
  );
  try {
    const res = await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal });
    const text = await readBounded(res, maxBodyBytes, controller.signal);
    const bodyless = res.status === 204 || res.status === 205 || res.status === 304;
    return new Response(bodyless ? null : text, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } finally {
    clearTimeout(timer);
  }
}
