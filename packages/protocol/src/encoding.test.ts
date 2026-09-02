import { describe, expect, it } from 'vitest';
import {
  bytesEqual,
  concatBytes,
  fromBase64Url,
  fromHex,
  randomBytes,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from './encoding';

describe('base64url', () => {
  it('round-trips all lengths mod 3', () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      const s = toBase64Url(b);
      expect(s).not.toMatch(/[=+/]/);
      expect(fromBase64Url(s)).toEqual(b);
    }
  });

  it('matches known answers', () => {
    expect(toBase64Url(utf8Encode('hello world'))).toBe('aGVsbG8gd29ybGQ');
    expect(utf8Decode(fromBase64Url('aGVsbG8gd29ybGQ'))).toBe('hello world');
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(fromBase64Url('-_8=')).toEqual(new Uint8Array([0xfb, 0xff]));
  });

  it('rejects invalid input', () => {
    expect(() => fromBase64Url('a+b')).toThrow();
    expect(() => fromBase64Url('a')).toThrow();
    expect(() => fromBase64Url('a b')).toThrow();
  });
});

describe('hex', () => {
  it('round-trips', () => {
    const b = new Uint8Array([0, 1, 254, 255]);
    expect(toHex(b)).toBe('0001feff');
    expect(fromHex('0001FEff')).toEqual(b);
  });
  it('rejects odd length and non-hex', () => {
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });
});

describe('bytes helpers', () => {
  it('concat, equality, random', () => {
    expect(concatBytes(new Uint8Array([1]), new Uint8Array([2, 3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
    const r = randomBytes(32);
    expect(r).toHaveLength(32);
    expect(bytesEqual(r, randomBytes(32))).toBe(false);
  });

  it('utf8 decode is strict', () => {
    expect(() => utf8Decode(new Uint8Array([0xff]))).toThrow();
  });
});
