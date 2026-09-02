import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getIdentizen } from '@/lib/identizen';
import { revokeSessionsBySid } from '@/lib/session';

export const dynamic = 'force-dynamic';

const g = globalThis as unknown as { __idzJwks?: ReturnType<typeof createRemoteJWKSet> };

/** OpenID Connect Back-Channel Logout receiver. */
export async function POST(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const form = await req.formData();
  const token = form.get('logout_token');
  if (typeof token !== 'string')
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    g.__idzJwks ??= createRemoteJWKSet(new URL(cfg.discovery.jwks_uri));
    const { payload } = await jwtVerify(token, g.__idzJwks, {
      issuer: cfg.discovery.issuer,
      audience: cfg.clientId,
      typ: 'logout+jwt',
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (
      !events ||
      !('http://schemas.openid.net/event/backchannel-logout' in events) ||
      typeof payload.sid !== 'string' ||
      payload.nonce !== undefined
    ) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    const n = revokeSessionsBySid(payload.sid);
    console.info(`[identizen] back-channel logout for sid ${payload.sid}: ${n} session(s) ended`);
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }
}
