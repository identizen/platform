import {
  getPairing,
  getSession,
  listDevicesForIdentity,
  listLiveSessionsForIdentity,
  listPairingsForIdentity,
  recordAudit,
  revokePairing,
  revokeSession,
  getDevice,
  getIdentity,
} from '@identizen/db';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { forbidden, notFound } from '../lib/errors';
import { deviceAuth } from '../middleware/idz-signature';
import { fireBackchannelLogout } from '../services/sessions';

/** Dashboard endpoints for the device's own identity. All signed with Idz-Signature. */
export function meRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/me', deviceAuth({ allowInactive: true }), async (c) => {
    const device = c.get('device');
    const { db } = c.get('services');
    const identity = await getIdentity(db, device.idz);
    return c.json({
      idz: device.idz,
      handle: identity?.handle ?? null,
      kind: identity?.kind ?? 'personal',
      device: { id: device.id, status: device.status },
    });
  });

  r.get('/me/devices', deviceAuth(), async (c) => {
    const device = c.get('device');
    const rows = await listDevicesForIdentity(c.get('services').db, device.idz);
    return c.json({
      devices: rows.map((d) => ({
        id: d.id,
        status: d.status,
        push_platform: d.pushPlatform,
        has_ble: d.bleKey !== null,
        last_seen_at: d.lastSeenAt,
        created_at: d.createdAt,
        current: d.id === device.id,
      })),
    });
  });

  r.get('/me/sessions', deviceAuth(), async (c) => {
    const device = c.get('device');
    const rows = await listLiveSessionsForIdentity(c.get('services').db, device.idz);
    return c.json({
      sessions: rows.map((s) => ({
        sid: s.sid,
        client_id: s.clientId,
        device_id: s.deviceId,
        created_at: s.createdAt,
        expires_at: s.expiresAt,
      })),
    });
  });

  r.get('/me/pairings', deviceAuth(), async (c) => {
    const device = c.get('device');
    const rows = await listPairingsForIdentity(c.get('services').db, device.idz);
    return c.json({
      pairings: rows.map(({ pairing, device: d }) => ({
        id: pairing.id,
        device_id: d.id,
        label: pairing.label,
        status: pairing.status,
        last_used_at: pairing.lastUsedAt,
        created_at: pairing.createdAt,
      })),
    });
  });

  r.post('/me/sessions/:sid/revoke', deviceAuth(), async (c) => {
    const device = c.get('device');
    const services = c.get('services');
    const sid = c.req.param('sid');
    const existing = await getSession(services.db, sid);
    if (!existing) throw notFound('unknown_session', 'no such session');
    if (existing.idz !== device.idz)
      throw forbidden('not_your_session', 'session belongs to another identity');
    const revoked = await revokeSession(services.db, sid);
    await recordAudit(services.db, {
      kind: 'session.revoked',
      idz: device.idz,
      deviceId: device.id,
      clientId: revoked.clientId,
      detail: { sid },
    });
    services.defer(fireBackchannelLogout(services, [revoked], c.env));
    return c.json({ sid, revoked_at: revoked.revokedAt });
  });

  r.post('/me/pairings/:id/revoke', deviceAuth(), async (c) => {
    const device = c.get('device');
    const { db } = c.get('services');
    const id = c.req.param('id');
    const pairing = await getPairing(db, id);
    if (!pairing) throw notFound('unknown_pairing', 'no such pairing');
    const owner = await getDevice(db, pairing.deviceId);
    if (!owner || owner.idz !== device.idz)
      throw forbidden('not_your_pairing', 'pairing belongs to another identity');
    const revoked = await revokePairing(db, id);
    await recordAudit(db, {
      kind: 'pairing.revoked',
      idz: device.idz,
      deviceId: device.id,
      detail: { pairing_id: id },
    });
    return c.json({ id: revoked.id, status: revoked.status });
  });

  return r;
}
