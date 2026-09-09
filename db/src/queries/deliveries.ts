import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { deliveries, type Delivery, type DeliveryKind, type DeliveryStatus } from '../../schema.js';

export interface EnqueueDeliveryInput {
  id: string;
  kind: DeliveryKind;
  clientId: string;
  payload: Record<string, unknown>;
  /** When the first attempt may run; the caller usually attempts at once. */
  nextAttemptAt: Date;
}

export async function enqueueDelivery(db: Db, input: EnqueueDeliveryInput): Promise<Delivery> {
  const [row] = await db.insert(deliveries).values(input).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function getDelivery(db: Db, id: string): Promise<Delivery | null> {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  return row ?? null;
}

/** How long a claimed row is invisible to other sweepers while its attempt runs. */
export const DELIVERY_LEASE_MS = 60_000;

/**
 * Take up to `limit` pending rows that are due, pushing their `next_attempt_at` out by the lease
 * so two sweepers (two replicas, or the cron overlapping a request) never send the same one.
 * `FOR UPDATE SKIP LOCKED` makes the claim itself safe under concurrency.
 */
export async function claimDueDeliveries(db: Db, now: Date, limit = 100): Promise<Delivery[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'pending'), lte(deliveries.nextAttemptAt, now)))
      .orderBy(deliveries.nextAttemptAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(deliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + DELIVERY_LEASE_MS) })
      .where(
        inArray(
          deliveries.id,
          due.map((d) => d.id),
        ),
      )
      .returning();
  });
}

export interface DeliveryAttemptResult {
  status: DeliveryStatus;
  /** Set for `pending`: when the next attempt may run. */
  nextAttemptAt?: Date;
  lastStatus: number | null;
  lastError: string | null;
  now: Date;
}

/** Record one attempt's outcome on the row. */
export async function recordDeliveryAttempt(
  db: Db,
  id: string,
  result: DeliveryAttemptResult,
): Promise<Delivery> {
  const [row] = await db
    .update(deliveries)
    .set({
      status: result.status,
      attempts: sql`${deliveries.attempts} + 1`,
      nextAttemptAt: result.nextAttemptAt ?? result.now,
      lastStatus: result.lastStatus,
      lastError: result.lastError,
      deliveredAt: result.status === 'delivered' ? result.now : null,
    })
    .where(eq(deliveries.id, id))
    .returning();
  if (!row) throw new Error(`delivery not found: ${id}`);
  return row;
}

/** Newest first, for a site looking at what the index sent it. */
export async function listDeliveriesForSite(
  db: Db,
  clientId: string,
  limit = 50,
): Promise<Delivery[]> {
  return db
    .select()
    .from(deliveries)
    .where(eq(deliveries.clientId, clientId))
    .orderBy(sql`${deliveries.createdAt} desc`)
    .limit(limit);
}

/** Drop resolved rows older than `before` (retention). Returns how many went. */
export async function purgeDeliveries(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(deliveries)
    .where(and(sql`${deliveries.status} <> 'pending'`, lt(deliveries.createdAt, before)))
    .returning({ id: deliveries.id });
  return rows.length;
}
