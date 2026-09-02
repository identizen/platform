import { describe, expect, it } from 'vitest';
import {
  ULID_RE,
  challengeId,
  deviceId,
  isPrefixedId,
  matchCode,
  pairingId,
  prefixedId,
  ulid,
  verificationId,
} from './ids.js';

describe('ulid', () => {
  it('is 26 Crockford base32 chars with a monotonic time prefix', () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toMatch(ULID_RE);
    expect(b).toMatch(ULID_RE);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
    expect(ulid()).toMatch(ULID_RE);
  });

  it('prefixes ids', () => {
    expect(challengeId()).toMatch(/^ch_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(deviceId()).toMatch(/^dev_/);
    expect(pairingId()).toMatch(/^pr_/);
    expect(verificationId()).toMatch(/^vf_/);
    expect(prefixedId('ch', 0)).toMatch(/^ch_0000000000/);
    expect(isPrefixedId(challengeId(), 'ch')).toBe(true);
    expect(isPrefixedId(challengeId(), 'dev')).toBe(false);
    expect(isPrefixedId('ch_short', 'ch')).toBe(false);
  });
});

describe('matchCode', () => {
  it('produces two digits and covers the range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = matchCode();
      expect(c).toMatch(/^[0-9]{2}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(90);
  });
});
