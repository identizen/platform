import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_DISCLAIMER,
  DemoMailError,
  LURE_SITE,
  TEMPLATES,
  addressOf,
  draftDemoMessage,
  finalText,
  sendDemoEmail,
  type DemoMailEnv,
} from './demo-email';
import { canonicalizeVerifyCode, fingerprintContent, normalizeContent } from './fingerprint';

const env: DemoMailEnv = {
  RESEND_API_KEY: 're_test',
  FROMENANCE_API_KEY: 'fr_test_x',
  FROMENANCE_TENANT_SECRET: 'secret',
  DEMO_MAIL_FROM: 'JT Merlin Bank <alerts@jtmerlin.com>',
};

const NOW = new Date('2026-09-27T16:42:00Z');
const urlOf = (i: RequestInfo | URL) =>
  typeof i === 'string' ? i : i instanceof URL ? i.href : i.url;

/** A fetch double that records calls and answers Fromenance and Resend the way they do. */
function fakeFetch(opts: { registerStatus?: number; sendStatus?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    calls.push({ url, init: init ?? {} });
    if (url.endsWith('/v1/communications')) {
      const status = opts.registerStatus ?? 201;
      return new Response(
        status === 201
          ? JSON.stringify({
              id: 'com_1',
              verify_code: 'KX73-PQ9G',
              expires_at: 'x',
              sandbox: false,
            })
          : JSON.stringify({ title: 'nope', status }),
        { status },
      );
    }
    if (url.endsWith('/emails')) {
      const status = opts.sendStatus ?? 200;
      return new Response(JSON.stringify({ id: 'email_1' }), { status });
    }
    throw new Error(`unexpected ${url}`);
  });
  return { f: f as unknown as typeof fetch, calls };
}

const body = (c: { init: RequestInit }) =>
  JSON.parse(c.init.body as string) as Record<string, unknown>;

describe('drafts', () => {
  it('every template renders both kinds with the disclaimer and a dead lure link', () => {
    for (const t of TEMPLATES) {
      const real = draftDemoMessage('registered', t, NOW);
      const lure = draftDemoMessage('lure', t, NOW);
      expect(real.fingerprintText).toContain(DEMO_DISCLAIMER);
      expect(lure.fingerprintText).toContain(DEMO_DISCLAIMER);
      expect(real.fingerprintText).not.toContain(LURE_SITE);
      expect(lure.fingerprintText).toContain(LURE_SITE);
      expect(real.subject).not.toBe(lure.subject);
      expect(real.fingerprintText).toContain('September 27 at 12:42 PM');
    }
  });

  it('the sent text equals the fingerprinted text once Fromenance strips the footer', () => {
    const t = TEMPLATES[0];
    if (!t) throw new Error('no template');
    const draft = draftDemoMessage('registered', t, NOW);
    const sent = finalText(draft, 'KX73-PQ9G');
    expect(sent).toContain('Enter code KX73-PQ9G at jtmerlin.com/verify. Reference: KX73-PQ9G');
    expect(sent.endsWith(DEMO_DISCLAIMER)).toBe(true);
    expect(normalizeContent({ text: sent })).toBe(
      normalizeContent({ text: draft.fingerprintText }),
    );
  });

  it('reads the address out of a display-name From', () => {
    expect(addressOf('JT Merlin Bank <alerts@jtmerlin.com>')).toBe('alerts@jtmerlin.com');
    expect(addressOf('alerts@jtmerlin.com')).toBe('alerts@jtmerlin.com');
  });
});

describe('sendDemoEmail', () => {
  it('registers the real alert before sending it, with the code from the registry', async () => {
    const { f, calls } = fakeFetch();
    const result = await sendDemoEmail(env, 'Jane <Jane.Doe@Example.com>', 'registered', {
      fetch: f,
      random: () => 0.1,
      now: () => NOW,
    });
    expect(result.kind).toBe('registered');
    expect(result.code).toBe('KX73-PQ9G');
    expect(result.registrationId).toBe('com_1');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.fromenance.com/v1/communications',
      'https://api.resend.com/emails',
    ]);

    const reg = calls[0];
    const send = calls[1];
    if (!reg || !send) throw new Error('missing calls');
    const headers = reg.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe(result.messageId);
    expect(headers.authorization).toBe('Bearer fr_test_x');
    const r = body(reg);
    expect(r.recipient_hash).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(r.from_address).toBe('alerts@jtmerlin.com');
    expect(r.message_id).toBe(result.messageId);
    expect(r.link_domains).toEqual(['jtmerlin.com']);
    expect(r.content_fingerprint).toEqual({
      simhash: expect.stringMatching(/^0x[0-9a-f]{16}$/) as string,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(JSON.stringify(reg.init.body)).not.toContain('jane.doe@example.com');

    const s = body(send);
    expect(s.from).toBe(env.DEMO_MAIL_FROM);
    expect(s.to).toEqual(['jane.doe@example.com']);
    expect(String(s.text)).toContain('Reference: KX73-PQ9G');
    expect(String(s.text)).toContain(DEMO_DISCLAIMER);

    // What was registered matches what was sent, once the footer is stripped.
    const fp = await fingerprintContent({ text: String(s.text) });
    expect(fp.simhash).toBe((r.content_fingerprint as { simhash: string }).simhash);
  });

  it('the real alert is real for every template, whatever the random draw', async () => {
    for (const r of [0.01, 0.4, 0.5, 0.99]) {
      const { f, calls } = fakeFetch();
      const result = await sendDemoEmail(env, 'jane.doe@example.com', 'registered', {
        fetch: f,
        random: () => r,
        now: () => NOW,
      });
      expect(result.kind).toBe('registered');
      expect(result.registrationId).toBe('com_1');
      expect(calls[0]?.url).toBe('https://api.fromenance.com/v1/communications');
    }
  });

  it('never registers the lure and gives it a code that was never issued', async () => {
    const { f, calls } = fakeFetch();
    const result = await sendDemoEmail(env, 'jane.doe@example.com', 'lure', {
      fetch: f,
      random: () => 0.9,
      now: () => NOW,
    });
    expect(result.kind).toBe('lure');
    expect(result.registrationId).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['https://api.resend.com/emails']);
    expect(canonicalizeVerifyCode(result.code)).not.toBeNull();
    const send = calls[0];
    if (!send) throw new Error('missing call');
    const text = String(body(send).text);
    expect(text).toContain(LURE_SITE);
    expect(text).toContain(`Reference: ${result.code}`);
    expect(text).toContain(DEMO_DISCLAIMER);
  });

  it('surfaces a registry failure without sending', async () => {
    const { f, calls } = fakeFetch({ registerStatus: 401 });
    await expect(
      sendDemoEmail(env, 'jane.doe@example.com', 'registered', { fetch: f, random: () => 0.1 }),
    ).rejects.toMatchObject({ name: 'DemoMailError', stage: 'register', status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('surfaces a mail provider failure', async () => {
    const { f } = fakeFetch({ sendStatus: 403 });
    const err = await sendDemoEmail(env, 'jane.doe@example.com', 'lure', {
      fetch: f,
      random: () => 0.9,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DemoMailError);
    expect((err as DemoMailError).stage).toBe('send');
  });
});
