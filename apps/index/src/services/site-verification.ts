/**
 * Domain ownership for sites (PROTOCOL.md §8.2, THREAT-MODEL.md "Site registration abuse").
 *
 * Anyone may register a site, but the phone shows `rp_id` to the person as the name of who is
 * asking, so a site is only usable once its registrant has proved control of that host: a DNS
 * TXT record at `_identizen.<host>` (or at a parent zone), or a file at
 * `https://<host>/.well-known/identizen-site`. Both carry the token issued at registration.
 * Verification is re-checked after thirty days; unverified registrations expire after two days.
 */
import type { Site } from '@identizen/db';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { fetchOutbound, outboundPolicy, type OutboundPolicy } from '../lib/outbound';
import type { Services } from '../lib/services';

export const VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PENDING_REGISTRATION_TTL_MS = 48 * 60 * 60 * 1000;
export const DNS_RECORD_PREFIX = 'idz-site-verification=';
export const WELL_KNOWN_PATH = '/.well-known/identizen-site';
/** DNS-over-HTTPS resolver the index asks for TXT records. */
export const DOH_URL = 'https://cloudflare-dns.com/dns-query';

export type VerificationStatus = 'verified' | 'pending' | 'stale' | 'not_required';

/** Hosts nobody can prove ownership of, used by local development. */
export function isLocalRpId(rpId: string): boolean {
  return (
    rpId === 'localhost' ||
    rpId.endsWith('.localhost') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(rpId) ||
    rpId.startsWith('[')
  );
}

/** Whether this index requires this site to prove its domain before it can be used. */
export function verificationRequired(
  env: { SITE_VERIFICATION?: string | undefined },
  site: Pick<Site, 'clientId' | 'rpId'>,
): boolean {
  if (env.SITE_VERIFICATION === 'off') return false;
  if (site.clientId.startsWith('idz_test_')) return false;
  return !isLocalRpId(site.rpId);
}

export function verificationStatus(
  env: { SITE_VERIFICATION?: string | undefined },
  site: Pick<Site, 'clientId' | 'rpId' | 'verifiedAt'>,
  now: number = Date.now(),
): VerificationStatus {
  if (!verificationRequired(env, site)) return 'not_required';
  if (!site.verifiedAt) return 'pending';
  return now - site.verifiedAt.getTime() > VERIFICATION_TTL_MS ? 'stale' : 'verified';
}

export interface VerificationInstructions {
  token: string;
  dns: { name: string; type: 'TXT'; value: string; note: string };
  http: { url: string; body: string };
}

/** What the registrant has to publish. The record may also pin this index (`index=`). */
export function verificationInstructions(
  site: Pick<Site, 'rpId' | 'verificationToken'>,
  indexUrl: string,
): VerificationInstructions | null {
  if (!site.verificationToken) return null;
  const value = `${DNS_RECORD_PREFIX}${site.verificationToken}`;
  return {
    token: site.verificationToken,
    dns: {
      name: `_identizen.${site.rpId}`,
      type: 'TXT',
      value,
      note: `The record may sit at _identizen.<a parent zone> instead, and may add " index=${indexUrl}" to pin this index.`,
    },
    http: { url: `https://${site.rpId}${WELL_KNOWN_PATH}`, body: value },
  };
}

/** The host and each parent zone down to two labels: app.login.example.com -> login.example.com -> example.com. */
export function zoneCandidates(rpId: string): string[] {
  const labels = rpId.split('.');
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join('.'));
  return out;
}

/** True when a TXT record value matches this site's token (and, if it names an index, this index). */
export function recordMatches(value: string, token: string, indexUrl: string): boolean {
  const parts = value.trim().split(/\s+/);
  if (parts[0] !== `${DNS_RECORD_PREFIX}${token}`) return false;
  const pin = parts.find((p) => p.startsWith('index='));
  return !pin || pin.slice('index='.length).replace(/\/+$/, '') === indexUrl.replace(/\/+$/, '');
}

interface DohAnswer {
  Answer?: { type: number; data: string }[];
}

function isDohAnswer(v: unknown): v is DohAnswer {
  if (typeof v !== 'object' || v === null) return false;
  const answer = (v as { Answer?: unknown }).Answer;
  return answer === undefined || Array.isArray(answer);
}

/** TXT records at `name`, unquoted and joined, or [] when there are none (or the lookup fails). */
export async function lookupTxt(
  fetchImpl: typeof fetch,
  name: string,
  timeoutMs = 5_000,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('dns deadline exceeded')), timeoutMs);
  try {
    const res = await fetchImpl(`${DOH_URL}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (!isDohAnswer(body)) return [];
    return (body.Answer ?? [])
      .filter((a) => a.type === 16)
      .map((a) => a.data.replace(/"\s*"/g, '').replace(/^"|"$/g, ''));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export interface VerificationCheck {
  ok: boolean;
  method: 'dns' | 'http' | null;
  /** Where the index looked, for the error message. */
  checked: { dns: string[]; http: string };
}

/** Look for the token in DNS (host, then parent zones) and then at the well-known URL. */
export async function checkVerification(
  site: Pick<Site, 'rpId' | 'verificationToken'>,
  indexUrl: string,
  fetchImpl: typeof fetch,
  policy: OutboundPolicy,
): Promise<VerificationCheck> {
  const checked = { dns: [] as string[], http: `https://${site.rpId}${WELL_KNOWN_PATH}` };
  if (!site.verificationToken) return { ok: false, method: null, checked };
  const token = site.verificationToken;
  for (const zone of zoneCandidates(site.rpId)) {
    const name = `_identizen.${zone}`;
    checked.dns.push(name);
    const records = await lookupTxt(fetchImpl, name);
    if (records.some((r) => recordMatches(r, token, indexUrl))) {
      return { ok: true, method: 'dns', checked };
    }
  }
  try {
    const res = await fetchOutbound(fetchImpl, checked.http, { method: 'GET' }, policy);
    if (res.ok) {
      const text = (await res.text()).slice(0, 4096);
      if (text.split(/\r?\n/).some((line) => recordMatches(line, token, indexUrl))) {
        return { ok: true, method: 'http', checked };
      }
    }
  } catch {
    /* blocked destination or network failure: counts as not found */
  }
  return { ok: false, method: null, checked };
}

/**
 * Gate for every login: the site must be verified, or exempt. A verification older than thirty
 * days is re-checked here; if the record is gone the site stops working until it is verified again.
 */
export async function ensureSiteUsable(
  services: Pick<Services, 'db' | 'indexUrl'>,
  env: Pick<Env, 'SITE_VERIFICATION' | 'OUTBOUND_ALLOW_LOCAL'>,
  site: Site,
  deps: {
    fetchImpl?: typeof fetch;
    updateVerified?: (verifiedAt: Date | null) => Promise<void>;
  } = {},
): Promise<Site> {
  const status = verificationStatus(env, site);
  if (status === 'verified' || status === 'not_required') return site;
  const unverified = new ApiError(
    403,
    'site_unverified',
    `${site.rpId} has not proved it controls that domain; publish the verification record and call POST /sites/${site.clientId}/verify`,
  );
  if (status === 'pending') throw unverified;
  // Stale: re-check now. Success extends the verification; failure revokes it.
  const check = await checkVerification(
    site,
    services.indexUrl,
    deps.fetchImpl ?? ((i, init) => fetch(i, init)),
    outboundPolicy(env),
  );
  if (deps.updateVerified) await deps.updateVerified(check.ok ? new Date() : null);
  if (!check.ok) throw unverified;
  return { ...site, verifiedAt: new Date() };
}
