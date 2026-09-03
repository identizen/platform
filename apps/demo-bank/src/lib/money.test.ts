import { describe, expect, it } from 'vitest';
import { formatUsd, last4, parseUsd } from './money';

describe('money', () => {
  it('formats cents as US dollars', () => {
    expect(formatUsd(123456)).toBe('$1,234.56');
    expect(formatUsd(5)).toBe('$0.05');
  });

  it('parses typed amounts and rejects junk', () => {
    expect(parseUsd('1,234.56')).toBe(123456);
    expect(parseUsd('$ 12')).toBe(1200);
    expect(parseUsd('12.5')).toBe(1250);
    expect(parseUsd('0')).toBeNull();
    expect(parseUsd('-4')).toBeNull();
    expect(parseUsd('12.345')).toBeNull();
    expect(parseUsd('abc')).toBeNull();
  });

  it('masks account numbers', () => {
    expect(last4('000123456789')).toBe('···6789');
  });
});
