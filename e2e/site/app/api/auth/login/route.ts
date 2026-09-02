import { cookies } from 'next/headers';
import { getIdentizen } from '@/lib/identizen';
import { pkceChallenge, randomString } from '@/lib/pkce';
import { findUser, getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Start an OIDC login. `?mode=enroll` binds the phone to the current password session
 * (prompt=enroll); `?mode=stepup` requests acr idz:mfa for the enrolled sub.
 */
export async function GET(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const mode = new URL(req.url).searchParams.get('mode') ?? 'login';
  const session = await getSession();

  const state = randomString(16);
  const nonce = randomString(16);
  const verifier = randomString(32);
  const url = new URL(cfg.discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', `${cfg.siteUrl}/api/auth/callback`);
  url.searchParams.set('scope', 'openid handle');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', await pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');

  if (mode === 'enroll') {
    if (!session?.username) return Response.redirect(`${cfg.siteUrl}/login`, 302);
    url.searchParams.set('prompt', 'enroll');
  } else if (mode === 'stepup') {
    const sub = session?.username ? findUser(session.username)?.enrolledSub : session?.sub;
    if (!sub) return Response.redirect(`${cfg.siteUrl}/?error=not_enrolled`, 302);
    url.searchParams.set('acr_values', 'idz:mfa');
    url.searchParams.set('login_hint', sub);
  }

  const jar = await cookies();
  jar.set('oidc_tx', JSON.stringify({ state, nonce, verifier, mode }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return Response.redirect(url.toString(), 302);
}
