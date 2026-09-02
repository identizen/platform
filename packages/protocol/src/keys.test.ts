import { describe, expect, it } from 'vitest';
import { fromHex, toBase64Url } from './encoding.js';
import {
  BIP39_WORDLIST,
  deriveMasterKey,
  deriveSiteKey,
  ed25519Sign,
  ed25519Verify,
  generateKeyPair,
  generateSeed,
  identityId,
  keyPairFromPrivateKey,
  mnemonicToSeed,
  normalizeRpId,
  publicKeyId,
  seedToMnemonic,
  siteSub,
} from './keys.js';

describe('seed and BIP39', () => {
  it('generates a 32-byte seed and round-trips through 24 words', () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(32);
    const words = seedToMnemonic(seed);
    expect(words.split(' ')).toHaveLength(24);
    expect(mnemonicToSeed(words)).toEqual(seed);
  });

  it('normalises whitespace and case on decode', () => {
    const seed = generateSeed();
    const words = seedToMnemonic(seed);
    expect(mnemonicToSeed('  ' + words.toUpperCase().replace(/ /g, '\n  ') + ' ')).toEqual(seed);
  });

  it('rejects wrong-length seeds and bad mnemonics', () => {
    expect(() => seedToMnemonic(new Uint8Array(16))).toThrow();
    expect(() => mnemonicToSeed('abandon abandon abandon')).toThrow();
    // 12 valid words = 128 bits: valid BIP39 but not our 256-bit seed
    expect(() =>
      mnemonicToSeed(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ),
    ).toThrow();
  });

  it('known answer: all-zero entropy', () => {
    const words = seedToMnemonic(new Uint8Array(32));
    expect(words).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
    );
  });

  it('exposes the wordlist', () => {
    expect(BIP39_WORDLIST).toHaveLength(2048);
    expect(BIP39_WORDLIST[0]).toBe('abandon');
  });
});

describe('derivation', () => {
  const seed = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

  it('is deterministic and domain-separated', () => {
    const m1 = deriveMasterKey(seed);
    const m2 = deriveMasterKey(seed);
    expect(m1.publicKey).toEqual(m2.publicKey);
    const s1 = deriveSiteKey(seed, 'app.example.com');
    const s2 = deriveSiteKey(seed, 'other.example.com');
    expect(s1.publicKey).not.toEqual(s2.publicKey);
    expect(s1.publicKey).not.toEqual(m1.publicKey);
    expect(deriveSiteKey(seed, 'APP.example.com.').publicKey).toEqual(s1.publicKey);
  });

  it('identity id and sub are 32-char base64url hashes', () => {
    const idz = identityId(deriveMasterKey(seed).publicKey);
    expect(idz).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const sub = siteSub(deriveSiteKey(seed, 'app.example.com').publicKey);
    expect(sub).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(sub).not.toBe(idz);
    expect(publicKeyId(deriveMasterKey(seed).publicKey)).toBe(idz);
  });

  it('rejects wrong seed and key sizes', () => {
    expect(() => deriveMasterKey(new Uint8Array(16))).toThrow();
    expect(() => keyPairFromPrivateKey(new Uint8Array(31))).toThrow();
  });
});

describe('device keys and raw ed25519', () => {
  it('generates distinct key pairs that sign and verify', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(toBase64Url(a.publicKey)).not.toBe(toBase64Url(b.publicKey));
    const msg = new TextEncoder().encode('hi');
    const sig = ed25519Sign(msg, a.privateKey);
    expect(sig).toHaveLength(64);
    expect(ed25519Verify(sig, msg, a.publicKey)).toBe(true);
    expect(ed25519Verify(sig, msg, b.publicKey)).toBe(false);
    expect(ed25519Verify(new Uint8Array(3), msg, a.publicKey)).toBe(false);
  });
});

describe('normalizeRpId', () => {
  it('strips scheme, path, port, trailing dot; lowercases', () => {
    expect(normalizeRpId('https://App.Example.com:8443/path?x=1')).toBe('app.example.com');
    expect(normalizeRpId('localhost')).toBe('localhost');
    expect(normalizeRpId('example.com.')).toBe('example.com');
  });
  it('rejects garbage', () => {
    expect(() => normalizeRpId('')).toThrow();
    expect(() => normalizeRpId('bad host')).toThrow();
    expect(() => normalizeRpId('https://')).toThrow();
  });
});
