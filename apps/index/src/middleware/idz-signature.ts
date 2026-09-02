import { getDevice, type Device } from '@identizen/db';
import { parseIdzSignature, verifyRequestSignature } from '@identizen/protocol';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app';
import { forbidden, unauthorized } from '../lib/errors';

export interface DeviceAuthVariables {
  device: Device;
  /** Raw request body, already consumed for signature verification. */
  rawBody: string;
}

export interface DeviceAuthOptions {
  /** Allow disabled/revoked devices through (e.g. so a revoked device can read its own status). */
  allowInactive?: boolean;
}

/**
 * `Idz-Signature` authentication (PROTOCOL.md section 8).
 * Verifies the device signature over method + path + body hash + timestamp, checks the
 * timestamp window, rejects replays via the per-device RequestGuard DO, and loads the device.
 */
export function deviceAuth(
  opts: DeviceAuthOptions = {},
): MiddlewareHandler<AppEnv & { Variables: DeviceAuthVariables }> {
  return async (c, next) => {
    const parsed = parseIdzSignature(c.req.header('Idz-Signature'));
    if (!parsed)
      throw unauthorized('missing_signature', 'Idz-Signature header is missing or malformed');

    const { db, now } = c.get('services');
    const device = await getDevice(db, parsed.device_id);
    if (!device) throw unauthorized('unknown_device', 'device is not registered');

    const rawBody = await c.req.text();
    const url = new URL(c.req.url);
    const result = verifyRequestSignature(
      parsed,
      {
        method: c.req.method,
        path: url.pathname + url.search,
        body: rawBody,
        timestamp: parsed.timestamp,
      },
      device.devicePubkey,
      { now: now() },
    );
    if (!result.ok)
      throw unauthorized('bad_signature', `request signature rejected: ${result.error}`);

    const guard = c.env.REQUEST_GUARD.getByName(device.id);
    const fresh = await guard.check(parsed.timestamp, parsed.sig);
    if (!fresh) throw unauthorized('replayed_request', 'this request was already seen');

    if (device.status !== 'active' && !opts.allowInactive) {
      throw forbidden('device_inactive', `device is ${device.status}`);
    }

    c.set('device', device);
    c.set('rawBody', rawBody);
    await next();
  };
}
