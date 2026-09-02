import { HandleTakenError, recordAudit, setHandle } from '@identizen/db';
import { HandleUpdateSchema } from '@identizen/protocol';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { conflict } from '../lib/errors';
import { deviceAuth } from '../middleware/idz-signature';

export function identitiesRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /**
   * Identity registration happens inside `POST /devices` (the identity is created on first
   * sight of a master key). This endpoint registers or clears the optional human handle.
   */
  r.post('/identities', deviceAuth(), async (c) => {
    const device = c.get('device');
    const { db } = c.get('services');
    const body = HandleUpdateSchema.parse(JSON.parse(c.get('rawBody') || '{}'));
    try {
      const identity = await setHandle(db, device.idz, body.handle);
      await recordAudit(db, {
        kind: 'identity.handle_changed',
        idz: device.idz,
        deviceId: device.id,
        detail: { handle: identity.handle },
      });
      return c.json({ idz: identity.idz, handle: identity.handle });
    } catch (err) {
      if (err instanceof HandleTakenError) throw conflict('handle_taken', err.message);
      throw err;
    }
  });

  return r;
}
