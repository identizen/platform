import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { InvalidTransitionError, NotFoundError } from '../errors';
import { verifications, type Verification, type VerificationStatus } from '../../schema';

export interface CreateVerificationInput {
  id: string;
  clientId: string;
  sub: string;
  reason?: string | null;
}

export async function createVerification(
  db: Db,
  input: CreateVerificationInput,
): Promise<Verification> {
  const [row] = await db
    .insert(verifications)
    .values({
      id: input.id,
      clientId: input.clientId,
      sub: input.sub,
      reason: input.reason ?? null,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function getVerification(db: Db, id: string): Promise<Verification | null> {
  const [row] = await db.select().from(verifications).where(eq(verifications.id, id)).limit(1);
  return row ?? null;
}

/** Resolve a pending verification. Terminal states cannot change. */
export async function resolveVerification(
  db: Db,
  id: string,
  status: Exclude<VerificationStatus, 'pending'>,
  assertion: Record<string, unknown> | null = null,
): Promise<Verification> {
  const [row] = await db
    .update(verifications)
    .set({ status, assertion, resolvedAt: sql`now()` })
    .where(and(eq(verifications.id, id), eq(verifications.status, 'pending')))
    .returning();
  if (row) return row;
  const existing = await getVerification(db, id);
  if (!existing) throw new NotFoundError('verification', id);
  throw new InvalidTransitionError('verification', existing.status, status);
}

/** Pending verifications created before `before` (for timeout sweeps). */
export async function listPendingVerificationsBefore(
  db: Db,
  before: Date,
): Promise<Verification[]> {
  return db
    .select()
    .from(verifications)
    .where(and(eq(verifications.status, 'pending'), lt(verifications.createdAt, before)));
}
