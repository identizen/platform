import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  HandleTakenError,
  IdentityExistsError,
  NotFoundError,
  isUniqueViolation,
  pgErrorField,
} from '../errors.js';
import {
  auditEvents,
  devices,
  identities,
  identityTombstones,
  pairings,
  sessions,
  siteBindings,
  type Identity,
  type IdentityKind,
  type IdentityTombstone,
  type Session,
  type TombstoneReason,
} from '../../schema.js';

export interface CreateIdentityInput {
  idz: string;
  masterPubkey: Uint8Array;
  handle?: string | null;
  kind?: IdentityKind;
  orgId?: string | null;
}

export async function createIdentity(db: Db, input: CreateIdentityInput): Promise<Identity> {
  try {
    const [row] = await db
      .insert(identities)
      .values({
        idz: input.idz,
        masterPubkey: input.masterPubkey,
        handle: input.handle ?? null,
        kind: input.kind ?? 'personal',
        orgId: input.orgId ?? null,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const detail = pgErrorField(err, 'constraint_name') ?? '';
      if (detail.includes('handle') && input.handle) throw new HandleTakenError(input.handle);
      throw new IdentityExistsError(input.idz);
    }
    throw err;
  }
}

export async function getIdentity(db: Db, idz: string): Promise<Identity | null> {
  const [row] = await db.select().from(identities).where(eq(identities.idz, idz)).limit(1);
  return row ?? null;
}

export async function requireIdentity(db: Db, idz: string): Promise<Identity> {
  const row = await getIdentity(db, idz);
  if (!row) throw new NotFoundError('identity', idz);
  return row;
}

export async function getIdentityByHandle(db: Db, handle: string): Promise<Identity | null> {
  const [row] = await db
    .select()
    .from(identities)
    .where(eq(identities.handle, handle.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function setHandle(db: Db, idz: string, handle: string | null): Promise<Identity> {
  try {
    const [row] = await db
      .update(identities)
      .set({ handle: handle ? handle.toLowerCase() : null })
      .where(eq(identities.idz, idz))
      .returning();
    if (!row) throw new NotFoundError('identity', idz);
    return row;
  } catch (err) {
    if (isUniqueViolation(err) && handle) throw new HandleTakenError(handle);
    throw err;
  }
}

export interface DeletedIdentity {
  /** Live sessions at the time, for back-channel logout before the rows went. */
  sessions: Session[];
  devices: number;
  pairings: number;
  bindings: number;
  auditEvents: number;
}

/**
 * Remove everything the index holds about an identity, in one transaction, and leave a
 * tombstone saying why. Live sessions are returned so the caller can queue their logout tokens
 * first (the outbox stores `sid` and `sub`, not the rows). Host tables that reference the
 * identity are the host's to clear (`onDeleteIdentity`), before this runs.
 */
export async function deleteIdentityData(
  db: Db,
  idz: string,
  reason: TombstoneReason,
): Promise<DeletedIdentity> {
  return db.transaction(async (tx) => {
    const live = await tx
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.idz, idz), isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`now()`)),
      );
    const deviceIds = (
      await tx.select({ id: devices.id }).from(devices).where(eq(devices.idz, idz))
    ).map((d) => d.id);
    const pairingsGone =
      deviceIds.length === 0
        ? []
        : await tx
            .delete(pairings)
            .where(inArray(pairings.deviceId, deviceIds))
            .returning({ id: pairings.id });
    await tx.delete(sessions).where(eq(sessions.idz, idz));
    const bindingsGone = await tx
      .delete(siteBindings)
      .where(eq(siteBindings.idz, idz))
      .returning({ sub: siteBindings.sub });
    const devicesGone = await tx
      .delete(devices)
      .where(eq(devices.idz, idz))
      .returning({ id: devices.id });
    const auditGone = await tx
      .delete(auditEvents)
      .where(eq(auditEvents.idz, idz))
      .returning({ id: auditEvents.id });
    await tx.delete(identities).where(eq(identities.idz, idz));
    await tx
      .insert(identityTombstones)
      .values({ idz, reason })
      .onConflictDoUpdate({ target: identityTombstones.idz, set: { reason, at: sql`now()` } });
    return {
      sessions: live,
      devices: devicesGone.length,
      pairings: pairingsGone.length,
      bindings: bindingsGone.length,
      auditEvents: auditGone.length,
    };
  });
}

export async function getTombstone(db: Db, idz: string): Promise<IdentityTombstone | null> {
  const [row] = await db
    .select()
    .from(identityTombstones)
    .where(eq(identityTombstones.idz, idz))
    .limit(1);
  return row ?? null;
}
