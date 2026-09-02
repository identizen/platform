import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { InvalidTransitionError, NotFoundError } from '../errors';
import {
  devices,
  pairings,
  sessions,
  type Device,
  type DeviceStatus,
  type PushPlatform,
  type Session,
} from '../../schema';

export interface CreateDeviceInput {
  id: string;
  idz: string;
  devicePubkey: Uint8Array;
  bleKey?: Uint8Array | null;
  pushToken?: string | null;
  pushPlatform?: PushPlatform | null;
  attestation?: Record<string, unknown> | null;
}

export async function createDevice(db: Db, input: CreateDeviceInput): Promise<Device> {
  const [row] = await db
    .insert(devices)
    .values({
      id: input.id,
      idz: input.idz,
      devicePubkey: input.devicePubkey,
      bleKey: input.bleKey ?? null,
      pushToken: input.pushToken ?? null,
      pushPlatform: input.pushPlatform ?? null,
      attestation: input.attestation ?? null,
      lastSeenAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function getDevice(db: Db, id: string): Promise<Device | null> {
  const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return row ?? null;
}

export async function requireDevice(db: Db, id: string): Promise<Device> {
  const row = await getDevice(db, id);
  if (!row) throw new NotFoundError('device', id);
  return row;
}

export async function listDevicesForIdentity(db: Db, idz: string): Promise<Device[]> {
  return db.select().from(devices).where(eq(devices.idz, idz)).orderBy(devices.createdAt);
}

/** Active devices that advertise over BLE. Used by `/discover/ble` resolution. */
export async function listActiveBleDevices(
  db: Db,
): Promise<
  (Pick<Device, 'id' | 'idz' | 'pushToken' | 'pushPlatform'> & { bleKey: Uint8Array })[]
> {
  const rows = await db
    .select({
      id: devices.id,
      idz: devices.idz,
      bleKey: devices.bleKey,
      pushToken: devices.pushToken,
      pushPlatform: devices.pushPlatform,
    })
    .from(devices)
    .where(and(eq(devices.status, 'active'), isNotNull(devices.bleKey)));
  return rows.flatMap((r) => (r.bleKey ? [{ ...r, bleKey: r.bleKey }] : []));
}

export async function updatePushToken(
  db: Db,
  id: string,
  pushToken: string | null,
  pushPlatform: PushPlatform | null,
): Promise<Device> {
  const [row] = await db
    .update(devices)
    .set({ pushToken, pushPlatform, lastSeenAt: new Date() })
    .where(eq(devices.id, id))
    .returning();
  if (!row) throw new NotFoundError('device', id);
  return row;
}

export async function touchDevice(db: Db, id: string): Promise<void> {
  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, id));
}

const TRANSITIONS: Record<DeviceStatus, readonly DeviceStatus[]> = {
  active: ['disabled', 'revoked'],
  disabled: ['active', 'revoked'],
  revoked: [],
};

export interface DeviceStatusChange {
  device: Device;
  /** Sessions revoked as a consequence (for back-channel logout). Empty when re-enabling. */
  revokedSessions: Session[];
}

/**
 * Move a device between statuses with the allowed transitions:
 * active -> disabled | revoked, disabled -> active | revoked. `revoked` is terminal.
 * Disabling or revoking cascades: pairings are revoked and live sessions are ended.
 */
export async function setDeviceStatus(
  db: Db,
  id: string,
  to: DeviceStatus,
): Promise<DeviceStatusChange> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .for('update')
      .limit(1);
    if (!current) throw new NotFoundError('device', id);
    if (!TRANSITIONS[current.status].includes(to)) {
      throw new InvalidTransitionError('device', current.status, to);
    }
    const [device] = await tx
      .update(devices)
      .set({ status: to })
      .where(eq(devices.id, id))
      .returning();
    if (!device) throw new NotFoundError('device', id);
    let revokedSessions: Session[] = [];
    if (to !== 'active') {
      await tx
        .update(pairings)
        .set({ status: 'revoked' })
        .where(and(eq(pairings.deviceId, id), eq(pairings.status, 'active')));
      revokedSessions = await tx
        .update(sessions)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(sessions.deviceId, id),
            sql`${sessions.revokedAt} is null`,
            sql`${sessions.expiresAt} > now()`,
          ),
        )
        .returning();
    }
    return { device, revokedSessions };
  });
}

export const revokeDevice = (db: Db, id: string): Promise<DeviceStatusChange> =>
  setDeviceStatus(db, id, 'revoked');
export const disableDevice = (db: Db, id: string): Promise<DeviceStatusChange> =>
  setDeviceStatus(db, id, 'disabled');
export const enableDevice = (db: Db, id: string): Promise<DeviceStatusChange> =>
  setDeviceStatus(db, id, 'active');
