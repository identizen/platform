import {
  BLE_WINDOW_SECONDS,
  bleWindow,
  fromHex,
  rotatingBleIdForWindow,
  toHex,
} from '@identizen/protocol';
import {
  setBlePeripheralForTests,
  type BleEvents,
  type BleNativeState,
  type IdzBlePeripheralNative,
} from '../modules/idz-ble-peripheral';
import {
  getBleStatus,
  recentlyReadOverBluetooth,
  rotatingIdHexAt,
  startBleAdvertising,
  stopBleAdvertising,
  windowEndMs,
} from '../src/ble/advertiser';
import { setBleReadHandler, syncBleAdvertising } from '../src/ble/controller';
import { DEFAULT_SETTINGS, writeDevice, writeSettings } from '../src/identity/store';
import { setApiFetch } from '../src/api/client';
import { drainInboxOnce } from '../src/push';

const BLE_KEY_HEX = '0b'.repeat(32);

/** In-memory stand-in for the Swift module: records calls, lets tests fire events. */
function fakeNative(supported = true) {
  const calls: string[] = [];
  const listeners: { [K in keyof BleEvents]: Set<BleEvents[K]> } = {
    onStateChange: new Set(),
    onRead: new Set(),
  };
  let state: BleNativeState = {
    state: 'poweredOn',
    authorization: 'allowedAlways',
    advertising: false,
  };
  const native: IdzBlePeripheralNative & {
    calls: string[];
    fire<E extends keyof BleEvents>(e: E, ...args: Parameters<BleEvents[E]>): void;
  } = {
    calls,
    isSupported: () => supported,
    getState: () => state,
    start: (hex) => {
      calls.push(`start:${hex}`);
      state = { ...state, advertising: true };
      return Promise.resolve();
    },
    update: (hex) => {
      calls.push(`update:${hex}`);
      return Promise.resolve();
    },
    stop: () => {
      calls.push('stop');
      state = { ...state, advertising: false };
      return Promise.resolve();
    },
    addListener: (event, listener) => {
      const set = listeners[event] as Set<typeof listener>;
      set.add(listener);
      return { remove: () => set.delete(listener) };
    },
    fire: (event, ...args) => {
      for (const l of listeners[event]) (l as (...a: unknown[]) => void)(...args);
    },
  };
  return native;
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('rotating id helpers', () => {
  it('matches the protocol computation and the 900 s window edge', () => {
    const nowMs = 1_800_000_123;
    const expected = toHex(
      rotatingBleIdForWindow(fromHex(BLE_KEY_HEX), bleWindow(Math.floor(nowMs / 1000))),
    );
    expect(rotatingIdHexAt(BLE_KEY_HEX, nowMs)).toBe(expected);
    expect(rotatingIdHexAt(BLE_KEY_HEX, nowMs)).toHaveLength(32);
    const end = windowEndMs(nowMs);
    expect(end % (BLE_WINDOW_SECONDS * 1000)).toBe(0);
    expect(end).toBeGreaterThan(nowMs);
    expect(end - nowMs).toBeLessThanOrEqual(BLE_WINDOW_SECONDS * 1000);
  });
});

describe('advertiser', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(new Date('2026-09-02T10:00:00Z'));
  });
  afterEach(() => {
    stopBleAdvertising();
    setBlePeripheralForTests(null);
    jest.useRealTimers();
  });

  it('starts with the current id, swaps exactly at the window boundary, and stops cleanly', async () => {
    const native = fakeNative();
    setBlePeripheralForTests(native);
    const t0 = Date.now();
    const stop = await startBleAdvertising({ bleKeyHex: BLE_KEY_HEX });

    expect(native.calls).toEqual([`start:${rotatingIdHexAt(BLE_KEY_HEX, t0)}`]);
    expect(getBleStatus().enabled).toBe(true);
    expect(getBleStatus().windowEndsAt).toBe(windowEndMs(t0));

    // Just before the boundary nothing changes.
    jest.advanceTimersByTime(windowEndMs(t0) - t0 - 1);
    await flush();
    expect(native.calls).toHaveLength(1);

    // Past the boundary the next window's id is pushed once.
    jest.advanceTimersByTime(200);
    await flush();
    const next = rotatingIdHexAt(BLE_KEY_HEX, windowEndMs(t0) + 1);
    expect(native.calls).toEqual([`start:${rotatingIdHexAt(BLE_KEY_HEX, t0)}`, `update:${next}`]);
    expect(next).not.toBe(rotatingIdHexAt(BLE_KEY_HEX, t0));

    stop();
    expect(native.calls.at(-1)).toBe('stop');
    expect(getBleStatus().enabled).toBe(false);
    jest.advanceTimersByTime(BLE_WINDOW_SECONDS * 2000);
    await flush();
    expect(native.calls.filter((c) => c.startsWith('update:'))).toHaveLength(1);
  });

  it('mirrors radio state and reports reads to the caller', async () => {
    const native = fakeNative();
    setBlePeripheralForTests(native);
    const reads: number[] = [];
    await startBleAdvertising({ bleKeyHex: BLE_KEY_HEX, onCentralRead: (at) => reads.push(at) });

    native.fire('onStateChange', {
      state: 'poweredOff',
      authorization: 'allowedAlways',
      advertising: false,
    });
    expect(getBleStatus().state).toBe('poweredOff');
    expect(getBleStatus().advertising).toBe(false);

    native.fire('onStateChange', {
      state: 'poweredOn',
      authorization: 'allowedAlways',
      advertising: true,
    });
    expect(getBleStatus().advertising).toBe(true);

    expect(recentlyReadOverBluetooth()).toBe(false);
    const at = Date.now();
    native.fire('onRead', { central: 'ABCD', at });
    expect(reads).toEqual([at]);
    expect(getBleStatus().lastReadAt).toBe(at);
    expect(recentlyReadOverBluetooth()).toBe(true);
    expect(recentlyReadOverBluetooth(at + 30_000)).toBe(false);
  });

  it('is a no-op without the native module', async () => {
    setBlePeripheralForTests(null);
    const stop = await startBleAdvertising({ bleKeyHex: BLE_KEY_HEX });
    expect(getBleStatus().supported).toBe(false);
    expect(getBleStatus().state).toBe('unsupported');
    stop();
  });
});

describe('controller', () => {
  afterEach(() => {
    stopBleAdvertising();
    setBlePeripheralForTests(null);
    setBleReadHandler(null);
  });

  const device = {
    devicePrivHex: '11'.repeat(32),
    bleKeyHex: BLE_KEY_HEX,
    deviceId: 'dev_01TEST',
    idz: 'idz_test',
    indexUrl: 'http://index.test',
    indexPubkey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    handle: null,
    pushMode: 'poll' as const,
  };

  it('advertises only when registered and enabled, and forwards reads to the handler', async () => {
    const native = fakeNative();
    setBlePeripheralForTests(native);

    await writeSettings({ ...DEFAULT_SETTINGS, bluetoothEnabled: true });
    await syncBleAdvertising(); // no device yet
    expect(native.calls).toEqual([]);

    await writeDevice(device);
    await syncBleAdvertising();
    expect(native.calls[0]?.startsWith('start:')).toBe(true);

    const reads: number[] = [];
    setBleReadHandler((at) => reads.push(at));
    native.fire('onRead', { central: 'X', at: 42 });
    expect(reads).toEqual([42]);

    await writeSettings({ ...DEFAULT_SETTINGS, bluetoothEnabled: false });
    await syncBleAdvertising();
    expect(native.calls.at(-1)).toBe('stop');
  });

  it('drains the inbox once for poll installs', async () => {
    await writeDevice(device);
    const seen: string[] = [];
    let hits = 0;
    setApiFetch(async (input) => {
      hits++;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      expect(url).toContain('/devices/dev_01TEST/inbox');
      return new Response(JSON.stringify({ challenge_ids: ['ch_A', 'ch_B'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    await drainInboxOnce((id) => seen.push(id));
    expect(seen).toEqual(['ch_A', 'ch_B']);
    expect(hits).toBe(1);

    await writeDevice({ ...device, pushMode: 'apns' });
    await drainInboxOnce((id) => seen.push(id));
    expect(hits).toBe(2); // APNs installs drain too: the index queues every request in the inbox
  });
});
