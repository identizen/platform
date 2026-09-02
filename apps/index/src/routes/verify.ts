import { getVerification } from '@identizen/db';
import { KeyIdSchema, REASON_MAX_LENGTH } from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { ApiError, notFound } from '../lib/errors';
import { requireSiteSecret } from './sites';
import { publicVerification, startVerification } from '../services/verification';

const VerifySchema = z
  .object({
    sub: KeyIdSchema,
    reason: z.string().min(1).max(REASON_MAX_LENGTH).nullable().optional(),
    /** Accepted for forward compatibility; challenges always live 60 s in v1. */
    ttl: z.number().int().min(10).max(600).optional(),
  })
  .strict();

/** Verification API (Path B, server-to-server). Bearer = site client secret. */
export function verifyRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/v1/verify', async (c) => {
    const services = c.get('services');
    const auth = c.req.header('authorization');
    const clientId = clientIdFromBearerHint(c.req.header('idz-client-id'), auth);
    if (!clientId)
      throw new ApiError(401, 'invalid_client', 'send Idz-Client-Id and a bearer client secret');
    const site = await requireSiteSecret(c, services.db, clientId);
    const body = VerifySchema.parse(await c.req.json());
    try {
      const started = await startVerification(services, c.env, site, {
        sub: body.sub,
        reason: body.reason ?? null,
      });
      return c.json(
        {
          ...publicVerification(started.verification),
          challenge_id: started.challengeId,
          code: started.code,
          expires_at: started.expiresAt,
        },
        201,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'login_required') {
        throw new ApiError(
          404,
          'unknown_sub',
          'no active device is bound to this sub for your site',
        );
      }
      throw err;
    }
  });

  r.get('/v1/verify/:id', async (c) => {
    const services = c.get('services');
    const clientId = clientIdFromBearerHint(
      c.req.header('idz-client-id'),
      c.req.header('authorization'),
    );
    if (!clientId)
      throw new ApiError(401, 'invalid_client', 'send Idz-Client-Id and a bearer client secret');
    const site = await requireSiteSecret(c, services.db, clientId);
    const v = await getVerification(services.db, c.req.param('id'));
    if (!v || v.clientId !== site.clientId)
      throw notFound('unknown_verification', 'no such verification');
    return c.json(publicVerification(v), 200, { 'cache-control': 'no-store' });
  });

  return r;
}

/**
 * The client id travels in `Idz-Client-Id`; the secret is the bearer token.
 * `Authorization: Basic base64(client_id:client_secret)` is accepted too.
 */
function clientIdFromBearerHint(
  header: string | undefined,
  auth: string | undefined,
): string | null {
  if (header) return header;
  if (auth?.toLowerCase().startsWith('basic ')) {
    const decoded = atob(auth.slice(6));
    const i = decoded.indexOf(':');
    return i > 0 ? decodeURIComponent(decoded.slice(0, i)) : null;
  }
  return null;
}
