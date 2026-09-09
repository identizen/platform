import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/lib/util';

/** F09: a caller cannot pick their own rate-limit bucket with X-Forwarded-For. */
describe('clientIp', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("believes Cloudflare's header, and X-Forwarded-For only behind a declared proxy", () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.9' }), {})).toBe('203.0.113.9');
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), {})).toBeNull();
    expect(
      clientIp(h({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), { TRUST_PROXY_HEADERS: 'true' }),
    ).toBe('198.51.100.7');
    expect(
      clientIp(h({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7' }), {
        TRUST_PROXY_HEADERS: 'true',
      }),
    ).toBe('203.0.113.9');
    expect(clientIp(h({}), { TRUST_PROXY_HEADERS: 'true' })).toBeNull();
  });
});
