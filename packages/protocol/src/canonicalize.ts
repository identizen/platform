/**
 * JSON Canonicalization Scheme (JCS), RFC 8785.
 *
 * - Object keys sorted by UTF-16 code units.
 * - No insignificant whitespace.
 * - Numbers serialised per ECMAScript Number::toString (ES6 shortest round-trip form).
 * - Strings escaped per RFC 8785 section 3.2.2.2 (which matches JSON.stringify).
 * - `undefined` properties are omitted; `undefined` array elements become `null`.
 * - NaN / Infinity / BigInt / functions / symbols are rejected.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export function canonicalize(value: unknown): string {
  return serialize(value, true);
}

function serialize(value: unknown, topLevel: boolean): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('JCS: non-finite number');
      // -0 serialises as 0 per ES Number::toString.
      return Object.is(value, -0) ? '0' : String(value);
    case 'string':
      return JSON.stringify(value);
    case 'undefined':
      if (topLevel) throw new TypeError('JCS: undefined is not serialisable');
      return 'null';
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new TypeError(`JCS: unsupported type ${typeof value}`);
    case 'object':
      break;
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v: unknown) => serialize(v, false)).join(',') + ']';
  }
  if (value instanceof Uint8Array) {
    throw new TypeError('JCS: encode bytes as base64url strings before canonicalizing');
  }
  const obj = value as Record<string, unknown>;
  // Sort by UTF-16 code units: the default JS string comparison.
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(JSON.stringify(k) + ':' + serialize(obj[k], false));
  }
  return '{' + parts.join(',') + '}';
}
