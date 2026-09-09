import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { NotFoundError } from '../errors.js';
import { devices, sessions, type Session } from '../../schema.js';

export interface CreateSessionInput {
  sid: string;
  idz: string;
  deviceId: string;
  clientId: string;
  expiresAt: Date;
}

export async function createSession(db: Db, input: CreateSessionInput): Promise<Session> {
  const [row] = await db.insert(sessions).values(input).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function getSession(db: Db, sid: string): Promise<Session | null> {
  const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1);
  return row ?? null;
}

export function isSessionLive(s: Session, now: Date = new Date()): boolean {
  return s.revokedAt === null && s.expiresAt.getTime() > now.getTime();
}

export async function listLiveSessionsForIdentity(db: Db, idz: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.idz, idz), isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`now()`)),
    )
    .orderBy(sessions.createdAt);
}

/** Revoke one session. Returns the row (for back-channel logout) or throws if unknown. */
export async function revokeSession(db: Db, sid: string): Promise<Session> {
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sessions.sid, sid), isNull(sessions.revokedAt)))
    .returning();
  if (row) return row;
  const existing = await getSession(db, sid);
  if (!existing) throw new NotFoundError('session', sid);
  return existing;
}

export async function revokeSessionsForIdentity(db: Db, idz: string): Promise<Session[]> {
  return db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(sessions.idz, idz), isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`now()`)),
    )
    .returning();
}

export async function revokeSessionsForDevice(db: Db, deviceId: string): Promise<Session[]> {
  return db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(sessions.deviceId, deviceId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
      ),
    )
    .returning();
}

/**
 * Create a session only while its device is active, serialized against revocation: the device
 * row is share-locked for the insert, and `setDeviceStatus` takes it for update, so a revocation
 * either runs first and this returns null, or waits and then ends the new session too (F02).
 */
export async function createSessionForActiveDevice(
  db: Db,
  input: CreateSessionInput,
): Promise<Session | null> {
  return db.transaction(async (tx) => {
    const [device] = await tx
      .select({ status: devices.status })
      .from(devices)
      .where(eq(devices.id, input.deviceId))
      .for('share')
      .limit(1);
    if (!device || device.status !== 'active') return null;
    const [row] = await tx.insert(sessions).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  });
}
