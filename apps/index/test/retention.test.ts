/**
 * Retention (what the sweep removes on its own) and deletion (`DELETE /me`: everything about
 * an identity, at once, with logout tokens for its live sessions and a tombstone that keeps a
 * leaked seed from enrolling again).
 */
import { SELF, env } from 'cloudflare:test';
import { decodeJwt } from 'jose';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTombstone, listDeliveriesForSite } from '@identizen/db';
import { runRetention } from '../src/services/retention';
import { runScheduledJobs } from '../src/services/scheduled';
import {
  BASE,
  dbHandle,
  json,
  loginAndExchange,
  registerPhone,
  registerSite,
  registrationNonce,
  request,
  resetDb,
  signedFetch,
} from './helpers';
import { signIdentityProof, toBase64Url } from '@identizen/protocol';

beforeEach(resetDb);

describe('retention', () => {
  it('removes ended sessions, resolved verifications, settled deliveries, stale registrations and old audit', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    await loginAndExchange(site, phone);
    const h = dbHandle();
    const old = new Date(Date.now() - 40 * 24 * 3_600_000).toISOString();
    await h.db.execute(sql`update sessions set expires_at = ${old}`);
    await h.db.execute(
      sql`insert into verifications (id, client_id, sub, status, resolved_at) values ('vf_old', ${site.client_id}, 's', 'denied', ${old})`,
    );
    await h.db.execute(
      sql`insert into deliveries (id, kind, client_id, payload, status, next_attempt_at, created_at) values ('dl_old', 'webhook', ${site.client_id}, '{}', 'delivered', now(), ${old})`,
    );
    await h.db.execute(
      sql`insert into sites (client_id, rp_id, name, redirect_uris, created_at) values ('idz_live_squat', 'squat.example', 'squat', '{https://squat.example/cb}', ${old})`,
    );
    await h.db.execute(
      sql`update audit_events set at = ${new Date(Date.now() - 400 * 24 * 3_600_000).toISOString()} where kind = 'identity.created'`,
    );
    const report = await runRetention(h.db, {});
    expect(report).toMatchObject({
      sessions: 1,
      verifications: 1,
      deliveries: 1,
      pendingSites: 1,
      auditEvents: 1,
    });
    // Everything else stays: the live registration, the phone, its recent audit.
    expect(
      Array.from(await h.db.execute<{ n: number }>(sql`select count(*)::int as n from devices`))[0]
        ?.n,
    ).toBe(1);
    expect(
      Array.from(
        await h.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_events`),
      )[0]?.n,
    ).toBeGreaterThan(0);
    // The scheduled entry point runs it; AUDIT_RETENTION_DAYS=0 keeps audit forever.
    await h.db.execute(sql`update audit_events set at = ${old}`);
    const kept = await runScheduledJobs({ ...env, AUDIT_RETENTION_DAYS: '0' });
    expect(kept.retention.auditEvents).toBe(0);
    const swept = await runScheduledJobs({ ...env, AUDIT_RETENTION_DAYS: '7' });
    expect(swept.retention.auditEvents).toBeGreaterThan(0);
    await h.close();
  });
});

describe('DELETE /me', () => {
  it('removes everything about the identity, tells sites, and a compromised seed cannot enroll again', async () => {
    const site = await registerSite({
      backchannel_logout_uri: 'https://app.example.com/oidc/logout',
    });
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const sid = String(decodeJwt(tokens.id_token).sid);
    const res = await signedFetch(phone, 'DELETE', '/me', { reason: 'compromised' });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await json(res)).toMatchObject({
      deleted: true,
      reason: 'compromised',
      devices: 1,
      sessions: 1,
      bindings: 1,
    });
    const h = dbHandle();
    for (const table of ['identities', 'devices', 'sessions', 'site_bindings', 'pairings']) {
      const rows = Array.from(
        await h.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(table)}`),
      );
      expect(rows[0]?.n, table).toBe(0);
    }
    expect(await getTombstone(h.db, phone.idz)).toMatchObject({ reason: 'compromised' });
    // The live session's site gets a logout token through the outbox.
    const [delivery] = await listDeliveriesForSite(h.db, site.client_id);
    expect(delivery).toMatchObject({ kind: 'logout' });
    expect((delivery?.payload as { sid: string }).sid).toBe(sid);
    // Only an anonymized record of the deletion remains in the audit trail.
    const audit = Array.from(
      await h.db.execute<{ kind: string; idz: string | null }>(
        sql`select kind, idz from audit_events order by id desc limit 1`,
      ),
    );
    expect(audit[0]).toMatchObject({ kind: 'identity.deleted', idz: null });
    // The bearer is dead, the signature is unknown, and the master key is refused at enrollment.
    const userinfo = await request(`${BASE}/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(userinfo.status).toBe(401);
    const nonce = await registrationNonce();
    const pub = toBase64Url(phone.device.publicKey);
    const again = await SELF.fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: pub,
        master_pubkey: toBase64Url(phone.master.publicKey),
        master_sig: signIdentityProof(pub, phone.master.privateKey, { index: BASE, nonce }),
        nonce,
      }),
    });
    expect(again.status).toBe(403);
    expect(await json(again)).toMatchObject({ error: 'identity_revoked' });
    await h.close();
  });

  it('a plain deletion lets the same seed start over, and the dashboard bearer can delete too', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const { tokens } = await loginAndExchange(site, phone);
    const res = await request(`${BASE}/me`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await json(res)).toMatchObject({ deleted: true, reason: 'deleted' });
    const nonce = await registrationNonce();
    const pub = toBase64Url(phone.device.publicKey);
    const again = await SELF.fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: pub,
        master_pubkey: toBase64Url(phone.master.publicKey),
        master_sig: signIdentityProof(pub, phone.master.privateKey, { index: BASE, nonce }),
        nonce,
      }),
    });
    expect(again.status).toBe(201);
  });
});
