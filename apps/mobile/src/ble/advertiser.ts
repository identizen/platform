/**
 * Nearby sign-in over Bluetooth (PROTOCOL.md §6.3), app side.
 *
 * The phone advertises `rotating_id = HMAC-SHA256(ble_key, floor(now / 900))[0:16]`. This module
 * computes the id with @identizen/protocol, hands it to the native peripheral, swaps it exactly at
 * each 900 s window boundary, and re-syncs when the app returns to the foreground (timers do not
 * fire while suspended). When a computer reads the characteristic we know a login is about to be
 * pushed to us, so `onCentralRead` lets the caller drain the inbox immediately instead of waiting
 * for the next poll.
 */
import {
  BLE_WINDOW_SECONDS,
  bleWindow,
  fromHex,
  rotatingBleIdForWindow,
  toHex,
} from '@identizen/protocol';
import { AppState, type AppStateStatus } from 'react-native';
import { useEffect, useState } from 'react';
import {
  blePeripheral,
  type BleAuthorization,
  type BleRadioState,
} from '../../modules/idz-ble-peripheral';

export interface BleStatus {
  /** False when the Swift module is not linked (Expo Go, simulator, tests). */
  supported: boolean;
  /** Whether the app wants to advertise (setting on + registered). */
  enabled: boolean;
  state: BleRadioState;
  authorization: BleAuthorization;
  advertising: boolean;
  error: string | null;
  /** Last time a computer read the rotating id. */
  lastReadAt: number | null;
  /** Unix ms when the current rotating id expires. */
  windowEndsAt: number | null;
}

export interface AdvertiserOptions {
  /** 32-byte BLE key as hex (DeviceRecord.bleKeyHex). */
  bleKeyHex: string;
  /** A computer nearby read our id; a challenge is likely on its way. */
  onCentralRead?: (at: number) => void;
  /** Clock, injectable for tests. Milliseconds. */
  now?: () => number;
}

type Stop = () => void;

const initial: BleStatus = {
  supported: blePeripheral().isSupported(),
  enabled: false,
  state: blePeripheral().getState().state,
  authorization: blePeripheral().getState().authorization,
  advertising: false,
  error: null,
  lastReadAt: null,
  windowEndsAt: null,
};

let status: BleStatus = initial;
const listeners = new Set<(s: BleStatus) => void>();
let current: Stop | null = null;

function publish(patch: Partial<BleStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getBleStatus(): BleStatus {
  return status;
}

export function subscribeBleStatus(listener: (s: BleStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding for screens. */
export function useBleStatus(): BleStatus {
  const [s, setS] = useState(status);
  useEffect(() => subscribeBleStatus(setS), []);
  return s;
}

/** Hex rotating id for a Unix-ms instant. */
export function rotatingIdHexAt(bleKeyHex: string, nowMs: number): string {
  const key = fromHex(bleKeyHex);
  return toHex(rotatingBleIdForWindow(key, bleWindow(Math.floor(nowMs / 1000))));
}

/** Unix ms at which the window containing `nowMs` ends. */
export function windowEndMs(nowMs: number): number {
  const w = bleWindow(Math.floor(nowMs / 1000));
  return (w + 1) * BLE_WINDOW_SECONDS * 1000;
}

/**
 * Start advertising. Replaces any running advertiser. Returns a stop function; `stopBleAdvertising`
 * does the same for the most recent start.
 */
export async function startBleAdvertising(opts: AdvertiserOptions): Promise<Stop> {
  current?.();
  const native = blePeripheral();
  const now = opts.now ?? Date.now;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentHex = '';

  const apply = async (first: boolean) => {
    if (stopped) return;
    const t = now();
    const hex = rotatingIdHexAt(opts.bleKeyHex, t);
    if (hex !== currentHex) {
      currentHex = hex;
      try {
        if (first) await native.start(hex);
        else await native.update(hex);
        publish({ error: null });
      } catch (err) {
        publish({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    publish({ windowEndsAt: windowEndMs(t) });
    schedule();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    if (stopped) return;
    // Fire just after the boundary so the new window is unambiguous.
    const delay = Math.max(0, windowEndMs(now()) - now()) + 50;
    timer = setTimeout(() => void apply(false), delay);
  };

  const stateSub = native.addListener('onStateChange', (s) => {
    publish({
      state: s.state,
      authorization: s.authorization,
      advertising: s.advertising,
      error: s.error ?? null,
    });
  });
  const readSub = native.addListener('onRead', (e) => {
    publish({ lastReadAt: e.at });
    opts.onCentralRead?.(e.at);
  });
  const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') void apply(false);
  });

  const radio = native.getState();
  publish({
    enabled: true,
    supported: native.isSupported(),
    state: radio.state,
    authorization: radio.authorization,
    advertising: radio.advertising,
    error: radio.error ?? null,
  });
  await apply(true);

  const stop: Stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    stateSub.remove();
    readSub.remove();
    appSub.remove();
    void native.stop();
    if (current === stop) current = null;
    publish({ enabled: false, advertising: false, windowEndsAt: null });
  };
  current = stop;
  return stop;
}

/** Stop the advertiser started by the last `startBleAdvertising`, if any. */
export function stopBleAdvertising(): void {
  current?.();
}

/** Whether a computer read our id within the last `windowMs` (default 20 s). */
export function recentlyReadOverBluetooth(nowMs = Date.now(), windowMs = 20_000): boolean {
  return status.lastReadAt !== null && nowMs - status.lastReadAt <= windowMs;
}
