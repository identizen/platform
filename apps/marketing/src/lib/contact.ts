export interface ContactInput {
  name: string;
  email: string;
  message: string;
  /** Turnstile token from the widget. */
  token?: string | undefined;
}

export interface ContactValidation {
  ok: boolean;
  errors: Partial<Record<keyof ContactInput, string>>;
  value: ContactInput;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shared by the browser (inline validation) and the endpoint. */
export function validateContact(raw: Record<string, unknown>): ContactValidation {
  const str = (k: string): string => (typeof raw[k] === 'string' ? raw[k].trim() : '');
  const value: ContactInput = {
    name: str('name').slice(0, 120),
    email: str('email').slice(0, 254),
    message: str('message').slice(0, 5000),
    token: typeof raw.token === 'string' ? raw.token : undefined,
  };
  const errors: ContactValidation['errors'] = {};
  if (value.name.length < 2) errors.name = 'Tell us your name.';
  if (!EMAIL.test(value.email)) errors.email = 'That email does not look right.';
  if (value.message.length < 10)
    errors.message = 'A few more words, please (at least 10 characters).';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/** Hidden field bots fill and people never see; and the time the form was rendered. */
export const HONEYPOT_FIELD = 'company';
export const RENDERED_AT_FIELD = 'rendered_at';
/** Nobody reads the page and writes a message in under this many milliseconds. */
export const MIN_FILL_MS = 2500;

/**
 * True when a submission looks automated: the honeypot has a value, or the form was submitted
 * too soon after it was rendered. Callers should answer such requests with a normal-looking
 * success and send nothing.
 */
export function looksLikeBot(raw: Record<string, unknown>, now: number = Date.now()): boolean {
  const honey = raw[HONEYPOT_FIELD];
  if (typeof honey === 'string' && honey.trim().length > 0) return true;
  const rendered = Number(raw[RENDERED_AT_FIELD]);
  if (Number.isFinite(rendered) && rendered > 0 && now - rendered < MIN_FILL_MS) return true;
  return false;
}

export interface TurnstileResult {
  success: boolean;
  'error-codes'?: string[];
}

/** Verify a Turnstile token with Cloudflare. Skipped (returns true) when no secret is configured. */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  ip: string | null,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!res.ok) return false;
  const json = (await res.json()) as TurnstileResult;
  return json.success;
}

export interface SendMailInput {
  apiKey: string | undefined;
  to: string;
  from: string;
  contact: ContactInput;
  fetchImpl?: typeof fetch;
}

/** Send through Resend. Without an API key (dev) it logs and reports `sent: false`. */
export async function sendContactMail(
  input: SendMailInput,
): Promise<{ sent: boolean; id?: string }> {
  const fetchImpl =
    input.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init));
  if (!input.apiKey) {
    console.info(
      `[contact] (no RESEND_API_KEY) from ${input.contact.email}: ${input.contact.message.slice(0, 80)}`,
    );
    return { sent: false };
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.contact.email,
      subject: `identizen.com contact: ${input.contact.name}`,
      text: `${input.contact.name} <${input.contact.email}>\n\n${input.contact.message}`,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
  const json = (await res.json()) as { id?: string };
  return { sent: true, ...(json.id && { id: json.id }) };
}
