import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { InvalidTransitionError, NotFoundError } from '../errors.js';
import { devices, pairings, type Device, type PairingRow } from '../../schema.js';

export interface CreatePairingInput {
  id: string;
  deviceId: string;
  browserPubkey: Uint8Array;
  label?: string | null;
  userAgent?: string | null;
  lastIp?: string | null;
}

export async function createPairing(db: Db, input: CreatePairingInput): Promise<PairingRow> {
  const [row] = await db
    .insert(pairings)
    .values({
      id: input.id,
      deviceId: input.deviceId,
      browserPubkey: input.browserPubkey,
      label: input.label ?? null,
      userAgent: input.userAgent ?? null,
      lastIp: input.lastIp ?? null,
      lastUsedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function getPairing(db: Db, id: string): Promise<PairingRow | null> {
  const [row] = await db.select().from(pairings).where(eq(pairings.id, id)).limit(1);
  return row ?? null;
}

export interface PairingWithDevice {
  pairing: PairingRow;
  device: Device;
}

/** Pairing joined with its device, for `/discover/paired` (both must be active). */
export async function getPairingWithDevice(db: Db, id: string): Promise<PairingWithDevice | null> {
  const [row] = await db
    .select({ pairing: pairings, device: devices })
    .from(pairings)
    .innerJoin(devices, eq(devices.id, pairings.deviceId))
    .where(eq(pairings.id, id))
    .limit(1);
  return row ?? null;
}

export async function listPairingsForDevice(db: Db, deviceId: string): Promise<PairingRow[]> {
  return db
    .select()
    .from(pairings)
    .where(eq(pairings.deviceId, deviceId))
    .orderBy(pairings.createdAt);
}

export async function listPairingsForIdentity(db: Db, idz: string): Promise<PairingWithDevice[]> {
  return db
    .select({ pairing: pairings, device: devices })
    .from(pairings)
    .innerJoin(devices, eq(devices.id, pairings.deviceId))
    .where(eq(devices.idz, idz))
    .orderBy(pairings.createdAt);
}

/** Mark a pairing used; records the client IP of this use when known. */
export async function touchPairing(db: Db, id: string, ip?: string | null): Promise<void> {
  await db
    .update(pairings)
    .set({ lastUsedAt: sql`now()`, ...(ip ? { lastIp: ip } : {}) })
    .where(eq(pairings.id, id));
}

export async function revokePairing(db: Db, id: string): Promise<PairingRow> {
  const current = await getPairing(db, id);
  if (!current) throw new NotFoundError('pairing', id);
  if (current.status === 'revoked')
    throw new InvalidTransitionError('pairing', 'revoked', 'revoked');
  const [row] = await db
    .update(pairings)
    .set({ status: 'revoked' })
    .where(and(eq(pairings.id, id), eq(pairings.status, 'active')))
    .returning();
  if (!row) throw new NotFoundError('pairing', id);
  return row;
}

export async function revokePairingsForDevice(db: Db, deviceId: string): Promise<number> {
  const rows = await db
    .update(pairings)
    .set({ status: 'revoked' })
    .where(and(eq(pairings.deviceId, deviceId), eq(pairings.status, 'active')))
    .returning({ id: pairings.id });
  return rows.length;
}
