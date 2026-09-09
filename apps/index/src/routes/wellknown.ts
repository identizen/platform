import { getIdentityByHandle } from '@identizen/db';
import { SignedRotationSchema, toBase64Url, type SignedRotation } from '@identizen/protocol';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { badRequest, notFound } from '../lib/errors';

export function wellKnownRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /**
   * Public index metadata: the current signing key, the app URL, and the rotation statements
   * (PROTOCOL.md §3.1) that take a phone from any key it pinned earlier to the current one.
   */
  r.get('/.well-known/identizen', (c) => {
    const { indexKey, indexUrl, appUrl } = c.get('services');
    return c.json(
      {
        index: indexUrl,
        app: appUrl,
        index_pubkey: toBase64Url(indexKey.publicKey),
        rotations: indexKeyRotations(c.env),
        protocol: 'identizen/v1',
      },
      200,
      { 'cache-control': 'public, max-age=300' },
    );
  });

  /**
   * WebFinger (RFC 7033) for handle -> index resolution (federation).
   * `resource=acct:george@index.example` -> the identity id and this index.
   */
  r.get('/.well-known/webfinger', async (c) => {
    const resource = c.req.query('resource');
    if (!resource) throw badRequest('invalid_request', 'resource is required');
    const m = /^acct:([^@]+)@(.+)$/.exec(resource);
    if (!m) throw badRequest('invalid_request', 'resource must be acct:handle@host');
    const handle = (m[1] ?? '').toLowerCase();
    const host = (m[2] ?? '').toLowerCase();
    const { db, indexUrl } = c.get('services');
    const ourHost = new URL(indexUrl).host.toLowerCase();
    if (host !== ourHost) throw notFound('wrong_index', `this index does not serve ${host}`);
    const identity = await getIdentityByHandle(db, handle);
    if (!identity) throw notFound('unknown_handle', `no identity with handle ${handle}`);
    return c.json(
      {
        subject: `acct:${handle}@${ourHost}`,
        properties: { 'https://identizen.com/ns/idz': identity.idz },
        links: [
          { rel: 'https://identizen.com/ns/index', href: indexUrl },
          { rel: 'http://openid.net/specs/connect/1.0/issuer', href: indexUrl },
        ],
      },
      200,
      { 'content-type': 'application/jrd+json' },
    );
  });

  return r;
}

/**
 * The rotation statements from `INDEX_KEY_ROTATIONS`, each checked for shape; a malformed entry
 * is dropped rather than breaking discovery for every phone. Verification is the phone's job.
 */
export function indexKeyRotations(env: { INDEX_KEY_ROTATIONS?: string | undefined }): SignedRotation[] {
  const raw = env.INDEX_KEY_ROTATIONS?.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const r = SignedRotationSchema.safeParse(entry);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}
