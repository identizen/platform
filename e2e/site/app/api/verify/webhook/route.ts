import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getIdentizen } from '@/lib/identizen';
import { recordWebhook } from '@/lib/session';

export const dynamic = 'force-dynamic';

const g = globalThis as unknown as { __idzJwks?: ReturnType<typeof createRemoteJWKSet> };

/** Verification API webhook: a signed JWT (application/jwt) from the index. */
export async function POST(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const token = await req.text();
  try {
    g.__idzJwks ??= createRemoteJWKSet(new URL(cfg.discovery.jwks_uri));
    const { payload } = await jwtVerify(token, g.__idzJwks, {
      issuer: cfg.discovery.issuer,
      audience: cfg.clientId,
      typ: 'idz-webhook+jwt',
    });
    if (typeof payload.verification_id === 'string' && typeof payload.status === 'string') {
      recordWebhook(payload.verification_id, payload.status);
    }
    return new Response(null, { status: 200 });
  } catch (err) {
    return Response.json({ error: 'invalid_token', detail: String(err) }, { status: 400 });
  }
}
