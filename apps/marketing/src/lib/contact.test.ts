import { describe, expect, it, vi } from 'vitest';
import { looksLikeBot, sendContactMail, validateContact, verifyTurnstile } from './contact';
import { isActive } from './site';

describe('validateContact', () => {
  it('accepts a good submission and trims', () => {
    const r = validateContact({
      name: ' Ada ',
      email: 'ada@example.com',
      message: 'Hello there, Identizen!',
    });
    expect(r.ok).toBe(true);
    expect(r.value.name).toBe('Ada');
  });
  it('reports each field', () => {
    const r = validateContact({ name: 'A', email: 'nope', message: 'short' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'message', 'name']);
  });
});

describe('verifyTurnstile', () => {
  it('skips without a secret, fails without a token, posts otherwise', async () => {
    expect(await verifyTurnstile(undefined, undefined, null)).toBe(true);
    expect(await verifyTurnstile(undefined, 'secret', null)).toBe(false);
    const fetchImpl = vi.fn(async () => Response.json({ success: true }));
    expect(
      await verifyTurnstile('tok', 'secret', '1.2.3.4', fetchImpl as unknown as typeof fetch),
    ).toBe(true);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1]
      .body;
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });
});

describe('sendContactMail', () => {
  const contact = { name: 'Ada', email: 'ada@example.com', message: 'Hello there, Identizen!' };
  it('logs without an API key', async () => {
    expect(await sendContactMail({ apiKey: undefined, to: 'x@y', from: 'a@b', contact })).toEqual({
      sent: false,
    });
  });
  it('posts to Resend with a key', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'em_1' }));
    const r = await sendContactMail({
      apiKey: 'k',
      to: 'x@y',
      from: 'a@b',
      contact,
      fetchImpl: fetchImpl,
    });
    expect(r).toEqual({ sent: true, id: 'em_1' });
  });
});

describe('isActive', () => {
  it('matches sections but not external links', () => {
    expect(isActive('/blog/why', '/blog')).toBe(true);
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/pricing', '/')).toBe(false);
    expect(isActive('/docs', 'https://docs.identizen.com')).toBe(false);
  });
});

describe('looksLikeBot', () => {
  it('flags a filled honeypot and a too-fast submission, and nothing else', () => {
    const now = 1_000_000;
    const human = { name: 'Ada', email: 'ada@example.com', message: 'Hello there, ten chars.' };
    expect(looksLikeBot({ ...human, company: '', rendered_at: String(now - 20_000) }, now)).toBe(
      false,
    );
    expect(looksLikeBot({ ...human, company: 'Acme Corp' }, now)).toBe(true);
    expect(looksLikeBot({ ...human, rendered_at: String(now - 500) }, now)).toBe(true);
    // No timing field at all (an old page or a JS-less submission) is not treated as a bot.
    expect(looksLikeBot(human, now)).toBe(false);
  });
});
