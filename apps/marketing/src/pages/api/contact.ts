import type { APIRoute } from 'astro';
import { looksLikeBot, sendContactMail, validateContact, verifyTurnstile } from '../../lib/contact';

export const prerender = false;

interface Env {
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
}

function env(locals: App.Locals): Env {
  const runtime = (locals as { runtime?: { env?: Env } }).runtime?.env ?? {};
  const meta = import.meta.env as Record<string, string | undefined>;
  return {
    TURNSTILE_SECRET_KEY: runtime.TURNSTILE_SECRET_KEY ?? meta.TURNSTILE_SECRET_KEY,
    RESEND_API_KEY: runtime.RESEND_API_KEY ?? meta.RESEND_API_KEY,
    CONTACT_TO: runtime.CONTACT_TO ?? meta.CONTACT_TO,
    CONTACT_FROM: runtime.CONTACT_FROM ?? meta.CONTACT_FROM,
  };
}

/** POST /api/contact — Turnstile-protected form -> Resend. Without keys (dev) it logs and returns ok. */
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const e = env(locals);
  let raw: Record<string, unknown>;
  try {
    const ct = request.headers.get('content-type') ?? '';
    raw = ct.includes('application/json')
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  // Bots get the same answer as people, and nothing is sent.
  if (looksLikeBot(raw)) return Response.json({ ok: true, sent: false });
  const result = validateContact({ ...raw, token: raw.token ?? raw['cf-turnstile-response'] });
  if (!result.ok)
    return Response.json({ ok: false, error: 'invalid', errors: result.errors }, { status: 400 });

  let ip: string | null = null;
  try {
    ip = request.headers.get('cf-connecting-ip') ?? clientAddress;
  } catch {
    ip = null;
  }
  if (!(await verifyTurnstile(result.value.token, e.TURNSTILE_SECRET_KEY, ip))) {
    return Response.json({ ok: false, error: 'turnstile_failed' }, { status: 403 });
  }
  try {
    const sent = await sendContactMail({
      apiKey: e.RESEND_API_KEY,
      to: e.CONTACT_TO ?? 'contact@identizen.com',
      from: e.CONTACT_FROM ?? 'Identizen <contact@identizen.com>',
      contact: result.value,
    });
    return Response.json({ ok: true, sent: sent.sent });
  } catch (err) {
    console.error('contact mail failed', err);
    return Response.json({ ok: false, error: 'send_failed' }, { status: 502 });
  }
};
