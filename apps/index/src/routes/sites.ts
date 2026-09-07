import {
  createSite,
  deleteStalePendingSites,
  getSite,
  recordAudit,
  updateSite,
  type Db,
  type Site,
} from '@identizen/db';
import { normalizeRpId, ulid } from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { ApiError, badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import {
  PENDING_REGISTRATION_TTL_MS,
  checkVerification,
  ensureVerificationToken,
  verificationInstructions,
  verificationRequired,
  verificationStatus,
} from '../services/site-verification';
import { destinationProblem, outboundPolicy } from '../lib/outbound';
import { bearer, hashSecret, randomToken, safeEqual } from '../lib/util';
import { ipRateLimit } from '../middleware/rate-limit';

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

/** A URL the index will POST to must pass the egress policy before it is stored. */
function requireDestination(
  env: { OUTBOUND_ALLOW_LOCAL?: string | undefined },
  field: string,
  url: string | null | undefined,
): void {
  if (!url) return;
  const problem = destinationProblem(url, outboundPolicy(env));
  if (problem) throw badRequest('invalid_destination', `${field}: ${problem}`);
}

export function publicSite(
  s: Site,
  env: { SITE_VERIFICATION?: string | undefined },
  indexUrl: string,
): Record<string, unknown> {
  const status = verificationStatus(env, s);
  return {
    client_id: s.clientId,
    rp_id: s.rpId,
    name: s.name,
    redirect_uris: s.redirectUris,
    backchannel_logout_uri: s.backchannelLogoutUri,
    webhook_url: s.webhookUrl,
    public_client: s.clientSecretHash === null,
    created_at: s.createdAt,
    verification: {
      status,
      method: s.verificationMethod,
      verified_at: s.verifiedAt,
      ...(status === 'pending' || status === 'stale'
        ? { instructions: verificationInstructions(s, indexUrl) }
        : {}),
    },
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
    requireDestination(env, 'backchannel_logout_uri', body.backchannel_logout_uri);
    requireDestination(env, 'webhook_url', body.webhook_url);
    const clientId = `idz_${body.environment}_${ulid()}`;
    const rpId = normalizeRpId(body.rp_id);
    // A live site must prove the domain before it can be used (PROTOCOL.md §8.2). Registrations
    // that never do are swept so a squatter cannot hold a name; the token is what gets published.
    const needsProof = verificationRequired(env, { clientId, rpId });
    if (needsProof) {
      await deleteStalePendingSites(db, rpId, new Date(Date.now() - PENDING_REGISTRATION_TTL_MS));
    }
    const clientSecret = body.public ? null : randomToken(32);
    const webhookSecret = body.webhook_url ? randomToken(32) : null;
    const site = await createSite(db, {
      clientId,
      clientSecretHash: clientSecret ? hashSecret(clientSecret) : null,
      rpId,
      name: body.name,
      redirectUris: body.redirect_uris,
      backchannelLogoutUri: body.backchannel_logout_uri ?? null,
      webhookUrl: body.webhook_url ?? null,
      webhookSecretHash: webhookSecret ? hashSecret(webhookSecret) : null,
      verificationToken: randomToken(24),
      verificationMethod: needsProof ? null : 'not_required',
      verifiedAt: needsProof ? null : new Date(),
    });
    await recordAudit(db, {
      kind: 'site.created',
      clientId,
      detail: { rp_id: site.rpId, verification: needsProof ? 'pending' : 'not_required' },
    });
    return c.json(
      {
        ...publicSite(site, env, c.get('services').indexUrl),
        client_secret: clientSecret,
        webhook_secret: webhookSecret,
      },
      201,
    );
  });

  r.get('/sites/:client_id', async (c) => {
    const { db, env, indexUrl } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    return c.json(publicSite(site, env, indexUrl));
  });

  /** Verification status and what to publish. No secret: it reveals only the token to prove. */
  r.get('/sites/:client_id/verification', async (c) => {
    const { db, env, indexUrl } = c.get('services');
    const registered = await getSite(db, c.req.param('client_id'));
    if (!registered) throw notFound('unknown_client', 'no such site');
    const site = await ensureVerificationToken(db, registered);
    const status = verificationStatus(env, site);
    return c.json({
      client_id: site.clientId,
      rp_id: site.rpId,
      status,
      method: site.verificationMethod,
      verified_at: site.verifiedAt,
      instructions: verificationInstructions(site, indexUrl),
    });
  });

  /**
   * Prove the domain now: look for the token in DNS (the host, then parent zones) and at the
   * well-known URL. Anyone may ask; only a published record makes it succeed.
   */
  r.post('/sites/:client_id/verify', ipRateLimit(), async (c) => {
    const { db, env, indexUrl } = c.get('services');
    const registered = await getSite(db, c.req.param('client_id'));
    if (!registered) throw notFound('unknown_client', 'no such site');
    const site = await ensureVerificationToken(db, registered);
    const check = await checkVerification(
      site,
      indexUrl,
      (i, init) => fetch(i, init),
      outboundPolicy(env),
    );
    if (!check.ok) {
      throw new ApiError(
        409,
        'verification_failed',
        `no record with this site's token at ${check.checked.dns.join(', ')} (TXT) or ${check.checked.http}`,
      );
    }
    const updated = await updateSite(db, site.clientId, {
      verifiedAt: new Date(),
      verificationMethod: check.method,
    });
    await recordAudit(db, {
      kind: 'site.verified',
      clientId: site.clientId,
      detail: { rp_id: site.rpId, method: check.method },
    });
    return c.json({
      client_id: updated.clientId,
      rp_id: updated.rpId,
      status: verificationStatus(env, updated),
      method: updated.verificationMethod,
      verified_at: updated.verifiedAt,
    });
  });

  r.patch('/sites/:client_id', async (c) => {
    const { db } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    const body = PatchSiteSchema.parse(await c.req.json());
    requireDestination(c.env, 'backchannel_logout_uri', body.backchannel_logout_uri);
    requireDestination(c.env, 'webhook_url', body.webhook_url);
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
      ...publicSite(updated, c.env, c.get('services').indexUrl),
      client_secret: newClientSecret,
      webhook_secret: newWebhookSecret,
    });
  });

  /** Register the Verification API webhook; returns a fresh webhook secret. */
  r.post('/sites/:client_id/webhook', async (c) => {
    const { db } = c.get('services');
    const site = await requireSiteSecret(c, db, c.req.param('client_id'));
    const body = WebhookSchema.parse(await c.req.json());
    requireDestination(c.env, 'webhook_url', body.webhook_url);
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
