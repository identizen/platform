import {
  getPairingWithDevice,
  listActiveBleDevices,
  recordAudit,
  requireDevice,
  touchPairing,
} from '@identizen/db';
import { fromBase64Url, pairedSignatureBytes, resolveBleId } from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { ApiError, notFound, unauthorized } from '../lib/errors';
import { browserMeta } from '../lib/util';
import { pushChallenge } from '../services/challenge';
import { ipRateLimit } from '../middleware/rate-limit';

const BleSchema = z
  .object({ challenge_id: z.string().min(1), rotating_id: z.string().regex(/^[A-Za-z0-9_-]{22}$/) })
  .strict();

const PairedSchema = z
  .object({
    challenge_id: z.string().min(1),
    pairing_id: z.string().min(1),
    sig: z.string().regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export function discoverRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Resolve a rotating BLE id (current window +/- 1) and push the challenge. */
  r.post('/discover/ble', ipRateLimit(), async (c) => {
    const services = c.get('services');
    const body = BleSchema.parse(await c.req.json());
    const stub = c.env.CHALLENGE_SESSION.getByName(body.challenge_id);
    const state = await stub.getState();
    if (!state || state.status !== 'pending')
      throw notFound('unknown_challenge', 'no pending challenge');
    const candidates = await listActiveBleDevices(services.db);
    const match = resolveBleId(candidates, fromBase64Url(body.rotating_id), services.now());
    if (!match) throw notFound('no_device', 'no active device advertises this id');
    if (!(await c.env.REQUEST_GUARD.getByName(match.id).allowPush())) {
      throw new ApiError(429, 'push_rate_limited', 'too many pushes to this device');
    }
    const device = await requireDevice(services.db, match.id);
    await stub.setTargetDevice(device.id);
    await pushChallenge(services, device, body.challenge_id);
    return c.json({ status: 'pushed', challenge_id: body.challenge_id }, 202);
  });

  /** Paired browser: verify the ECDSA signature over the challenge id and push straight to the phone. */
  r.post('/discover/paired', ipRateLimit(), async (c) => {
    const services = c.get('services');
    const body = PairedSchema.parse(await c.req.json());
    const stub = c.env.CHALLENGE_SESSION.getByName(body.challenge_id);
    const state = await stub.getState();
    if (!state || state.status !== 'pending')
      throw notFound('unknown_challenge', 'no pending challenge');
    const joined = await getPairingWithDevice(services.db, body.pairing_id);
    if (!joined || joined.pairing.status !== 'active')
      throw unauthorized('pairing_inactive', 'pairing is unknown or revoked');
    if (joined.device.status !== 'active')
      throw unauthorized('device_inactive', `device is ${joined.device.status}`);
    const ok = await verifyBrowserSignature(
      joined.pairing.browserPubkey,
      body.sig,
      body.challenge_id,
    );
    if (!ok) throw unauthorized('bad_signature', 'browser signature does not verify');
    if (!(await c.env.REQUEST_GUARD.getByName(joined.device.id).allowPush())) {
      throw new ApiError(429, 'push_rate_limited', 'too many pushes to this device');
    }
    await touchPairing(services.db, joined.pairing.id, browserMeta(c).ip);
    await stub.setTargetDevice(joined.device.id);
    await recordAudit(services.db, {
      kind: 'pairing.used',
      idz: joined.device.idz,
      deviceId: joined.device.id,
      clientId: state.clientId,
      detail: { pairing_id: joined.pairing.id, challenge_id: body.challenge_id },
    });
    await pushChallenge(services, joined.device, body.challenge_id);
    return c.json({ status: 'pushed', challenge_id: body.challenge_id }, 202);
  });

  return r;
}

/** ECDSA P-256 / SHA-256 over `identizen/v1/paired\n<challenge_id>`; raw (r||s) signature. */
export async function verifyBrowserSignature(
  rawPubkey: Uint8Array,
  sigB64: string,
  challengeId: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(rawPubkey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new Uint8Array(fromBase64Url(sigB64)),
      new Uint8Array(pairedSignatureBytes(challengeId)),
    );
  } catch {
    return false;
  }
}
