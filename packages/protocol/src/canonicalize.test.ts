import { describe, expect, it } from 'vitest';
import { canonicalize } from './canonicalize.js';

// Characters are built from code points so the source file stays ASCII-only.
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const EURO = cp(0x20ac);
const SHIFT_IN = cp(0x0f);
const LF = cp(0x0a);
const CR = cp(0x0d);
const CTRL80 = cp(0x80);
const O_DIAERESIS = cp(0xf6);
const GRINNING = cp(0x1f600);
const DALET_DAGESH = cp(0xfb33);
const BS = cp(0x5c); // backslash
const DQ = cp(0x22); // double quote

describe('canonicalize (RFC 8785)', () => {
  it('reproduces the RFC 8785 section 3.2.3 sample (numbers, strings, literals)', () => {
    const str = EURO + '$' + SHIFT_IN + LF + "A'B" + DQ + BS + BS + DQ + '/';
    const input = {
      numbers: [333333333.3333333, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: str,
      literals: [null, true, false],
    };
    const expectedString =
      DQ +
      EURO +
      '$' +
      BS +
      'u000f' +
      BS +
      'n' +
      "A'B" +
      BS +
      DQ +
      BS +
      BS +
      BS +
      BS +
      BS +
      DQ +
      '/' +
      DQ;
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":' +
        expectedString +
        '}',
    );
  });

  it('sorts keys by UTF-16 code units (RFC 8785 section 3.2.3 ordering sample)', () => {
    const input: Record<string, string> = {
      [EURO]: 'Euro Sign',
      [CR]: 'Carriage Return',
      [DALET_DAGESH]: 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      [GRINNING]: 'Emoji: Grinning Face',
      [CTRL80]: 'Control',
      [O_DIAERESIS]: 'Latin Small Letter O With Diaeresis',
    };
    const expected =
      '{' +
      DQ +
      BS +
      'r' +
      DQ +
      ':"Carriage Return",' +
      '"1":"One",' +
      DQ +
      CTRL80 +
      DQ +
      ':"Control",' +
      DQ +
      O_DIAERESIS +
      DQ +
      ':"Latin Small Letter O With Diaeresis",' +
      DQ +
      EURO +
      DQ +
      ':"Euro Sign",' +
      DQ +
      GRINNING +
      DQ +
      ':"Emoji: Grinning Face",' +
      DQ +
      DALET_DAGESH +
      DQ +
      ':"Hebrew Letter Dalet With Dagesh"' +
      '}';
    expect(canonicalize(input)).toBe(expected);
  });

  it('serialises primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize(1.5)).toBe('1.5');
    expect(canonicalize(1e21)).toBe('1e+21');
    expect(canonicalize('a' + DQ + 'b')).toBe(DQ + 'a' + BS + DQ + 'b' + DQ);
  });

  it('omits undefined object properties and nulls undefined array items', () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalize([1, undefined, 2])).toBe('[1,null,2]');
  });

  it('rejects non-finite numbers, bigint, functions, symbols, bytes, top-level undefined', () => {
    expect(() => canonicalize(NaN)).toThrow();
    expect(() => canonicalize(Infinity)).toThrow();
    expect(() => canonicalize(10n)).toThrow();
    expect(() => canonicalize(() => 1)).toThrow();
    expect(() => canonicalize(Symbol('x'))).toThrow();
    expect(() => canonicalize(new Uint8Array(2))).toThrow();
    expect(() => canonicalize(undefined)).toThrow();
  });

  it('is stable across key insertion order and nesting', () => {
    const a = { z: { b: [3, { y: 1, x: 2 }], a: 'x' }, a: 1 };
    const b = { a: 1, z: { a: 'x', b: [3, { x: 2, y: 1 }] } };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"a":1,"z":{"a":"x","b":[3,{"x":2,"y":1}]}}');
  });
});
