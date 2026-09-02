import { describe, expect, it } from 'vitest';
import { fromHex, toBase64Url } from './encoding.js';
import { deriveSiteKey, generateKeyPair, keyPairFromPrivateKey } from './keys.js';
import { challengeId, deviceId, pairingId } from './ids.js';
import {
  createAssertion,
  createChallenge,
  parseIdzSignature,
  pairedSignatureBytes,
  reasonHash,
  signAssertion,
  signChallenge,
  signIdentityProof,
  signPairing,
  signPayload,
  signRequest,
  verifyAssertion,
  verifyChallenge,
  verifyIdentityProof,
  verifyPairing,
  verifyPayload,
  verifyRequestSignature,
} from './sign.js';
import type { Assertion, Challenge, SignedAssertion } from './schemas.js';

const seed = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
const indexKey = keyPairFromPrivateKey(
  fromHex('404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f'),
);
const deviceKey = keyPairFromPrivateKey(
  fromHex('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f'),
);
const NONCE = toBase64Url(fromHex('a'.repeat(64)));
const NOW = 1_756_560_000;
const DEV_ID = deviceId(NOW * 1000);

function makeChallenge(over: Partial<Parameters<typeof createChallenge>[0]> = {}): Challenge {
  return createChallenge({
    id: challengeId(NOW * 1000),
    rp_id: 'app.example.com',
    rp_name: 'Example App',
    nonce: NONCE,
    code: '47',
    iat: NOW,
    index: 'https://index.identizen.com',
    acr: 'idz:login',
    ...over,
  });
}

function makeSigned(challenge: Challenge, over: Partial<Assertion> = {}): SignedAssertion {
  const site = deriveSiteKey(seed, challenge.rp_id);
  const assertion = {
    ...createAssertion({
      challenge,
      sitePublicKey: site.publicKey,
      deviceId: DEV_ID,
      amr: ['face', 'hwk'],
      iat: NOW + 12,
    }),
    ...over,
  };
  return signAssertion(assertion, site.privateKey, deviceKey.privateKey);
}

describe('challenge', () => {
  it('signs and verifies; exp = iat + 60', () => {
    const c = makeChallenge();
    expect(c.exp - c.iat).toBe(60);
    expect(c.reason).toBeNull();
    const signed = signChallenge(c, indexKey.privateKey);
    const r = verifyChallenge(signed, indexKey.publicKey, {
      now: NOW + 5,
      index: 'https://index.identizen.com',
    });
    expect(r).toEqual({ ok: true, value: c });
  });

  it('carries acr and reason', () => {
    const c = makeChallenge({ acr: 'idz:mfa', reason: 'Approve wire of $12,000 to Acme?' });
    expect(c.acr).toBe('idz:mfa');
    expect(c.reason).toBe('Approve wire of $12,000 to Acme?');
    expect(() => makeChallenge({ reason: 'x'.repeat(141) })).toThrow();
  });

  it('rejects tampering, wrong key, expiry, wrong index, malformed', () => {
    const c = makeChallenge();
    const signed = signChallenge(c, indexKey.privateKey);
    for (const key of Object.keys(c) as (keyof Challenge)[]) {
      const tampered = { ...signed, payload: { ...signed.payload } } as {
        payload: Record<string, unknown>;
        sig: string;
      };
      const v = tampered.payload[key];
      tampered.payload[key] =
        typeof v === 'number' ? v + 1 : typeof v === 'string' ? v + 'x' : v === null ? 'r' : v;
      expect(verifyChallenge(tampered, indexKey.publicKey, { now: NOW }).ok).toBe(false);
    }
    expect(verifyChallenge(signed, generateKeyPair().publicKey, { now: NOW })).toEqual({
      ok: false,
      error: 'bad_index_signature',
    });
    expect(verifyChallenge(signed, indexKey.publicKey, { now: NOW + 66 })).toEqual({
      ok: false,
      error: 'expired',
    });
    expect(verifyChallenge(signed, indexKey.publicKey, { now: NOW - 6 })).toEqual({
      ok: false,
      error: 'not_yet_valid',
    });
    expect(
      verifyChallenge(signed, indexKey.publicKey, { now: NOW, index: 'https://evil.example' }),
    ).toEqual({ ok: false, error: 'wrong_index' });
    expect(verifyChallenge({ nope: 1 }, indexKey.publicKey)).toEqual({
      ok: false,
      error: 'malformed_challenge',
    });
    expect(
      verifyChallenge({ ...signed, sig: 'A'.repeat(86) }, indexKey.publicKey, { now: NOW }).ok,
    ).toBe(false);
  });

  it('uses the wall clock by default', () => {
    const c = makeChallenge({ iat: Math.floor(Date.now() / 1000) });
    const signed = signChallenge(c, indexKey.privateKey);
    expect(verifyChallenge(signed, indexKey.publicKey).ok).toBe(true);
  });
});

describe('assertion', () => {
  it('sign -> verify (login, no reason)', () => {
    const c = makeChallenge();
    const signed = makeSigned(c);
    expect(signed.payload.reason_hash).toBeNull();
    expect(signed.payload.acr).toBe('idz:login');
    const r = verifyAssertion(signed, c, deviceKey.publicKey, { now: NOW + 20 });
    expect(r.ok).toBe(true);
  });

  it('sign -> verify (mfa with reason) and binds the reason hash', () => {
    const c = makeChallenge({
      acr: 'idz:mfa',
      reason: 'Approve wire transfer of $12,000 to Acme?',
    });
    const signed = makeSigned(c);
    expect(signed.payload.reason_hash).toBe(reasonHash(c.reason));
    expect(signed.payload.acr).toBe('idz:mfa');
    expect(verifyAssertion(signed, c, deviceKey.publicKey, { now: NOW + 20 }).ok).toBe(true);
    // Reason tamper on the challenge side -> verify fails.
    const tamperedChallenge = { ...c, reason: 'Approve wire transfer of $12,000 to Mallory?' };
    expect(
      verifyAssertion(signed, tamperedChallenge, deviceKey.publicKey, { now: NOW + 20 }),
    ).toEqual({
      ok: false,
      error: 'reason_mismatch',
    });
  });

  it('fails on tampering with any field', () => {
    const c = makeChallenge();
    const signed = makeSigned(c);
    for (const key of Object.keys(signed.payload) as (keyof Assertion)[]) {
      const tampered = { ...signed, payload: { ...signed.payload } } as {
        payload: Record<string, unknown>;
      };
      const v = tampered.payload[key];
      tampered.payload[key] =
        typeof v === 'number'
          ? v + 1
          : typeof v === 'string'
            ? key === 'acr'
              ? 'idz:mfa'
              : key === 'type'
                ? 'challenge'
                : v.slice(0, -1) + (v.endsWith('A') ? 'B' : 'A')
            : Array.isArray(v)
              ? ['pin', 'hwk']
              : 'A'.repeat(43);
      const r = verifyAssertion(tampered, c, deviceKey.publicKey, { now: NOW + 20 });
      expect(r.ok, `tampering ${key} should fail`).toBe(false);
    }
  });

  it('fails on wrong rp_id, wrong device key, wrong site key, expiry, timing', () => {
    const c = makeChallenge();
    const signed = makeSigned(c);
    const other = { ...c, rp_id: 'evil.example.com' };
    expect(verifyAssertion(signed, other, deviceKey.publicKey, { now: NOW + 20 })).toEqual({
      ok: false,
      error: 'rp_id_mismatch',
    });
    expect(verifyAssertion(signed, c, generateKeyPair().publicKey, { now: NOW + 20 })).toEqual({
      ok: false,
      error: 'bad_device_signature',
    });
    // Signed by a different site key than the pubkey claims.
    const wrongSite = deriveSiteKey(seed, 'other.example.com');
    const forged = signAssertion(signed.payload, wrongSite.privateKey, deviceKey.privateKey);
    expect(verifyAssertion(forged, c, deviceKey.publicKey, { now: NOW + 20 })).toEqual({
      ok: false,
      error: 'bad_site_signature',
    });
    expect(verifyAssertion(signed, c, deviceKey.publicKey, { now: NOW + 70 })).toEqual({
      ok: false,
      error: 'expired',
    });
    expect(
      verifyAssertion(makeSigned(c, { iat: NOW - 10 }), c, deviceKey.publicKey, { now: NOW }),
    ).toEqual({
      ok: false,
      error: 'iat_too_early',
    });
    expect(
      verifyAssertion(makeSigned(c, { iat: NOW + 70 }), c, deviceKey.publicKey, { now: NOW }),
    ).toEqual({
      ok: false,
      error: 'iat_too_late',
    });
    expect(verifyAssertion({ junk: true }, c, deviceKey.publicKey)).toEqual({
      ok: false,
      error: 'malformed_assertion',
    });
    const mfaChallenge = { ...c, acr: 'idz:mfa' as const };
    expect(verifyAssertion(signed, mfaChallenge, deviceKey.publicKey, { now: NOW + 20 })).toEqual({
      ok: false,
      error: 'acr_mismatch',
    });
    const nonceChallenge = { ...c, nonce: toBase64Url(fromHex('b'.repeat(64))) };
    expect(verifyAssertion(signed, nonceChallenge, deviceKey.publicKey, { now: NOW + 20 })).toEqual(
      {
        ok: false,
        error: 'nonce_mismatch',
      },
    );
    const idChallenge = makeChallenge({ id: challengeId(NOW * 1000 + 1) });
    expect(verifyAssertion(signed, idChallenge, deviceKey.publicKey, { now: NOW + 20 })).toEqual({
      ok: false,
      error: 'challenge_mismatch',
    });
  });

  it('detects sub / site_pubkey inconsistency', () => {
    const c = makeChallenge();
    const site = deriveSiteKey(seed, c.rp_id);
    const otherSite = deriveSiteKey(seed, 'other.example.com');
    const a = createAssertion({
      challenge: c,
      sitePublicKey: site.publicKey,
      deviceId: DEV_ID,
      amr: ['face', 'hwk'],
      iat: NOW + 1,
    });
    const swapped = { ...a, site_pubkey: toBase64Url(otherSite.publicKey) };
    const signed = signAssertion(swapped, otherSite.privateKey, deviceKey.privateKey);
    expect(verifyAssertion(signed, c, deviceKey.publicKey, { now: NOW + 5 })).toEqual({
      ok: false,
      error: 'sub_mismatch',
    });
  });

  it('createAssertion defaults iat to now', () => {
    const c = makeChallenge({ iat: Math.floor(Date.now() / 1000) });
    const site = deriveSiteKey(seed, c.rp_id);
    const a = createAssertion({
      challenge: c,
      sitePublicKey: site.publicKey,
      deviceId: DEV_ID,
      amr: ['face', 'hwk'],
    });
    expect(Math.abs(a.iat - Date.now() / 1000)).toBeLessThan(5);
    const signed = signAssertion(a, site.privateKey, deviceKey.privateKey);
    expect(verifyAssertion(signed, c, deviceKey.publicKey).ok).toBe(true);
  });
});

describe('pairing', () => {
  it('signs and verifies a pairing record', () => {
    const p = {
      type: 'pairing' as const,
      pairing_id: pairingId(NOW * 1000),
      device_id: DEV_ID,
      browser_pubkey: toBase64Url(new Uint8Array(65).fill(4)),
      issued_at: NOW,
    };
    const signed = signPairing(p, indexKey.privateKey);
    expect(verifyPairing(signed, indexKey.publicKey)).toEqual({ ok: true, value: p });
    expect(verifyPairing(signed, generateKeyPair().publicKey)).toEqual({
      ok: false,
      error: 'bad_index_signature',
    });
    expect(verifyPairing({}, indexKey.publicKey)).toEqual({
      ok: false,
      error: 'malformed_pairing',
    });
    expect(new TextDecoder().decode(pairedSignatureBytes('ch_X'))).toBe(
      'identizen/v1/paired\nch_X',
    );
  });
});

describe('Idz-Signature', () => {
  const input = { method: 'post', path: '/me/devices?x=1', body: '{"a":1}', timestamp: NOW };

  it('signs, parses and verifies', () => {
    const header = signRequest(input, DEV_ID, deviceKey.privateKey);
    expect(header.startsWith(`v1,d=${DEV_ID},t=${NOW},s=`)).toBe(true);
    const parsed = parseIdzSignature(header);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(verifyRequestSignature(parsed, input, deviceKey.publicKey, { now: NOW + 3 }).ok).toBe(
      true,
    );
    expect(verifyRequestSignature(parsed, input, deviceKey.publicKey, { now: NOW + 61 })).toEqual({
      ok: false,
      error: 'stale_timestamp',
    });
    expect(
      verifyRequestSignature(parsed, { ...input, body: '{"a":2}' }, deviceKey.publicKey, {
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: 'bad_signature',
    });
    expect(
      verifyRequestSignature(parsed, { ...input, timestamp: NOW + 1 }, deviceKey.publicKey, {
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: 'timestamp_mismatch',
    });
    expect(
      verifyRequestSignature(parsed, input, generateKeyPair().publicKey, { now: NOW }),
    ).toEqual({
      ok: false,
      error: 'bad_signature',
    });
    expect(
      verifyRequestSignature({ ...parsed, sig: '***' }, input, deviceKey.publicKey, { now: NOW }),
    ).toEqual({
      ok: false,
      error: 'malformed_signature',
    });
    // Body as bytes is equivalent to body as string.
    const bytesInput = { ...input, body: new TextEncoder().encode(input.body) };
    expect(verifyRequestSignature(parsed, bytesInput, deviceKey.publicKey, { now: NOW }).ok).toBe(
      true,
    );
  });

  it('verifies with the wall clock by default', () => {
    const t = Math.floor(Date.now() / 1000);
    const header = signRequest({ ...input, timestamp: t }, DEV_ID, deviceKey.privateKey);
    const parsed = parseIdzSignature(header);
    expect(
      parsed && verifyRequestSignature(parsed, { ...input, timestamp: t }, deviceKey.publicKey).ok,
    ).toBe(true);
  });

  it('rejects malformed headers', () => {
    expect(parseIdzSignature(null)).toBeNull();
    expect(parseIdzSignature('')).toBeNull();
    expect(parseIdzSignature('v2,d=a,t=1,s=x')).toBeNull();
    expect(parseIdzSignature('v1,d=a,t=1')).toBeNull();
    expect(parseIdzSignature('v1,d=a,t=abc,s=x')).toBeNull();
    expect(parseIdzSignature('v1,d=a,=1,s=x')).toBeNull();
    expect(parseIdzSignature('v1,d=a,t=1,s=')).toBeNull();
  });
});

describe('identity proof and generic helpers', () => {
  it('master key proves possession over the device id', () => {
    const master = keyPairFromPrivateKey(fromHex('60'.repeat(32)));
    const pub = toBase64Url(deviceKey.publicKey);
    const sig = signIdentityProof(pub, master.privateKey);
    expect(verifyIdentityProof(pub, sig, master.publicKey)).toBe(true);
    expect(verifyIdentityProof('A'.repeat(43), sig, master.publicKey)).toBe(false);
  });

  it('generic verify never throws', () => {
    const sig = signPayload('request', { a: 1 }, deviceKey.privateKey);
    expect(verifyPayload('request', { a: 1 }, sig, deviceKey.publicKey)).toBe(true);
    expect(verifyPayload('assertion', { a: 1 }, sig, deviceKey.publicKey)).toBe(false);
    expect(verifyPayload('request', { a: 1 }, '!!!', deviceKey.publicKey)).toBe(false);
    expect(verifyPayload('request', { a: NaN }, sig, deviceKey.publicKey)).toBe(false);
  });

  it('reasonHash', () => {
    expect(reasonHash(null)).toBeNull();
    expect(reasonHash(undefined)).toBeNull();
    expect(reasonHash('x')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
