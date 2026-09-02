import { getIdentizen } from '@/lib/identizen';
import { findUser, getSession, getWebhook } from '@/lib/session';

export const dynamic = 'force-dynamic';

function siteAuth(cfg: { clientId: string; clientSecret: string }): Record<string, string> {
  return {
    authorization: `Bearer ${cfg.clientSecret}`,
    'idz-client-id': cfg.clientId,
    'content-type': 'application/json',
  };
}

/** POST { reason } -> start a verification for the enrolled sub. */
export async function POST(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const session = await getSession();
  const sub = session?.username ? findUser(session.username)?.enrolledSub : session?.sub;
  if (!sub) return Response.json({ error: 'not_enrolled' }, { status: 400 });
  const { reason } = (await req.json()) as { reason?: string };
  const res = await fetch(`${cfg.indexUrl}/v1/verify`, {
    method: 'POST',
    headers: siteAuth(cfg),
    body: JSON.stringify({ sub, reason: reason || null }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return Response.json(body, { status: res.status });
}

/** GET ?id= -> poll the index; when approved, check the assertion's reason_hash against the reason. */
export async function GET(req: Request): Promise<Response> {
  const cfg = await getIdentizen();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const res = await fetch(`${cfg.indexUrl}/v1/verify/${id}`, { headers: siteAuth(cfg) });
  const body = (await res.json()) as {
    verification_id: string;
    status: string;
    reason: string | null;
    assertion: { payload: { reason_hash: string | null } } | null;
  };
  let reasonHashMatches: boolean | undefined;
  if (body.status === 'approved' && body.assertion) {
    const expected = body.reason ? await sha256b64url(body.reason) : null;
    reasonHashMatches = body.assertion.payload.reason_hash === expected;
  }
  return Response.json({
    ...body,
    reason_hash_matches: reasonHashMatches,
    webhook_status: getWebhook(id)?.status ?? null,
  });
}

async function sha256b64url(s: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  let out = '';
  for (const b of digest) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
