import { nsName } from '../lib/names';
import {
  createDevice,
  createIdentity,
  getDevice,
  getDeviceByPubkey,
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
import { destinationProblem, outboundPolicy } from '../lib/outbound';
import { deviceAuth } from '../middleware/idz-signature';
import { fireBackchannelLogout } from '../services/sessions';
import { checkRegistrationNonce, issueRegistrationNonce } from '../services/registration-nonce';
import { ipRateLimit } from '../middleware/rate-limit';

const PushTokenSchema = z
  .object({
    push_token: z.string().max(4096).nullable(),
    push_platform: z.enum(['apns', 'fcm', 'web']).nullable(),
  })
  .strict();

const RevokeSchema = z.object({ device_id: z.string() }).strict();

/** A web push token that is a URL is a destination the index will POST to: policy-checked. */
function requirePushDestination(
  env: { OUTBOUND_ALLOW_LOCAL?: string | undefined },
  token: string | null,
): void {
  if (!token || !/^https?:\/\//.test(token)) return;
  const problem = destinationProblem(token, outboundPolicy(env));
  if (problem) throw badRequest('invalid_destination', `push_token: ${problem}`);
}

export function devicesRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** A nonce the phone binds into its identity proof (PROTOCOL.md section 8.1). */
  r.post('/devices/nonce', ipRateLimit(), async (c) => {
    const issued = await issueRegistrationNonce(c.get('services'));
    return c.json(issued, 200, { 'cache-control': 'no-store' });
  });

  /** Register an install and, on first sight, its identity (PROTOCOL.md section 8). */
  r.post('/devices', ipRateLimit(), async (c) => {
    const services = c.get('services');
    const { db, indexKey, indexUrl } = services;
    const body = DeviceRegistrationSchema.parse(await c.req.json());
    const masterPub = fromBase64Url(body.master_pubkey);
    // A nonce binds the proof to this index and this moment. The legacy unbound proof is still
    // accepted for app builds that predate nonces; either way a key the index already knows
    // cannot be enrolled again, which is what a replayed proof would try.
    if (body.nonce !== undefined) {
      const nonce = await checkRegistrationNonce(services, body.nonce);
      if (nonce === 'expired') throw badRequest('nonce_expired', 'registration nonce has expired');
      if (nonce !== 'ok')
        throw badRequest('bad_nonce', 'registration nonce is not from this index');
      const binding = { index: indexUrl, nonce: body.nonce };
      if (!verifyIdentityProof(body.device_pubkey, body.master_sig, masterPub, binding)) {
        throw badRequest(
          'bad_identity_proof',
          'master_sig does not verify over device_pubkey, index and nonce',
        );
      }
    } else if (!verifyIdentityProof(body.device_pubkey, body.master_sig, masterPub)) {
      throw badRequest('bad_identity_proof', 'master_sig does not verify over device_pubkey');
    }
    requirePushDestination(c.env, body.push_token ?? null);
    const idz = identityId(masterPub);
    const known = await getDeviceByPubkey(db, fromBase64Url(body.device_pubkey));
    if (known) {
      if (known.status !== 'active') {
        throw forbidden(
          'device_revoked',
          'this device key was revoked; enrol with a fresh device key',
        );
      }
      if (known.idz !== idz)
        throw conflict('identity_mismatch', 'this device key belongs to another identity');
      // Same install registering again (reinstall, retry): the enrolment it already has.
      const owner = await getIdentity(db, idz);
      return c.json(
        {
          device_id: known.id,
          idz,
          handle: owner?.handle ?? null,
          index: indexUrl,
          index_pubkey: toBase64Url(indexKey.publicKey),
        },
        200,
      );
    }
    let identity = await getIdentity(db, idz);
    await services.hooks.onEnroll({
      services,
      idz,
      kind: body.kind,
      identity,
      attestation: body.attestation ?? null,
    });
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
    requirePushDestination(c.env, body.push_token);
    const updated = await updatePushToken(db, device.id, body.push_token, body.push_platform);
    return c.json({ device_id: updated.id, push_platform: updated.pushPlatform });
  });

  /** Polling devices (push_token 'poll') drain queued challenge ids here. */
  r.get('/devices/:id/inbox', deviceAuth(), async (c) => {
    const device = c.get('device');
    if (device.id !== c.req.param('id'))
      throw forbidden('wrong_device', 'signature is for a different device');
    const ids = await c.get('services').stores.guard(nsName(c.env, device.id)).drain();
    return c.json({ challenge_ids: ids }, 200, { 'cache-control': 'no-store' });
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
    c.get('services').defer(fireBackchannelLogout(c.get('services'), change.revokedSessions, env));
    return c.json({
      device_id: target,
      status: change.device.status,
      sessions_revoked: change.revokedSessions.length,
    });
  });

  return r;
}
