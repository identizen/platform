import {
  getDevice,
  getIdentity,
  getPairing,
  getSession,
  HandleTakenError,
  listAuditForIdentity,
  listDevicesForIdentity,
  listLiveSessionsForIdentity,
  listPairingsForIdentity,
  recordAudit,
  revokeDevice,
  revokePairing,
  revokeSession,
  setHandle,
} from '@identizen/db';
import { HandleUpdateSchema } from '@identizen/protocol';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { conflict, forbidden, notFound } from '../lib/errors';
import { meAuth } from '../middleware/principal';
import { fireBackchannelLogout } from '../services/sessions';

/**
 * Account management for the principal's identity. Authenticated with `Idz-Signature`
 * (the phone) or a dashboard bearer token (the PWA). See `middleware/principal.ts`.
 */
export function meRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/me', meAuth({ allowInactive: true }), async (c) => {
    const p = c.get('principal');
    const { db } = c.get('services');
    const identity = await getIdentity(db, p.idz);
    const device = p.deviceId ? await getDevice(db, p.deviceId) : null;
    return c.json({
      idz: p.idz,
      handle: identity?.handle ?? null,
      kind: identity?.kind ?? 'personal',
      via: p.via,
      device: device ? { id: device.id, status: device.status } : null,
    });
  });

  r.get('/me/devices', meAuth(), async (c) => {
    const p = c.get('principal');
    const rows = await listDevicesForIdentity(c.get('services').db, p.idz);
    return c.json({
      devices: rows.map((d) => ({
        id: d.id,
        status: d.status,
        push_platform: d.pushPlatform,
        has_ble: d.bleKey !== null,
        last_seen_at: d.lastSeenAt,
        created_at: d.createdAt,
        current: d.id === p.deviceId,
      })),
    });
  });

  r.get('/me/sessions', meAuth(), async (c) => {
    const p = c.get('principal');
    const rows = await listLiveSessionsForIdentity(c.get('services').db, p.idz);
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

  r.get('/me/pairings', meAuth(), async (c) => {
    const p = c.get('principal');
    const rows = await listPairingsForIdentity(c.get('services').db, p.idz);
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

  r.get('/me/audit', meAuth(), async (c) => {
    const p = c.get('principal');
    const rows = await listAuditForIdentity(c.get('services').db, p.idz, 100);
    return c.json({
      events: rows.map((e) => ({
        id: e.id,
        at: e.at,
        kind: e.kind,
        device_id: e.deviceId,
        client_id: e.clientId,
        detail: e.detail,
      })),
    });
  });

  r.post('/me/handle', meAuth(), async (c) => {
    const p = c.get('principal');
    const { db } = c.get('services');
    const body = HandleUpdateSchema.parse(JSON.parse(c.get('rawBody') || '{}'));
    try {
      const identity = await setHandle(db, p.idz, body.handle);
      await recordAudit(db, {
        kind: 'identity.handle_changed',
        idz: p.idz,
        deviceId: p.deviceId,
        detail: { handle: identity.handle, via: p.via },
      });
      return c.json({ idz: identity.idz, handle: identity.handle });
    } catch (err) {
      if (err instanceof HandleTakenError) throw conflict('handle_taken', err.message);
      throw err;
    }
  });

  r.post('/me/sessions/:sid/revoke', meAuth(), async (c) => {
    const p = c.get('principal');
    const services = c.get('services');
    const sid = c.req.param('sid');
    const existing = await getSession(services.db, sid);
    if (!existing) throw notFound('unknown_session', 'no such session');
    if (existing.idz !== p.idz)
      throw forbidden('not_your_session', 'session belongs to another identity');
    const revoked = await revokeSession(services.db, sid);
    await recordAudit(services.db, {
      kind: 'session.revoked',
      idz: p.idz,
      deviceId: p.deviceId,
      clientId: revoked.clientId,
      detail: { sid, via: p.via },
    });
    services.defer(fireBackchannelLogout(services, [revoked], c.env));
    return c.json({ sid, revoked_at: revoked.revokedAt });
  });

  r.post('/me/pairings/:id/revoke', meAuth(), async (c) => {
    const p = c.get('principal');
    const { db } = c.get('services');
    const id = c.req.param('id');
    const pairing = await getPairing(db, id);
    if (!pairing) throw notFound('unknown_pairing', 'no such pairing');
    const owner = await getDevice(db, pairing.deviceId);
    if (!owner || owner.idz !== p.idz)
      throw forbidden('not_your_pairing', 'pairing belongs to another identity');
    const revoked = await revokePairing(db, id);
    await recordAudit(db, {
      kind: 'pairing.revoked',
      idz: p.idz,
      deviceId: p.deviceId,
      detail: { pairing_id: id, via: p.via },
    });
    return c.json({ id: revoked.id, status: revoked.status });
  });

  /** Revoke one of the identity's devices (from another device, or from the dashboard). */
  r.post('/me/devices/:id/revoke', meAuth(), async (c) => {
    const p = c.get('principal');
    const services = c.get('services');
    const target = c.req.param('id');
    const victim = await getDevice(services.db, target);
    if (!victim || victim.idz !== p.idz)
      throw forbidden('not_your_device', 'device belongs to another identity');
    if (p.via === 'device' && p.deviceId === target) {
      throw forbidden(
        'self_revoke',
        'revoke this device from another device or from the dashboard',
      );
    }
    const change = await revokeDevice(services.db, target);
    await recordAudit(services.db, {
      kind: 'device.revoked',
      idz: p.idz,
      deviceId: target,
      detail: { by: p.deviceId ?? 'dashboard', via: p.via },
    });
    services.defer(fireBackchannelLogout(services, change.revokedSessions, c.env));
    return c.json({
      device_id: target,
      status: change.device.status,
      sessions_revoked: change.revokedSessions.length,
    });
  });

  return r;
}
