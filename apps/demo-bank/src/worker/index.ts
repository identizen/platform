/**
 * The demo bank Worker. Everything is a static asset except one endpoint:
 *
 *   POST /api/demo-email  { "email": "you@example.com", "kind": "registered" | "lure" }
 *                         ->  { "sent": true, "kind": "registered" }
 *
 * which sends the visitor a JT Merlin alert: the real one (registered with Fromenance at send
 * time, so it verifies) by default, or a lure (never registered, so it does not) when asked.
 * Same-origin only, rate limited per IP and per recipient.
 */
import {
  DemoMailError,
  isDemoKind,
  sendDemoEmail,
  type DemoKind,
  type DemoMailDeps,
  type DemoMailEnv,
} from './demo-email';
import { canonicalAddress } from './recipient-hash';

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env extends DemoMailEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** 3 per minute per client IP. */
  DEMO_MAIL_IP_LIMIT: RateLimit;
  /** 1 per minute per recipient address. */
  DEMO_MAIL_TO_LIMIT: RateLimit;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export async function handleDemoEmail(
  request: Request,
  env: Env,
  deps: DemoMailDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'POST only' }, { allow: 'POST' });
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) {
    return json(403, { error: 'This endpoint only answers the demo bank itself.' });
  }
  let email = '';
  let kind: DemoKind = 'registered';
  try {
    const body = (await request.json()) as { email?: unknown; kind?: unknown };
    email = typeof body.email === 'string' ? canonicalAddress(body.email) : '';
    if (body.kind !== undefined) {
      if (!isDemoKind(body.kind)) {
        return json(400, { error: '"kind" must be "registered" or "lure".' });
      }
      kind = body.kind;
    }
  } catch {
    return json(400, { error: 'Send JSON with an "email" field.' });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: 'That does not look like an email address.' });
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const [byIp, byTo] = await Promise.all([
    env.DEMO_MAIL_IP_LIMIT.limit({ key: ip }),
    env.DEMO_MAIL_TO_LIMIT.limit({ key: email }),
  ]);
  if (!byIp.success || !byTo.success) {
    return json(
      429,
      { error: 'Too many demo emails right now. Try again in a minute.' },
      { 'retry-after': '60' },
    );
  }

  try {
    await sendDemoEmail(env, email, kind, deps);
    return json(200, { sent: true, kind });
  } catch (err) {
    if (err instanceof DemoMailError) {
      console.error(`demo-email ${err.stage} failed: ${err.message}`);
      return json(502, {
        error:
          err.stage === 'register'
            ? 'We could not register the message with the provenance registry. Try again shortly.'
            : 'We could not hand the message to the mail provider. Try again shortly.',
      });
    }
    console.error('demo-email failed', err);
    return json(500, { error: 'Something went wrong. Try again shortly.' });
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/demo-email') return handleDemoEmail(request, env);
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
