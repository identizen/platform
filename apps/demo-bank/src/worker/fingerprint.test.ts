import { describe, expect, it } from 'vitest';
import {
  canonicalizeVerifyCode,
  extractVerifyCodes,
  fingerprintContent,
  fingerprintSubject,
  hamming,
  normalizeContent,
  randomVerifyCode,
  registeredDomain,
  simhash64,
  unwrapUrl,
} from './fingerprint';

describe('verify codes', () => {
  it('accepts the demo code in any formatting and rejects a bad checksum', () => {
    expect(canonicalizeVerifyCode('KX73-PQ9G')).toBe('KX73PQ9G');
    expect(canonicalizeVerifyCode('kx73 pq9g')).toBe('KX73PQ9G');
    expect(canonicalizeVerifyCode('KX73-PQ9H')).toBeNull();
    expect(canonicalizeVerifyCode('KX73-PQ9')).toBeNull();
  });

  it('fabricates lure codes that pass the checksum', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 50; i++) {
      const code = randomVerifyCode(random);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(canonicalizeVerifyCode(code)).toBe(code.replace('-', ''));
    }
  });

  it('extracts codes by frequency', () => {
    expect(extractVerifyCodes('code KX73-PQ9G here. Reference: KX73-PQ9G')).toEqual(['KX73PQ9G']);
  });
});

describe('normalization', () => {
  it('strips the footer and the reference line and keeps only link domains', () => {
    const text = [
      'Hi Jane,',
      'Review this transaction: https://www.jtmerlin.com/app/alerts/tx/98812?utm=email',
      'Not sure this email is from JT Merlin Bank? Enter code KX73-PQ9G at jtmerlin.com/verify. Reference: KX73-PQ9G',
    ].join('\n');
    const n = normalizeContent({ text });
    expect(n).toBe('hi jane review this transaction jtmerlin com');
  });

  it('cuts at a signature line and drops forward chrome', () => {
    const text = ['From: a@b.c', 'Subject: x', '', 'body text here', '--', 'sig'].join('\n');
    expect(normalizeContent({ text })).toBe('body text here');
  });

  it('prefers html and drops hidden preheaders and images', () => {
    const html =
      '<div style="display:none">preheader</div><p>Hello <a href="https://x.jtmerlin.com/a">there</a></p><img alt="logo" src="p.png">';
    expect(normalizeContent({ html, text: 'ignored' })).toBe('hello there jtmerlin com logo');
  });

  it('unwraps rewritten links and reduces hosts to registered domains', () => {
    expect(
      unwrapUrl('https://safelinks.protection.outlook.com/?url=https%3A%2F%2Fjtmerlin.com%2Fa'),
    ).toBe('https://jtmerlin.com/a');
    expect(registeredDomain('mail.bank.co.uk')).toBe('bank.co.uk');
    expect(registeredDomain('www.jtmerlin.com')).toBe('jtmerlin.com');
  });
});

describe('hashes', () => {
  it('is deterministic and reports the api shape', async () => {
    const a = await fingerprintContent({ text: 'A purchase of $412.90 at ACME ELECTRONICS' });
    const b = await fingerprintContent({ text: 'a purchase of 412 90 at acme electronics' });
    expect(a.simhash).toMatch(/^0x[0-9a-f]{16}$/);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toEqual(b);
    expect(a.tokens).toBe(8);
  });

  it('measures distance: zero for the same text, small for a word swap, large otherwise', () => {
    const base =
      'hi there a purchase of 412 90 at acme electronics was made with your visa ending in 4471 on september 27 at 12 42 pm if this was you no action is needed';
    const edited = base.replace('visa', 'card');
    const other = 'urgent your card has been restricted confirm your identity within 24 hours';
    expect(hamming(simhash64(base), simhash64(base))).toBe(0);
    const near = hamming(simhash64(base), simhash64(edited));
    const far = hamming(simhash64(base), simhash64(other));
    expect(near).toBeLessThan(far);
    expect(near).toBeLessThanOrEqual(12);
  });

  it('empty text has no tokens', async () => {
    const fp = await fingerprintContent({ text: '   ' });
    expect(fp.tokens).toBe(0);
    expect(fp.simhash).toBe('0x0000000000000000');
  });

  it('subject fingerprint ignores reply and forward prefixes', async () => {
    expect(await fingerprintSubject('Fwd: Re: We noticed a card transaction')).toBe(
      await fingerprintSubject('We noticed a card transaction'),
    );
  });
});
