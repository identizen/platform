/**
 * What the scheduled sweep removes on its own: rows that have told their story and would only
 * grow. Ended sessions, resolved Verification API records and settled deliveries go after thirty
 * days; registrations that never proved their domain after two; audit events after
 * `AUDIT_RETENTION_DAYS` (a year by default, `0` keeps everything). Pending rows are never
 * touched, and a person's own deletion is `DELETE /me`, not this.
 */
import {
  purgeAuditEvents,
  purgeDeliveries,
  purgeSessions,
  purgeStalePendingSites,
  purgeVerifications,
  type Db,
} from '@identizen/db';
import type { Env } from '../env';
import { PENDING_REGISTRATION_TTL_MS } from './site-verification';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ended sessions, resolved verifications and settled deliveries live this long. */
export const RESOLVED_ROWS_RETENTION_DAYS = 30;
export const DEFAULT_AUDIT_RETENTION_DAYS = 365;
/** Audit rows removed per sweep at most, so a tick stays short. */
export const AUDIT_PURGE_BATCH = 5000;

export interface RetentionReport {
  sessions: number;
  verifications: number;
  deliveries: number;
  pendingSites: number;
  auditEvents: number;
}

export function auditRetentionDays(env: Pick<Env, 'AUDIT_RETENTION_DAYS'>): number {
  const raw = env.AUDIT_RETENTION_DAYS?.trim();
  if (raw === undefined || raw === '') return DEFAULT_AUDIT_RETENTION_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_AUDIT_RETENTION_DAYS;
}

export async function runRetention(
  db: Db,
  env: Pick<Env, 'AUDIT_RETENTION_DAYS'>,
  now: Date = new Date(),
): Promise<RetentionReport> {
  const resolvedBefore = new Date(now.getTime() - RESOLVED_ROWS_RETENTION_DAYS * DAY_MS);
  const days = auditRetentionDays(env);
  return {
    sessions: await purgeSessions(db, resolvedBefore),
    verifications: await purgeVerifications(db, resolvedBefore),
    deliveries: await purgeDeliveries(db, resolvedBefore),
    pendingSites: await purgeStalePendingSites(
      db,
      new Date(now.getTime() - PENDING_REGISTRATION_TTL_MS),
    ),
    auditEvents:
      days === 0
        ? 0
        : await purgeAuditEvents(db, new Date(now.getTime() - days * DAY_MS), AUDIT_PURGE_BATCH),
  };
}
