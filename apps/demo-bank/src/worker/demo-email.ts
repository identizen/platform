/**
 * "Send me a demo email": one JT Merlin alert to an address the visitor typed on /verify.
 *
 * A coin flip decides what goes out. Heads: the real alert, registered with Fromenance at send
 * time exactly as a bank would do it, so pasting it on /verify comes back Verified. Tails: a lure
 * that copies the alert, with urgency, a look-alike link, and a reference code that passes the
 * checksum but was never issued, so the same paste comes back Not verified. Both carry the demo
 * disclaimer. Nothing is stored here; the registry is the only record.
 */
import { fingerprintContent, fingerprintSubject, randomVerifyCode } from './fingerprint';
import { canonicalAddress, recipientHash } from './recipient-hash';

export interface DemoMailEnv {
  RESEND_API_KEY: string;
  FROMENANCE_API_KEY: string;
  FROMENANCE_TENANT_SECRET: string;
  /** The From header, for example "JT Merlin Bank <alerts@jtmerlin.com>". */
  DEMO_MAIL_FROM: string;
  FROMENANCE_API_ORIGIN?: string;
  RESEND_API_ORIGIN?: string;
}

export type DemoKind = 'registered' | 'lure';
export type TemplateId = 'card-transaction' | 'new-device' | 'wire-notice';

export const BANK_NAME = 'JT Merlin Bank';
export const VERIFY_PAGE = 'jtmerlin.com/verify';
const SITE = 'https://www.jtmerlin.com';
/** Reserved TLD: never registrable, so the lure's link can never lead anywhere. */
export const LURE_SITE = 'https://jtmerlin-secure.example';

export const DEMO_DISCLAIMER = [
  `This is a demo. ${BANK_NAME} is a fictional bank, and this message was sent because someone`,
  `entered this address at ${VERIFY_PAGE} to try message verification. No account, transaction,`,
  'or link in it is real, and no action is needed. If that was not you, you can ignore it.',
].join('\n');

interface Template {
  id: TemplateId;
  subject: string;
  body: (when: string) => string;
  lureSubject: string;
  lureBody: (when: string) => string;
}

const SIGNOFF = `Thank you,\n${BANK_NAME} Fraud Team`;

export const TEMPLATES: readonly Template[] = [
  {
    id: 'card-transaction',
    subject: 'We noticed a card transaction',
    body: (when) =>
      [
        'Hi there,',
        `A purchase of $412.90 at ACME ELECTRONICS was made with your ${BANK_NAME} Visa ending in 4471 on ${when}.`,
        'If this was you, no action is needed. If you do not recognize this transaction, review it in the app or call the number on the back of your card.',
        `Review this transaction: ${SITE}/app/activity`,
        SIGNOFF,
      ].join('\n\n'),
    lureSubject: 'Urgent: your card has been temporarily restricted',
    lureBody: (when) =>
      [
        'Hi there,',
        `A purchase of $412.90 at ACME ELECTRONICS was attempted with your ${BANK_NAME} Visa ending in 4471 on ${when} and has been placed on hold.`,
        'To avoid permanent suspension of your card, confirm your identity within 24 hours.',
        `Confirm your identity now: ${LURE_SITE}/login?ref=8812`,
        SIGNOFF,
      ].join('\n\n'),
  },
  {
    id: 'new-device',
    subject: 'A new device signed in to your account',
    body: (when) =>
      [
        'Hi there,',
        `A new device (Chrome on Windows) signed in to your ${BANK_NAME} account on ${when}.`,
        'If this was you, no action is needed. If not, open the app on your phone and lock your card.',
        `Review your devices: ${SITE}/app`,
        SIGNOFF,
      ].join('\n\n'),
    lureSubject: 'Unrecognized sign-in: verify your account now',
    lureBody: (when) =>
      [
        'Hi there,',
        `We blocked a sign-in to your ${BANK_NAME} account from an unrecognized device on ${when}.`,
        'Your online access will be suspended unless you verify your identity within 12 hours.',
        `Verify your account now: ${LURE_SITE}/verify-account?ref=4471`,
        SIGNOFF,
      ].join('\n\n'),
  },
  {
    id: 'wire-notice',
    subject: 'Your wire to Acme Supply Co. was sent',
    body: (when) =>
      [
        'Hi there,',
        `The wire of $12,000.00 to Acme Supply Co. that you approved on your phone on ${when} has been sent. Wire confirmation 98812.`,
        'If you did not approve this wire, call us right away at the number on the back of your card.',
        `View your activity: ${SITE}/app/activity`,
        SIGNOFF,
      ].join('\n\n'),
    lureSubject: 'Action required: wire of $12,000.00 pending your confirmation',
    lureBody: (when) =>
      [
        'Hi there,',
        `A wire of $12,000.00 to Acme Supply Co. requested on ${when} is pending.`,
        'Confirm it within 2 hours or the transfer will be reversed and a $45.00 fee applied to your account.',
        `Confirm the wire: ${LURE_SITE}/wire/confirm?ref=98812`,
        SIGNOFF,
      ].join('\n\n'),
  },
];

/** The two lines Fromenance strips at verify time. The code appears twice on purpose. */
export function verifyFooter(code: string): string {
  return `Not sure this email is from ${BANK_NAME}? Enter code ${code} at ${VERIFY_PAGE}. Reference: ${code}`;
}

/** "September 27 at 12:42 PM", US Eastern, the bank's home time zone. */
export function formatWhen(now: Date): string {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(now);
  return `${date} at ${time}`;
}

export interface DemoDraft {
  kind: DemoKind;
  templateId: TemplateId;
  subject: string;
  /** Body plus disclaimer, without the Fromenance footer: what gets fingerprinted. */
  fingerprintText: string;
}

export function draftDemoMessage(kind: DemoKind, template: Template, now: Date): DemoDraft {
  const when = formatWhen(now);
  const body = kind === 'registered' ? template.body(when) : template.lureBody(when);
  return {
    kind,
    templateId: template.id,
    subject: kind === 'registered' ? template.subject : template.lureSubject,
    fingerprintText: `${body}\n\n${DEMO_DISCLAIMER}`,
  };
}

/** The message as sent: footer between the body and the disclaimer. */
export function finalText(draft: DemoDraft, code: string): string {
  const body = draft.fingerprintText.slice(0, -(DEMO_DISCLAIMER.length + 2));
  return `${body}\n\n${verifyFooter(code)}\n\n${DEMO_DISCLAIMER}`;
}

export class DemoMailError extends Error {
  constructor(
    public readonly stage: 'register' | 'send',
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DemoMailError';
  }
}

export interface DemoMailDeps {
  fetch?: typeof fetch;
  random?: () => number;
  now?: () => Date;
}

export interface DemoMailResult {
  kind: DemoKind;
  templateId: TemplateId;
  code: string;
  messageId: string;
  registrationId: string | null;
}

/** Address part of "Name <addr>" or a bare address. */
export function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m?.[1] ?? from).trim();
}

export async function sendDemoEmail(
  env: DemoMailEnv,
  to: string,
  deps: DemoMailDeps = {},
): Promise<DemoMailResult> {
  const f = deps.fetch ?? fetch;
  const random = deps.random ?? Math.random;
  const now = (deps.now ?? (() => new Date()))();
  const address = canonicalAddress(to);
  const kind: DemoKind = random() < 0.5 ? 'registered' : 'lure';
  const template = TEMPLATES[Math.floor(random() * TEMPLATES.length) % TEMPLATES.length];
  if (!template) throw new Error('no templates');
  const draft = draftDemoMessage(kind, template, now);
  const messageId = `<${crypto.randomUUID()}@jtmerlin.com>`;

  let code: string;
  let registrationId: string | null = null;
  if (kind === 'registered') {
    // Hash and fingerprint here. Neither the address nor the body is sent to Fromenance.
    const fp = await fingerprintContent({ text: draft.fingerprintText });
    const body: Record<string, unknown> = {
      channel: 'email',
      recipient_hash: await recipientHash(address, env.FROMENANCE_TENANT_SECRET),
      message_id: messageId,
      from_address: addressOf(env.DEMO_MAIL_FROM),
      sent_at: now.toISOString(),
      subject_fingerprint: await fingerprintSubject(draft.subject),
      link_domains: ['jtmerlin.com'],
      template_id: draft.templateId,
      provider: 'resend',
    };
    if (fp.tokens > 0) body.content_fingerprint = { simhash: fp.simhash, sha256: fp.sha256 };
    const api = (env.FROMENANCE_API_ORIGIN ?? 'https://api.fromenance.com').replace(/\/$/, '');
    const res = await f(`${api}/v1/communications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.FROMENANCE_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': messageId,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new DemoMailError('register', res.status, `Fromenance answered ${res.status}`);
    }
    const reg = (await res.json()) as { id: string; verify_code: string };
    code = reg.verify_code;
    registrationId = reg.id;
  } else {
    code = randomVerifyCode(random);
  }

  const resend = (env.RESEND_API_ORIGIN ?? 'https://api.resend.com').replace(/\/$/, '');
  const sent = await f(`${resend}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.DEMO_MAIL_FROM,
      to: [address],
      subject: draft.subject,
      text: finalText(draft, code),
    }),
  });
  if (!sent.ok) throw new DemoMailError('send', sent.status, `Resend answered ${sent.status}`);

  return { kind, templateId: draft.templateId, code, messageId, registrationId };
}
