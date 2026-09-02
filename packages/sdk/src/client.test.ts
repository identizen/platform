import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identizen } from './client.js';
import { memoryStorage } from './storage.js';
import type { StoredPairing } from './types.js';

const INDEX = 'http://index.test';
const CHALLENGE = {
  challenge_id: 'ch_01K3ZB2N9G0000000000000000',
  code: '47',
  exp: Math.floor(Date.now() / 1000) + 60,
  acr: 'idz:login',
  rp_name: 'Example',
  deep_link: 'http://app.test/l/ch_01K3ZB2N9G0000000000000000',
  ws_url: 'ws://index.test/challenge/ch_01K3ZB2N9G0000000000000000/ws',
  pushed: false,
};

/** Scripted index: records requests, answers /challenge, /discover/*, /challenge/:id/state. */
function fakeIndex(
  over: { paired?: number; ble?: number; state?: () => unknown; pushed?: boolean } = {},
) {
  const calls: { path: string; body: unknown }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path: url.pathname, body });
    if (url.pathname === '/challenge')
      return Response.json({ ...CHALLENGE, pushed: over.pushed ?? false }, { status: 201 });
    if (url.pathname === '/discover/paired')
      return Response.json({}, { status: over.paired ?? 202 });
    if (url.pathname === '/discover/ble') return Response.json({}, { status: over.ble ?? 202 });
    if (url.pathname.endsWith('/state'))
      return Response.json(over.state?.() ?? { status: 'pending' });
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  return { fetchImpl, calls };
}

/** Minimal WebSocket double: captures the instance so tests can emit events. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((m: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

async function browserKey(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
}

const PAIRING: StoredPairing = {
  pairing_id: 'pr_01K3ZB2N9G0000000000000002',
  device_id: 'dev_01K3ZB2N9G0000000000000001',
  issued_at: 1,
};

function makeClient(
  index: ReturnType<typeof fakeIndex>,
  opts: {
    storage?: ReturnType<typeof memoryStorage>;
    bluetooth?: unknown;
    userAgent?: string;
    pairing?: boolean;
  } = {},
) {
  return new Identizen({
    indexUrl: INDEX,
    clientId: 'idz_test_x',
    ...(opts.pairing !== undefined && { pairing: opts.pairing }),
    transports: {
      fetch: index.fetchImpl,
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
      bluetooth: (opts.bluetooth as Bluetooth | undefined) ?? null,
      storage: opts.storage ?? memoryStorage(),
      userAgent: opts.userAgent ?? 'Mozilla/5.0 (Macintosh) Chrome/120',
      crypto,
    },
  });
}

async function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Identizen.startLogin discovery order', () => {
  it('QR when nothing else is available; registers a browser key for pairing; stores the pairing on approval', async () => {
    const index = fakeIndex();
    const storage = memoryStorage();
    const client = makeClient(index, { storage });
    const session = client.startLogin({ redirectUri: 'https://site.test/cb', state: 's' });
    const states: string[] = [];
    session.subscribe((s) => states.push(s.status));
    await waitFor(() => session.state.status === 'waiting');
    expect(session.state.method).toBe('qr');
    expect(session.state.code).toBe('47');
    expect(session.state.qrSvg).toContain('<svg');
    expect(session.state.useDeepLink).toBe(false);
    const start = index.calls.find((c) => c.path === '/challenge')?.body as Record<string, unknown>;
    expect(typeof start.browser_pubkey).toBe('string');
    expect(start.redirect_uri).toBe('https://site.test/cb');
    expect(index.calls.some((c) => c.path === '/discover/paired')).toBe(false);
    expect(index.calls.some((c) => c.path === '/discover/ble')).toBe(false);

    const ws = FakeWebSocket.instances[0];
    expect(ws?.url).toBe(CHALLENGE.ws_url);
    ws?.emit({
      type: 'approved',
      challenge_id: CHALLENGE.challenge_id,
      pairing: { payload: PAIRING },
      redirect: 'https://site.test/cb?code=x&state=s',
    });
    const final = await session.done;
    expect(final.status).toBe('approved');
    expect(final.redirect).toBe('https://site.test/cb?code=x&state=s');
    expect(storage.pairing).toEqual(PAIRING);
    expect(states).toEqual(['starting', 'discovering', 'waiting', 'approved']);
    expect(ws?.closed).toBe(true);
  });

  it('paired first: signs the challenge id with the browser key and skips BLE and QR', async () => {
    const index = fakeIndex();
    const storage = memoryStorage({ key: await browserKey(), pairing: PAIRING });
    const bluetooth = { requestDevice: vi.fn() };
    const client = makeClient(index, { storage, bluetooth });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    expect(session.state.method).toBe('paired');
    const paired = index.calls.find((c) => c.path === '/discover/paired')?.body as Record<
      string,
      string
    >;
    expect(paired.pairing_id).toBe(PAIRING.pairing_id);
    expect(paired.sig).toMatch(/^[A-Za-z0-9_-]{80,100}$/);
    expect(bluetooth.requestDevice).not.toHaveBeenCalled();
    // No new browser key was offered (already paired).
    const start = index.calls.find((c) => c.path === '/challenge')?.body as Record<string, unknown>;
    expect(start.browser_pubkey).toBeUndefined();
    session.cancel();
    expect((await session.done).status).toBe('cancelled');
  });

  it('a revoked pairing (401) is forgotten and discovery falls through to QR with Bluetooth offered, never auto-run', async () => {
    const index = fakeIndex({ paired: 401, ble: 404 });
    const storage = memoryStorage({ key: await browserKey(), pairing: PAIRING });
    const characteristic = {
      readValue: vi.fn(async () => new DataView(new Uint8Array(16).fill(7).buffer)),
    };
    const gatt = {
      connect: vi.fn(async () => ({
        getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
      })),
      disconnect: vi.fn(),
    };
    const bluetooth = { requestDevice: vi.fn(async () => ({ gatt })) };
    const client = makeClient(index, { storage, bluetooth });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    expect(storage.pairing).toBeNull();
    expect(bluetooth.requestDevice).not.toHaveBeenCalled();
    expect(index.calls.map((c) => c.path)).toEqual(['/challenge', '/discover/paired']);
    expect(session.state.method).toBe('qr');
    expect(session.state.bluetoothAvailable).toBe(true);
    // Explicit action: the phone is found but the index does not know its id -> stays on QR.
    expect(await session.useBluetooth()).toBe(false);
    expect(bluetooth.requestDevice).toHaveBeenCalledOnce();
    expect(index.calls.at(-1)?.path).toBe('/discover/ble');
    expect(session.state.method).toBe('qr');
    session.cancel();
  });

  it('BLE when available and unpaired', async () => {
    const index = fakeIndex();
    const characteristic = {
      readValue: vi.fn(async () => new DataView(new Uint8Array(16).fill(9).buffer)),
    };
    const gatt = {
      connect: vi.fn(async () => ({
        getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
      })),
      disconnect: vi.fn(),
    };
    const bluetooth = { requestDevice: vi.fn(async () => ({ gatt })) };
    const client = makeClient(index, { bluetooth });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    // QR first; Bluetooth only on request (it needs a user gesture and opens a chooser).
    expect(session.state.method).toBe('qr');
    expect(session.state.bluetoothAvailable).toBe(true);
    expect(bluetooth.requestDevice).not.toHaveBeenCalled();
    expect(await session.useBluetooth()).toBe(true);
    expect(session.state.method).toBe('bluetooth');
    const ble = index.calls.find((c) => c.path === '/discover/ble')?.body as Record<string, string>;
    expect(ble.rotating_id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(gatt.disconnect).toHaveBeenCalled();
    session.cancel();
    expect(await session.useBluetooth()).toBe(false);
  });

  it('user cancels the Bluetooth chooser -> QR', async () => {
    const index = fakeIndex();
    const bluetooth = {
      requestDevice: vi.fn(async () => Promise.reject(new Error('NotFoundError'))),
    };
    const client = makeClient(index, { bluetooth });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    expect(session.state.method).toBe('qr');
    expect(await session.useBluetooth()).toBe(false);
    expect(session.state.method).toBe('qr');
    session.cancel();
  });

  it('mobile user agents use the deep link and skip Bluetooth', async () => {
    const index = fakeIndex();
    const bluetooth = { requestDevice: vi.fn() };
    const client = makeClient(index, {
      bluetooth,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
    });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    expect(session.state.useDeepLink).toBe(true);
    expect(session.state.method).toBe('deeplink');
    expect(session.state.deepLink).toBe(CHALLENGE.deep_link);
    expect(bluetooth.requestDevice).not.toHaveBeenCalled();
    session.cancel();
  });

  it('pairing: false never offers a browser key and never stores a pairing', async () => {
    const index = fakeIndex();
    const storage = memoryStorage();
    const client = makeClient(index, { storage, pairing: false });
    const session = client.startLogin();
    await waitFor(() => session.state.status === 'waiting');
    const start = index.calls.find((c) => c.path === '/challenge')?.body as Record<string, unknown>;
    expect(start.browser_pubkey).toBeUndefined();
    FakeWebSocket.instances[0]?.emit({
      type: 'approved',
      challenge_id: CHALLENGE.challenge_id,
      pairing: { payload: PAIRING },
      redirect: null,
    });
    await session.done;
    expect(storage.pairing).toBeNull();
  });

  it('step-up (loginHint) is pushed by the index: method push, no discovery', async () => {
    const index = fakeIndex({ pushed: true });
    const storage = memoryStorage({ key: await browserKey(), pairing: PAIRING });
    const client = makeClient(index, { storage });
    const session = client.stepUp('S'.repeat(32), { reason: 'Pay $5' });
    await waitFor(() => session.state.status === 'waiting');
    expect(session.state.method).toBe('push');
    const start = index.calls.find((c) => c.path === '/challenge')?.body as Record<string, unknown>;
    expect(start).toMatchObject({ acr: 'idz:mfa', login_hint: 'S'.repeat(32), reason: 'Pay $5' });
    expect(index.calls.some((c) => c.path === '/discover/paired')).toBe(false);
    session.cancel();
  });

  it('denied and expired events resolve the session; polling fallback works without WebSocket', async () => {
    const index = fakeIndex();
    const c1 = makeClient(index);
    const s1 = c1.startLogin();
    await waitFor(() => FakeWebSocket.instances.length === 1);
    FakeWebSocket.instances[0]?.emit({ type: 'denied', challenge_id: CHALLENGE.challenge_id });
    expect((await s1.done).status).toBe('denied');

    let polls = 0;
    const index2 = fakeIndex({
      state: () =>
        ++polls >= 2
          ? { status: 'approved', redirect: 'https://site.test/cb?code=y' }
          : { status: 'pending' },
    });
    const c2 = new Identizen({
      indexUrl: INDEX,
      clientId: 'idz_test_x',
      transports: {
        fetch: index2.fetchImpl,
        WebSocket: null,
        bluetooth: null,
        storage: memoryStorage(),
        userAgent: 'x',
        crypto,
      },
    });
    const s2 = c2.startLogin();
    const final = await s2.done;
    expect(final.status).toBe('approved');
    expect(final.redirect).toBe('https://site.test/cb?code=y');
    expect(polls).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it('index errors surface as IdentizenError with the index code', async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        { error: 'unknown_client', error_description: 'no such site' },
        { status: 404 },
      );
    const client = new Identizen({
      indexUrl: INDEX,
      clientId: 'idz_test_x',
      transports: {
        fetch: fetchImpl,
        WebSocket: null,
        bluetooth: null,
        storage: memoryStorage(),
        userAgent: 'x',
        crypto,
      },
    });
    const final = await client.startLogin().done;
    expect(final.status).toBe('error');
    expect(final.error).toEqual({ code: 'unknown_client', message: 'no such site' });
    expect(() => new Identizen({ indexUrl: '', clientId: 'x' })).toThrow(/indexUrl/);
  });
});
