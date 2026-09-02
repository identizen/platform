import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getIdentizen } from '@/lib/identizen';
import { createSession, getSession, setEnrolledSub, updateSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const g = globalThis as unknown as { __idzJwks?: ReturnType<typeof createRemoteJWKSet> };

export async function GET(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const url = new URL(req.url);
  const jar = await cookies();
  const txRaw = jar.get('oidc_tx')?.value;
  jar.delete('oidc_tx');
  const tx = txRaw
    ? (JSON.parse(txRaw) as { state: string; nonce: string; verifier: string; mode: string })
    : null;
  const back = tx?.mode === 'login' ? '/' : '/account';

  const error = url.searchParams.get('error');
  if (error)
    return Response.redirect(`${cfg.siteUrl}${back}?error=${encodeURIComponent(error)}`, 302);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!tx || !code || state !== tx.state)
    return Response.redirect(`${cfg.siteUrl}${back}?error=state_mismatch`, 302);

  const tokenRes = await fetch(cfg.discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${cfg.siteUrl}/api/auth/callback`,
      code_verifier: tx.verifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return Response.redirect(
      `${cfg.siteUrl}${back}?error=token_${tokenRes.status}&detail=${encodeURIComponent(body.slice(0, 200))}`,
      302,
    );
  }
  const tokens = (await tokenRes.json()) as { id_token: string; access_token: string };
  g.__idzJwks ??= createRemoteJWKSet(new URL(cfg.discovery.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, g.__idzJwks, {
    issuer: cfg.discovery.issuer,
    audience: cfg.clientId,
  });
  if (payload.nonce !== tx.nonce)
    return Response.redirect(`${cfg.siteUrl}${back}?error=nonce_mismatch`, 302);

  const sub = String(payload.sub);
  const sid = String(payload.sid);
  const acr = String(payload.acr);
  const amr = Array.isArray(payload.amr) ? (payload.amr as string[]) : [];

  const existing = await getSession();
  if (tx.mode === 'enroll' && existing?.username) {
    setEnrolledSub(existing.username, sub);
    updateSession(existing.id, { sid });
    return Response.redirect(`${cfg.siteUrl}/account`, 302);
  }
  if (tx.mode === 'stepup' && existing) {
    updateSession(existing.id, { sub, sid, acr, amr });
    return Response.redirect(`${cfg.siteUrl}${existing.username ? '/account' : '/dashboard'}`, 302);
  }
  await createSession({ sub, sid, acr, amr });
  return Response.redirect(`${cfg.siteUrl}/dashboard`, 302);
}
