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
 * Why a URL may not be used as an outbound destination, or null when it may. Hostnames are
 * judged as written: the index cannot resolve DNS before connecting, so a public name that
 * resolves to a private address is a self-hoster's network policy to enforce.
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
  if (!u.hostname) return 'missing host';
  if (policy.allowLocal) return null;
  if (u.protocol !== 'https:') return 'scheme must be https';
  if (isLocalAddress(u.hostname))
    return 'local, private and link-local destinations are not allowed';
  return null;
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
 * (a 3xx is returned as-is and callers treat it as a failure).
 */
export async function fetchOutbound(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  policy: OutboundPolicy,
  timeoutMs = OUTBOUND_TIMEOUT_MS,
): Promise<Response> {
  const problem = destinationProblem(url, policy);
  if (problem) throw new DestinationBlockedError(url, problem);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('outbound deadline exceeded')),
    timeoutMs,
  );
  try {
    return await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
