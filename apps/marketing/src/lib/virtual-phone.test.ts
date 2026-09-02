import { describe, expect, it } from 'vitest';
import {
  createChallenge,
  fromBase64Url,
  generateKeyPair,
  parseIdzSignature,
  signChallenge,
  toBase64Url,
  verifyAssertion,
  verifyIdentityProof,
  verifyRequestSignature,
  type DeviceRegistration,
  type SignedAssertion,
} from '@identizen/protocol';
import { VirtualPhone, challengeIdFrom, memoryStore, webStore } from './virtual-phone';

const INDEX = 'https://index.example';
const NOW = 1_800_000_000;
const CH_A = 'ch_01J9Z2K4M7N8P1Q3R5S7T9V1WX';
const CH_B = 'ch_01J9Z2K4M7N8P1Q3R5S7T9V1WY';

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

/** A scripted index: registers one device, serves signed challenges, records what it received. */
function scriptedIndex() {
  const indexKey = generateKeyPair();
  const calls: Call[] = [];
  const inbox: string[] = [];
  const assertions = new Map<string, SignedAssertion>();
  const denied = new Set<string>();
  let registration: DeviceRegistration | null = null;
  const devicePubkeys = new Map<string, Uint8Array>();
  const statuses = new Map<string, string>([
    [CH_A, 'pending'],
    [CH_B, 'pending'],
  ]);

  const challenge = (id: string) =>
    signChallenge(
      createChallenge({
        id,
        rp_id: 'acme.example',
        rp_name: 'Acme',
        nonce: toBase64Url(new Uint8Array(32).fill(7)),
        code: '47',
        iat: NOW - 5,
        index: INDEX,
        acr: 'idz:login',
      }),
      indexKey.privateKey,
    );

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    const body = typeof init?.body === 'string' ? init.body : null;
    calls.push({ method, path: url.pathname, headers, body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (method === 'POST' && url.pathname === '/devices') {
      registration = JSON.parse(body ?? '{}') as DeviceRegistration;
      devicePubkeys.set(
        'dev_01J9Z2K4M7N8P1Q3R5S7T9V1WZ',
        fromBase64Url(registration.device_pubkey),
      );
      return json(201, {
        device_id: 'dev_01J9Z2K4M7N8P1Q3R5S7T9V1WZ',
        idz: 'idz_test',
        index_pubkey: toBase64Url(indexKey.publicKey),
        handle: null,
      });
    }
    // Everything below needs a valid Idz-Signature except the public challenge fetch.
    const m = /^\/challenge\/(ch_[0-9A-Z]{26})(?:\/(assert|deny))?$/.exec(url.pathname);
    if (m && method === 'GET' && !m[2]) {
      const id = m[1] ?? '';
      const s = statuses.get(id);
      if (!s) return json(404, { error: 'not_found' });
      return json(200, { ...challenge(id), status: s });
    }
    const parsed = parseIdzSignature(headers['idz-signature']);
    if (!parsed) return json(401, { error: 'unauthenticated' });
    const pub = devicePubkeys.get(parsed.device_id);
    if (!pub) return json(401, { error: 'unknown_device' });
    const verified = verifyRequestSignature(
      parsed,
      { method, path: url.pathname + url.search, body: body ?? '', timestamp: parsed.timestamp },
      pub,
      { now: NOW },
    );
    if (!verified.ok) return json(401, { error: verified.error });

    if (m && method === 'POST' && m[2] === 'assert') {
      const id = m[1] ?? '';
      const signed = JSON.parse(body ?? '{}') as SignedAssertion;
      const ok = verifyAssertion(signed, challenge(id).payload, pub, { now: NOW });
      if (!ok.ok) return json(400, { error: ok.error });
      assertions.set(id, signed);
      statuses.set(id, 'approved');
      return json(200, { status: 'approved', sub: ok.value.sub });
    }
    if (m && method === 'POST' && m[2] === 'deny') {
      denied.add(m[1] ?? '');
      statuses.set(m[1] ?? '', 'denied');
      return json(200, { status: 'denied' });
    }
    if (method === 'GET' && /^\/devices\/dev_[0-9A-Z]{26}\/inbox$/.test(url.pathname)) {
      return json(200, { challenge_ids: inbox.splice(0) });
    }
    return json(404, { error: 'not_found' });
  };

  return {
    fetchImpl,
    calls,
    inbox,
    assertions,
    denied,
    indexKey,
    get registration() {
      return registration;
    },
  };
}

describe('VirtualPhone', () => {
  it('registers with a master-signed device key and polls instead of receiving pushes', async () => {
    const index = scriptedIndex();
    const store = memoryStore();
    const phone = new VirtualPhone({
      indexUrl: INDEX,
      fetchImpl: index.fetchImpl,
      store,
      now: () => NOW,
    });
    expect(phone.registered).toBe(false);
    const state = await phone.register();
    expect(state.deviceId).toBe('dev_01J9Z2K4M7N8P1Q3R5S7T9V1WZ');
    expect(store.get()?.indexPubkey).toBe(toBase64Url(index.indexKey.publicKey));
    const reg = index.registration;
    expect(reg).not.toBeNull();
    if (!reg) return;
    expect(reg.push_token).toBe('poll');
    expect(reg.push_platform).toBe('web');
    expect(
      verifyIdentityProof(reg.device_pubkey, reg.master_sig, fromBase64Url(reg.master_pubkey)),
    ).toBe(true);
    // Registering again is a no-op.
    await phone.register();
    expect(index.calls.filter((c) => c.path === '/devices')).toHaveLength(1);
  });

  it('scans a QR deep link, verifies the challenge, and submits a valid assertion', async () => {
    const index = scriptedIndex();
    const phone = new VirtualPhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl, now: () => NOW });
    const pending = await phone.scan(`https://app.identizen.com/l/${CH_A}`);
    expect(pending.challenge.rp_name).toBe('Acme');
    expect(pending.challenge.code).toBe('47');
    expect(pending.via).toBe('scan');
    expect(phone.registered).toBe(true);

    const result = await phone.approve(CH_A);
    expect(result.ok).toBe(true);
    const signed = index.assertions.get(CH_A);
    expect(signed?.payload.challenge_id).toBe(CH_A);
    expect(signed?.payload.amr).toEqual(['face', 'hwk']);
    expect(signed?.payload.sub).toBe(result.sub);
    expect(phone.pending.size).toBe(0);
    // A second site gets a different sub (per-site key).
    const assertCall = index.calls.find((c) => c.path.endsWith('/assert'));
    expect(assertCall?.headers['idz-signature']).toMatch(/^v1,d=dev_/);
  });

  it('receives queued challenges from the inbox once and can deny them', async () => {
    const index = scriptedIndex();
    const phone = new VirtualPhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl, now: () => NOW });
    expect(await phone.pollInbox()).toEqual([]); // not registered: nothing to poll
    await phone.register();
    index.inbox.push(CH_B);
    const fresh = await phone.pollInbox();
    expect(fresh.map((p) => p.challenge.id)).toEqual([CH_B]);
    expect(fresh[0]?.via).toBe('push');
    index.inbox.push(CH_B);
    expect(await phone.pollInbox()).toEqual([]); // already pending: not re-reported
    expect(await phone.deny(CH_B)).toBe(true);
    expect(index.denied.has(CH_B)).toBe(true);
  });

  it('rejects a challenge signed by a different index', async () => {
    const index = scriptedIndex();
    const rogue = generateKeyPair();
    const store = memoryStore({
      seedHex: '11'.repeat(32),
      devicePrivHex: '22'.repeat(32),
      deviceId: 'dev_01J9Z2K4M7N8P1Q3R5S7T9V1WZ',
      idz: 'idz_test',
      indexPubkey: toBase64Url(rogue.publicKey),
    });
    const phone = new VirtualPhone({
      indexUrl: INDEX,
      fetchImpl: index.fetchImpl,
      store,
      now: () => NOW,
    });
    await expect(phone.scan(CH_A)).rejects.toThrow(/bad_index_signature/);
  });

  it('persists to web storage and reset forgets everything', async () => {
    const index = scriptedIndex();
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    } as unknown as Storage;
    const phone = new VirtualPhone({
      indexUrl: INDEX,
      fetchImpl: index.fetchImpl,
      store: webStore(storage),
    });
    await phone.register();
    expect(backing.size).toBe(1);
    const again = new VirtualPhone({
      indexUrl: INDEX,
      fetchImpl: index.fetchImpl,
      store: webStore(storage),
    });
    expect(again.deviceId).toBe(phone.deviceId);
    again.reset();
    expect(again.registered).toBe(false);
    expect(backing.size).toBe(0);
  });

  it('extracts challenge ids from links and bare ids', () => {
    expect(challengeIdFrom(`https://app.identizen.com/l/${CH_A}?x=1`)).toBe(CH_A);
    expect(challengeIdFrom(CH_A)).toBe(CH_A);
    expect(challengeIdFrom('nope')).toBeNull();
  });
});
