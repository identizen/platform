import { getDevice, getSession, isSessionLive } from '@identizen/db';
import { parseIdzSignature, verifyRequestSignature } from '@identizen/protocol';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app';
import { forbidden, unauthorized } from '../lib/errors';
import { bearer } from '../lib/util';
import { loadKeyring } from '../oidc/keys';
import { verifyAccessToken } from '../oidc/tokens';

/** Who is acting on `/me/*`: the phone itself, or the dashboard PWA holding an OIDC access token. */
export interface Principal {
  idz: string;
  /** The calling device for phone requests; null for dashboard (bearer) requests. */
  deviceId: string | null;
  via: 'device' | 'dashboard';
}

export interface PrincipalVariables {
  principal: Principal;
  rawBody: string;
}

export interface MeAuthOptions {
  /** Allow disabled/revoked devices (e.g. so a revoked phone can read its own status). */
  allowInactive?: boolean;
}

/**
 * `/me` authentication: `Idz-Signature` (device) or `Authorization: Bearer <access_token>`
 * issued to a dashboard client listed in `DASHBOARD_CLIENT_IDS` (`*` allows any client — dev only).
 */
export function meAuth(
  opts: MeAuthOptions = {},
): MiddlewareHandler<AppEnv & { Variables: PrincipalVariables }> {
  return async (c, next) => {
    const services = c.get('services');
    const rawBody = await c.req.text();
    c.set('rawBody', rawBody);

    const sigHeader = c.req.header('Idz-Signature');
    if (sigHeader) {
      const parsed = parseIdzSignature(sigHeader);
      if (!parsed) throw unauthorized('missing_signature', 'Idz-Signature header is malformed');
      const device = await getDevice(services.db, parsed.device_id);
      if (!device) throw unauthorized('unknown_device', 'device is not registered');
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
        { now: services.now() },
      );
      if (!result.ok)
        throw unauthorized('bad_signature', `request signature rejected: ${result.error}`);
      const fresh = await c.env.REQUEST_GUARD.getByName(device.id).check(
        parsed.timestamp,
        parsed.sig,
      );
      if (!fresh) throw unauthorized('replayed_request', 'this request was already seen');
      if (device.status !== 'active' && !opts.allowInactive)
        throw forbidden('device_inactive', `device is ${device.status}`);
      c.set('principal', { idz: device.idz, deviceId: device.id, via: 'device' });
      await next();
      return;
    }

    const token = bearer(c.req.header('authorization'));
    if (!token)
      throw unauthorized('missing_credentials', 'send Idz-Signature or a bearer access token');
    const ring = await loadKeyring(c.env);
    const claims = await verifyAccessToken(ring, services.indexUrl, token);
    if (!claims) throw unauthorized('invalid_token', 'access token is invalid or expired');
    const allowed = (c.env.DASHBOARD_CLIENT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes('*') && !allowed.includes(claims.client_id)) {
      throw forbidden('not_dashboard_client', 'this client may not access account management');
    }
    const session = await getSession(services.db, claims.sid);
    if (!session || !isSessionLive(session))
      throw unauthorized('invalid_token', 'session has been revoked');
    c.set('principal', { idz: session.idz, deviceId: null, via: 'dashboard' });
    await next();
  };
}
