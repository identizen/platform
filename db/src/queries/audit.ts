import { desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { auditEvents, type AuditEvent } from '../../schema.js';

/** Audit event kinds. Add here, not ad hoc, so dashboards can enumerate them. */
export const AUDIT_KINDS = [
  'device.enrolled',
  'device.disabled',
  'device.enabled',
  'device.revoked',
  'identity.created',
  'identity.handle_changed',
  'login.challenge_created',
  'login.success',
  'login.denied',
  'login.expired',
  'pairing.created',
  'pairing.used',
  'pairing.revoked',
  'session.created',
  'session.revoked',
  'verification.created',
  'verification.approved',
  'verification.denied',
  'verification.timeout',
  'site.created',
  'site.updated',
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export interface RecordAuditInput {
  kind: AuditKind;
  idz?: string | null;
  deviceId?: string | null;
  clientId?: string | null;
  orgId?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function recordAudit(db: Db, input: RecordAuditInput): Promise<AuditEvent> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      kind: input.kind,
      idz: input.idz ?? null,
      deviceId: input.deviceId ?? null,
      clientId: input.clientId ?? null,
      orgId: input.orgId ?? null,
      detail: input.detail ?? null,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function listAuditForIdentity(
  db: Db,
  idz: string,
  limit = 100,
): Promise<AuditEvent[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.idz, idz))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit);
}

export async function listAuditForSite(
  db: Db,
  clientId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.clientId, clientId))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit);
}
