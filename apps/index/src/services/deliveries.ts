/**
 * The outbox: everything the index owes a site is a `deliveries` row before it is a request.
 * A Verification API result (`webhook`) or a back-channel logout (`logout`) is enqueued, tried
 * once right away, and then retried by the scheduled sweep with backoff until the site answers
 * 2xx, refuses it with another 4xx, or the schedule runs out. The token is minted at send time,
 * so a retry never carries an expired one, and a site that is down for an hour still gets its
 * logout. Every sweeper claims rows under a lease, so replicas never send the same row twice.
 */
import {
  claimDueDeliveries,
  enqueueDelivery,
  getSite,
  getVerification,
  listBindingsForIdentity,
  recordAudit,
  recordDeliveryAttempt,
  type Db,
  type Delivery,
  type Session,
  type Verification,
} from '@identizen/db';
import { sha256, toHex, utf8Encode } from '@identizen/protocol';
import type { Env } from '../env';
import { fetchOutbound, outboundPolicy } from '../lib/outbound';
import type { Services } from '../lib/services';
import { randomToken } from '../lib/util';
import { loadKeyring } from '../oidc/keys';
import { mintLogoutToken, mintWebhookToken } from '../oidc/tokens';

/**
 * Backoff after each failed attempt. The first attempt runs in the request; the rest come from
 * the scheduled sweep (every five minutes on Cloudflare and in the container), so the early
 * delays are lower bounds. Nine attempts span about two days.
 */
export const RETRY_SCHEDULE_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
  24 * 3_600_000,
] as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;

/** What a sweep needs; a request builds it from its `Services`, a cron from the env. */
export interface DeliveryContext {
  env: Env;
  indexUrl: string;
  now: () => number;
  fetchImpl: typeof fetch;
}

export function deliveryContext(env: Env, fetchImpl: typeof fetch = fetch): DeliveryContext {
  return {
    env,
    indexUrl: env.INDEX_URL ?? '',
    now: () => Math.floor(Date.now() / 1000),
    fetchImpl,
  };
}

function contextFor(services: Services, env: Env, fetchImpl?: typeof fetch): DeliveryContext {
  return {
    env,
    indexUrl: services.indexUrl,
    now: services.now,
    fetchImpl: fetchImpl ?? ((i, init) => fetch(i, init)),
  };
}

export interface DeliveryOutcome {
  delivered: boolean;
  /** Final for this row: delivered, refused by the site, or out of attempts. */
  settled: boolean;
  status: number | null;
}

/**
 * Queue the Verification API result for the site's webhook and try once now. False when the
 * site has no webhook or the first attempt did not succeed (the sweep carries on).
 */
export async function deliverWebhook(
  services: Services,
  env: Env,
  v: Verification,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const site = await getSite(services.db, v.clientId);
  if (!site?.webhookUrl) return false;
  const row = await enqueueDelivery(services.db, {
    id: `dl_${randomToken(16)}`,
    kind: 'webhook',
    clientId: site.clientId,
    payload: { verification_id: v.id },
    nextAttemptAt: new Date(services.now() * 1000),
  });
  const outcome = await attemptDelivery(contextFor(services, env, fetchImpl), services.db, row);
  return outcome.delivered;
}

/** Queue a logout token for each revoked session's site and try each once now. */
export async function sendLogoutTokens(
  services: Services,
  env: Env,
  sessions: Session[],
  fetchImpl?: typeof fetch,
): Promise<void> {
  if (sessions.length === 0) return;
  const ctx = contextFor(services, env, fetchImpl);
  await Promise.all(
    sessions.map(async (session) => {
      const site = await getSite(services.db, session.clientId);
      if (!site?.backchannelLogoutUri) return;
      const row = await enqueueDelivery(services.db, {
        id: `dl_${randomToken(16)}`,
        kind: 'logout',
        clientId: site.clientId,
        payload: { sid: session.sid, sub: await subForSession(services.db, session) },
        nextAttemptAt: new Date(services.now() * 1000),
      });
      await attemptDelivery(ctx, services.db, row);
    }),
  );
}

/** Sessions store idz, not the per-site sub; recover it from the binding for the site. */
async function subForSession(db: Db, session: Session): Promise<string> {
  const site = await getSite(db, session.clientId);
  const bindings = await listBindingsForIdentity(db, session.idz);
  return bindings.find((b) => b.rpId === site?.rpId)?.sub ?? session.idz;
}

/** One attempt at one row: mint the token now, send it, record the outcome and the next step. */
export async function attemptDelivery(
  ctx: DeliveryContext,
  db: Db,
  row: Delivery,
): Promise<DeliveryOutcome> {
  const nowMs = ctx.now() * 1000;
  const settle = async (
    status: 'delivered' | 'failed' | 'pending',
    lastStatus: number | null,
    lastError: string | null,
  ): Promise<DeliveryOutcome> => {
    const attempts = row.attempts + 1;
    const delay = RETRY_SCHEDULE_MS[attempts - 1];
    const final = status !== 'pending' || delay === undefined;
    const updated = await recordDeliveryAttempt(db, row.id, {
      status: final ? (status === 'delivered' ? 'delivered' : 'failed') : 'pending',
      ...(final ? {} : { nextAttemptAt: new Date(nowMs + delay) }),
      lastStatus,
      lastError,
      now: new Date(nowMs),
    });
    if (updated.status === 'failed') {
      await recordAudit(db, {
        kind: 'delivery.failed',
        clientId: row.clientId,
        detail: {
          delivery_id: row.id,
          kind: row.kind,
          attempts: updated.attempts,
          last_status: lastStatus,
          last_error: lastError,
        },
      });
    }
    return {
      delivered: updated.status === 'delivered',
      settled: updated.status !== 'pending',
      status: lastStatus,
    };
  };

  const site = await getSite(db, row.clientId);
  const url = row.kind === 'webhook' ? site?.webhookUrl : site?.backchannelLogoutUri;
  if (!site || !url) return settle('failed', null, 'site no longer has a destination');

  let request: { headers: Record<string, string>; body: string | URLSearchParams };
  try {
    request = await buildRequest(ctx, db, row, site.clientId, site.webhookSecretHash);
  } catch (err) {
    return settle('failed', null, err instanceof Error ? err.message : String(err));
  }
  if (!request) return settle('failed', null, 'nothing to deliver');

  try {
    const res = await fetchOutbound(
      ctx.fetchImpl,
      url,
      { method: 'POST', headers: request.headers, body: request.body },
      outboundPolicy(ctx.env),
    );
    if (res.ok) return await settle('delivered', res.status, null);
    // A refusal is final; a 429 or a server error gets the next attempt.
    if (res.status >= 400 && res.status < 500 && res.status !== 429)
      return await settle('failed', res.status, `site answered ${res.status}`);
    return await settle('pending', res.status, `site answered ${res.status}`);
  } catch (err) {
    return settle(
      'pending',
      null,
      (err instanceof Error ? err.message : String(err)).slice(0, 200),
    );
  }
}

async function buildRequest(
  ctx: DeliveryContext,
  db: Db,
  row: Delivery,
  clientId: string,
  webhookSecretHash: string | null,
): Promise<{ headers: Record<string, string>; body: string | URLSearchParams }> {
  const ring = await loadKeyring(ctx.env);
  if (row.kind === 'logout') {
    const { sid, sub } = row.payload as { sid: string; sub: string };
    const token = await mintLogoutToken(ring, {
      issuer: ctx.indexUrl,
      clientId,
      sub,
      sid,
      now: ctx.now(),
    });
    return {
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-store' },
      body: new URLSearchParams({ logout_token: token }),
    };
  }
  const { verification_id: id } = row.payload as { verification_id: string };
  const v = await getVerification(db, id);
  if (!v) throw new Error(`verification ${id} no longer exists`);
  const body = await mintWebhookToken(ring, {
    issuer: ctx.indexUrl,
    clientId,
    now: ctx.now(),
    claims: {
      event: 'verification.resolved',
      verification_id: v.id,
      status: v.status,
      sub: v.sub,
      reason: v.reason,
      assertion: v.status === 'approved' ? v.assertion : null,
      resolved_at: v.resolvedAt ? Math.floor(v.resolvedAt.getTime() / 1000) : null,
    },
  });
  const sigHeader = webhookSecretHash
    ? `sha256=${toHex(sha256(utf8Encode(webhookSecretHash + '.' + body)))}`
    : '';
  return {
    headers: {
      'content-type': 'application/jwt',
      'idz-event': 'verification.resolved',
      ...(sigHeader && { 'idz-webhook-signature': sigHeader }),
    },
    body,
  };
}

export interface SweepReport {
  claimed: number;
  delivered: number;
  failed: number;
}

/** Deliver what is due, at most `limit` rows. What a cron tick (or a host's scheduler) runs. */
export async function sweepDeliveries(
  ctx: DeliveryContext,
  db: Db,
  limit = 100,
): Promise<SweepReport> {
  const due = await claimDueDeliveries(db, new Date(ctx.now() * 1000), limit);
  const report: SweepReport = { claimed: due.length, delivered: 0, failed: 0 };
  for (const row of due) {
    const outcome = await attemptDelivery(ctx, db, row);
    if (outcome.delivered) report.delivered += 1;
    else if (outcome.settled) report.failed += 1;
  }
  return report;
}
