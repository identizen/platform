/**
 * The outbox: a webhook or logout token the site did not take the first time is retried by the
 * scheduled sweep with backoff, with a token minted at send time, until the site takes it,
 * refuses it, or the schedule runs out.
 */
import { env } from 'cloudflare:test';
import { decodeJwt } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDelivery, listDeliveriesForSite, requireSite } from '@identizen/db';
import { sql } from 'drizzle-orm';
import { createServices } from '../src/lib/services';
import {
  MAX_DELIVERY_ATTEMPTS,
  RETRY_SCHEDULE_MS,
  deliverWebhook,
  sendLogoutTokens,
  sweepDeliveries,
  type DeliveryContext,
} from '../src/services/deliveries';
import { runScheduledJobs } from '../src/services/scheduled';
import { dbHandle, loginAndExchange, registerPhone, registerSite, resetDb } from './helpers';

beforeEach(resetDb);

/** A site that answers the given statuses in order, recording every body it receives. */
function siteAnswering(statuses: number[]): { fetch: typeof fetch; received: string[] } {
  const received: string[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = init?.body;
    received.push(
      typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : '',
    );
    const status = statuses.shift() ?? 200;
    return new Response(status >= 500 ? 'down' : 'ok', { status });
  };
  return { fetch: fetchImpl, received };
}

/** A sweep context whose clock the test moves. */
function contextAt(seconds: number, fetchImpl: typeof fetch): DeliveryContext {
  return { env, indexUrl: env.INDEX_URL, now: () => seconds, fetchImpl };
}

describe('outbox: webhooks', () => {
  it('a webhook the site does not take is queued, retried with backoff and a fresh token, then delivered', async () => {
    const site = await registerSite({ webhook_url: 'https://app.example.com/idz/webhook' });
    const services = createServices(env);
    const down = siteAnswering([503]);
    // Seed a resolved verification the way /v1/verify would leave one.
    const h = dbHandle();
    await h.db.execute(
      sql`insert into verifications (id, client_id, sub, reason, status, resolved_at) values ('vf_1', ${site.client_id}, 'sub-1', 'Approve', 'denied', now())`,
    );
    const v = Array.from(
      await h.db.execute<{ id: string }>(sql`select * from verifications where id = 'vf_1'`),
    )[0];
    const first = await deliverWebhook(
      services,
      env,
      {
        id: 'vf_1',
        clientId: site.client_id,
        sub: 'sub-1',
        reason: 'Approve',
        status: 'denied',
        assertion: null,
        createdAt: new Date(),
        resolvedAt: new Date(),
      },
      down.fetch,
    );
    expect(first).toBe(false);
    expect(v).toBeTruthy();
    const [row] = await listDeliveriesForSite(h.db, site.client_id);
    expect(row).toMatchObject({ kind: 'webhook', status: 'pending', attempts: 1, lastStatus: 503 });
    const t0 = services.now();
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(t0 * 1000 + RETRY_SCHEDULE_MS[0]);

    // Too early: the sweep leaves it alone.
    const up = siteAnswering([200]);
    expect(await sweepDeliveries(contextAt(t0 + 5, up.fetch), h.db)).toMatchObject({ claimed: 0 });
    // Due: delivered with a token minted now, not at enqueue time.
    const later = t0 + 60;
    const report = await sweepDeliveries(contextAt(later, up.fetch), h.db);
    expect(report).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
    const done = await getDelivery(h.db, row?.id ?? '');
    expect(done).toMatchObject({ status: 'delivered', attempts: 2, lastStatus: 200 });
    const claims = decodeJwt(up.received[0] ?? '');
    expect(claims.iat).toBe(later);
    expect(claims.verification_id).toBe('vf_1');
    expect(claims.aud).toBe(site.client_id);
    await h.close();
    await services.close();
  });

  it('a refusal is final, and the schedule gives up after the last attempt with an audit event', async () => {
    const site = await registerSite({ webhook_url: 'https://app.example.com/idz/webhook' });
    const services = createServices(env);
    const h = dbHandle();
    await h.db.execute(
      sql`insert into verifications (id, client_id, sub, status, resolved_at) values ('vf_2', ${site.client_id}, 'sub-2', 'denied', now()), ('vf_3', ${site.client_id}, 'sub-3', 'denied', now())`,
    );
    const base = {
      clientId: site.client_id,
      reason: null,
      status: 'denied' as const,
      assertion: null,
      createdAt: new Date(),
      resolvedAt: new Date(),
    };
    const refusing = siteAnswering([410]);
    await deliverWebhook(services, env, { ...base, id: 'vf_2', sub: 'sub-2' }, refusing.fetch);
    const rows = await listDeliveriesForSite(h.db, site.client_id);
    expect(
      rows.find((r) => (r.payload as { verification_id: string }).verification_id === 'vf_2'),
    ).toMatchObject({ status: 'failed', attempts: 1, lastStatus: 410 });

    const always = siteAnswering(new Array(20).fill(503));
    await deliverWebhook(services, env, { ...base, id: 'vf_3', sub: 'sub-3' }, always.fetch);
    let clock = services.now();
    for (let i = 1; i < MAX_DELIVERY_ATTEMPTS; i++) {
      clock += Math.ceil((RETRY_SCHEDULE_MS[i - 1] ?? 0) / 1000) + 1;
      const r = await sweepDeliveries(contextAt(clock, always.fetch), h.db);
      expect(r.claimed, `attempt ${String(i + 1)}`).toBe(1);
    }
    const exhausted = (await listDeliveriesForSite(h.db, site.client_id)).find(
      (r) => (r.payload as { verification_id: string }).verification_id === 'vf_3',
    );
    expect(exhausted).toMatchObject({ status: 'failed', attempts: MAX_DELIVERY_ATTEMPTS });
    expect(await sweepDeliveries(contextAt(clock + 100_000, always.fetch), h.db)).toMatchObject({
      claimed: 0,
    });
    const audit = Array.from(
      await h.db.execute<{ kind: string }>(
        sql`select kind from audit_events where kind = 'delivery.failed' and client_id = ${site.client_id}`,
      ),
    );
    expect(audit).toHaveLength(2);
    await h.close();
    await services.close();
  });
});

describe('outbox: back-channel logout', () => {
  it('a logout the site missed reaches it from the sweep, and the cron entry point runs the sweep', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const services = createServices(env);
    const h = dbHandle();
    const [session] = Array.from(
      await h.db.execute<{ sid: string; idz: string; device_id: string; client_id: string }>(
        sql`select sid, idz, device_id, client_id from sessions`,
      ),
    );
    expect(session).toBeTruthy();
    const down = siteAnswering([503]);
    await sendLogoutTokens(
      services,
      env,
      [
        {
          sid: session?.sid ?? '',
          idz: session?.idz ?? '',
          deviceId: session?.device_id ?? '',
          clientId: session?.client_id ?? '',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ],
      down.fetch,
    );
    const [row] = await listDeliveriesForSite(h.db, site.client_id);
    expect(row).toMatchObject({ kind: 'logout', status: 'pending', attempts: 1 });
    // The Worker's scheduled entry point runs the same sweep against the bound database.
    await h.db.execute(sql`update deliveries set next_attempt_at = now() - interval '1 second'`);
    const up = siteAnswering([200]);
    const report = await runScheduledJobs(env, up.fetch);
    expect(report.deliveries).toMatchObject({ claimed: 1, delivered: 1 });
    const token = new URLSearchParams(up.received[0] ?? '').get('logout_token') ?? '';
    const claims = decodeJwt(token);
    expect(claims.sid).toBe(session?.sid);
    expect(claims.sub).toBe(decodeJwt(tokens.id_token).sub);
    expect(await requireSite(h.db, site.client_id)).toBeTruthy();
    await h.close();
    await services.close();
  });
});
