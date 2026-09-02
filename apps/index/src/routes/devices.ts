import {
  createDevice,
  createIdentity,
  getDevice,
  getIdentity,
  HandleTakenError,
  recordAudit,
  revokeDevice,
  updatePushToken,
} from '@identizen/db';
import {
  DeviceRegistrationSchema,
  deviceId as newDeviceId,
  fromBase64Url,
  identityId,
  toBase64Url,
  verifyIdentityProof,
} from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { badRequest, conflict, forbidden } from '../lib/errors';
import { deviceAuth } from '../middleware/idz-signature';
import { fireBackchannelLogout } from '../services/sessions';

const PushTokenSchema = z
  .object({
    push_token: z.string().max(4096).nullable(),
    push_platform: z.enum(['apns', 'fcm', 'web']).nullable(),
  })
  .strict();

const RevokeSchema = z.object({ device_id: z.string() }).strict();

export function devicesRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Register an install and, on first sight, its identity (PROTOCOL.md section 8). */
  r.post('/devices', async (c) => {
    const { db, indexKey, indexUrl } = c.get('services');
    const body = DeviceRegistrationSchema.parse(await c.req.json());
    const masterPub = fromBase64Url(body.master_pubkey);
    if (!verifyIdentityProof(body.device_pubkey, body.master_sig, masterPub)) {
      throw badRequest('bad_identity_proof', 'master_sig does not verify over device_pubkey');
    }
    const idz = identityId(masterPub);
    let identity = await getIdentity(db, idz);
    let createdIdentity = false;
    if (!identity) {
      try {
        identity = await createIdentity(db, {
          idz,
          masterPubkey: masterPub,
          handle: body.handle ?? null,
          kind: body.kind,
        });
        createdIdentity = true;
      } catch (err) {
        if (err instanceof HandleTakenError) throw conflict('handle_taken', err.message);
        throw err;
      }
    }
    const device = await createDevice(db, {
      id: newDeviceId(),
      idz,
      devicePubkey: fromBase64Url(body.device_pubkey),
      bleKey: body.ble_key ? fromBase64Url(body.ble_key) : null,
      pushToken: body.push_token ?? null,
      pushPlatform: body.push_platform ?? null,
      attestation: body.attestation ?? null,
    });
    if (createdIdentity)
      await recordAudit(db, { kind: 'identity.created', idz, deviceId: device.id });
    await recordAudit(db, {
      kind: 'device.enrolled',
      idz,
      deviceId: device.id,
      detail: { label: body.label ?? null },
    });
    return c.json(
      {
        device_id: device.id,
        idz,
        handle: identity.handle,
        index: indexUrl,
        index_pubkey: toBase64Url(indexKey.publicKey),
      },
      201,
    );
  });

  r.post('/devices/:id/push-token', deviceAuth(), async (c) => {
    const device = c.get('device');
    if (device.id !== c.req.param('id'))
      throw forbidden('wrong_device', 'signature is for a different device');
    const { db } = c.get('services');
    const body = PushTokenSchema.parse(JSON.parse(c.get('rawBody') || '{}'));
    const updated = await updatePushToken(db, device.id, body.push_token, body.push_platform);
    return c.json({ device_id: updated.id, push_platform: updated.pushPlatform });
  });

  /**
   * Revoke a device of the same identity from another enrolled device.
   * Passphrase-proof revocation (no enrolled device left) is `POST /identities/revoke-device` (M7).
   */
  r.post('/devices/:id/revoke', deviceAuth(), async (c) => {
    const caller = c.get('device');
    const { db, env } = c.get('services');
    const target = c.req.param('id');
    RevokeSchema.parse({ device_id: target });
    const victim = await getDevice(db, target);
    if (!victim || victim.idz !== caller.idz)
      throw forbidden('not_your_device', 'device belongs to another identity');
    const change = await revokeDevice(db, target);
    await recordAudit(db, {
      kind: 'device.revoked',
      idz: caller.idz,
      deviceId: target,
      detail: { by: caller.id },
    });
    c.executionCtx.waitUntil(fireBackchannelLogout(c.get('services'), change.revokedSessions, env));
    return c.json({
      device_id: target,
      status: change.device.status,
      sessions_revoked: change.revokedSessions.length,
    });
  });

  return r;
}
