import { and, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { auditEvents, sessions, sites, verifications } from '../../schema.js';

/** Sessions that ended (revoked or expired) before `before`; the audit trail keeps their story. */
export async function purgeSessions(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(or(lt(sessions.revokedAt, before), lt(sessions.expiresAt, before)))
    .returning({ sid: sessions.sid });
  return rows.length;
}

/** Resolved Verification API records older than `before` (the webhook told the site long ago). */
export async function purgeVerifications(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(verifications)
    .where(and(sql`${verifications.status} <> 'pending'`, lt(verifications.resolvedAt, before)))
    .returning({ id: verifications.id });
  return rows.length;
}

/** Audit events older than `before`, at most `limit` per call so one sweep stays bounded. */
export async function purgeAuditEvents(db: Db, before: Date, limit = 5000): Promise<number> {
  const rows = await db.execute<{ id: number }>(sql`
    delete from ${auditEvents}
    where ${auditEvents.id} in (
      select ${auditEvents.id} from ${auditEvents} where ${auditEvents.at} < ${before.toISOString()}::timestamptz limit ${limit}
    )
    returning ${auditEvents.id}
  `);
  return Array.from(rows).length;
}

/** Registrations that never proved their domain, older than `before` (squatters and typos). */
export async function purgeStalePendingSites(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(sites)
    .where(and(isNull(sites.verifiedAt), lt(sites.createdAt, before)))
    .returning({ clientId: sites.clientId });
  return rows.length;
}
