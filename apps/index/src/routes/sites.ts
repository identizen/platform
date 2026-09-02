import { createSite, getSite, recordAudit, updateSite, type Db, type Site } from '@identizen/db';
import { normalizeRpId, ulid } from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { bearer, hashSecret, randomToken, safeEqual } from '../lib/util';

const CreateSiteSchema = z
  .object({
    name: z.string().min(1).max(64),
    rp_id: z.string().min(1).max(253),
    redirect_uris: z.array(z.string().url()).min(1).max(32),
    backchannel_logout_uri: z.string().url().nullable().optional(),
    webhook_url: z.string().url().nullable().optional(),
    /** Public (PKCE-only) clients get no secret. Default: confidential. */
    public: z.boolean().default(false),
    /** `idz_test_` ids for local dev, `idz_live_` otherwise. */
    environment: z.enum(['live', 'test']).default('live'),
  })
  .strict();

const PatchSiteSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    redirect_uris: z.array(z.string().url()).min(1).max(32).optional(),
    backchannel_logout_uri: z.string().url().nullable().optional(),
    webhook_url: z.string().url().nullable().optional(),
    rotate_webhook_secret: z.boolean().optional(),
    rotate_client_secret: z.boolean().optional(),
  })
  .strict();

const WebhookSchema = z.object({ webhook_url: z.string().url().nullable() }).strict();

export function publicSite(s: Site): Record<string, unknown> {
  return {
    client_id: s.clientId,
    rp_id: s.rpId,
    name: s.name,
    redirect_uris: s.redirectUris,
    backchannel_logout_uri: s.backchannelLogoutUri,
    webhook_url: s.webhookUrl,
    public_client: s.clientSecretHash === null,
    created_at: s.createdAt,
  };
}

/** Bearer = client secret. Throws 401/403 unless it matches. */
export async function requireSiteSecret(
  c: { req: { header(n: string): string | undefined } },
  db: Db,
  clientId: string,
): Promise<Site> {
  const site = await getSite(db, clientId);
  if (!site) throw notFound('unknown_client', 'no such site');
  const auth = c.req.header('authorization');
  let secret = bearer(auth);
  if (!secret && auth?.toLowerCase().startsWith('basic ')) {
    const decoded = atob(auth.slice(6));
    secret = decodeURIComponent(decoded.slice(decoded.indexOf(':') + 1));
  }
  if (!secret || !site.clientSecretHash || !safeEqual(hashSecret(secret), site.clientSecretHash)) {
    throw unauthorized('invalid_client', 'client secret is missing or wrong');
  }
  return site;
}

export function sitesRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Register a site. Open in dev/self-host; gated by SITE_REGISTRATION_TOKEN on hosted indexes. */
  r.post('/sites', async (c) => {
    const { db, env } = c.get('services');
    if (env.OPEN_SITE_REGISTRATION !== 'true') {
      const token = bearer(c.req.header('authorization'));
      if (
        !env.SITE_REGISTRATION_TOKEN ||
        !token ||
        !safeEqual(token, env.SITE_REGISTRATION_TOKEN)
      ) {
        throw forbidden('registration_closed', 'site registration requires a registration token');
      }
    }
    const body = CreateSiteSchema.parse(await c.req.json());
    const clientId = `idz_${body.environment}_${ulid()}`;
    const clientSecret = body.public ? null : randomToken(32);
    const webhookSecret = body.webhook_url ? randomToken(32) : null;
    const site = await createSite(db, {
      clientId,
      clientSecretHash: clientSecret ? hashSecret(clientSecret) : null,
      rpId: normalizeRpId(body.rp_id),
      name: body.name,
      redirectUris: body.redirect_uris,
      backchannelLogoutUri: body.backchannel_logout_uri ?? null,
      webhookUrl: body.webhook_url ?? null,
      webhookSecretHash: webhookSecret ? hashSecret(webhookSecret) : null,
    });
    await recordAudit(db, { kind: 'site.created', clientId, detail: { rp_id: site.rpId } });
    return c.json(
      { ...publicSite(site), client_secret: clientSecret, webhook_secret: webhookSecret },
      201,
    );
  });

  r.get('/sites/:client_id', async (c) => {
    const { db } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    return c.json(publicSite(site));
  });

  r.patch('/sites/:client_id', async (c) => {
    const { db } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    const body = PatchSiteSchema.parse(await c.req.json());
    const newClientSecret = body.rotate_client_secret ? randomToken(32) : null;
    const newWebhookSecret = body.rotate_webhook_secret ? randomToken(32) : null;
    const updated = await updateSite(db, site.clientId, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.redirect_uris !== undefined && { redirectUris: body.redirect_uris }),
      ...(body.backchannel_logout_uri !== undefined && {
        backchannelLogoutUri: body.backchannel_logout_uri,
      }),
      ...(body.webhook_url !== undefined && { webhookUrl: body.webhook_url }),
      ...(newClientSecret && { clientSecretHash: hashSecret(newClientSecret) }),
      ...(newWebhookSecret && { webhookSecretHash: hashSecret(newWebhookSecret) }),
    });
    await recordAudit(db, { kind: 'site.updated', clientId: site.clientId });
    return c.json({
      ...publicSite(updated),
      client_secret: newClientSecret,
      webhook_secret: newWebhookSecret,
    });
  });

  /** Register the Verification API webhook; returns a fresh webhook secret. */
  r.post('/sites/:client_id/webhook', async (c) => {
    const { db } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    const body = WebhookSchema.parse(await c.req.json());
    const webhookSecret = body.webhook_url ? randomToken(32) : null;
    const updated = await updateSite(db, site.clientId, {
      webhookUrl: body.webhook_url,
      webhookSecretHash: webhookSecret ? hashSecret(webhookSecret) : null,
    });
    return c.json({
      client_id: updated.clientId,
      webhook_url: updated.webhookUrl,
      webhook_secret: webhookSecret,
    });
  });

  return r;
}
