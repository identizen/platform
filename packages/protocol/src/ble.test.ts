import { describe, expect, it } from 'vitest';
import { bytesEqual, fromHex } from './encoding';
import {
  BLE_ID_BYTES,
  BLE_SERVICE_UUID,
  BLE_WINDOW_SECONDS,
  bleWindow,
  matchBleId,
  resolveBleId,
  rotatingBleId,
  rotatingBleIdForWindow,
  rotatingBleIdString,
} from './ble';

const key = fromHex('60'.repeat(32));
const other = fromHex('61'.repeat(32));
const T = 1_756_560_000; // window 1951733, offset 300s into it

describe('rotating BLE id', () => {
  it('is 16 bytes and stable within a window', () => {
    const a = rotatingBleId(key, T);
    expect(a).toHaveLength(BLE_ID_BYTES);
    expect(bytesEqual(a, rotatingBleId(key, T + 500))).toBe(true);
    expect(rotatingBleIdString(key, T)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(BLE_SERVICE_UUID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('differs across adjacent windows and keys', () => {
    const w = bleWindow(T);
    expect(bytesEqual(rotatingBleIdForWindow(key, w), rotatingBleIdForWindow(key, w + 1))).toBe(
      false,
    );
    expect(bytesEqual(rotatingBleIdForWindow(key, w), rotatingBleIdForWindow(key, w - 1))).toBe(
      false,
    );
    expect(bytesEqual(rotatingBleId(key, T), rotatingBleId(other, T))).toBe(false);
    expect(bleWindow(T + BLE_WINDOW_SECONDS)).toBe(w + 1);
  });

  it('resolves within +/-1 window only', () => {
    const w = bleWindow(T);
    expect(matchBleId(key, rotatingBleIdForWindow(key, w), T)).toBe(0);
    expect(matchBleId(key, rotatingBleIdForWindow(key, w - 1), T)).toBe(-1);
    expect(matchBleId(key, rotatingBleIdForWindow(key, w + 1), T)).toBe(1);
    expect(matchBleId(key, rotatingBleIdForWindow(key, w + 2), T)).toBeNull();
    expect(matchBleId(key, rotatingBleIdForWindow(key, w - 2), T)).toBeNull();
    expect(matchBleId(other, rotatingBleIdForWindow(key, w), T)).toBeNull();
  });

  it('resolves across a device list', () => {
    const devices = [
      { id: 'a', bleKey: other },
      { id: 'b', bleKey: key },
    ];
    expect(resolveBleId(devices, rotatingBleId(key, T), T)?.id).toBe('b');
    expect(resolveBleId(devices, rotatingBleId(key, T - 2 * BLE_WINDOW_SECONDS), T)).toBeNull();
    expect(resolveBleId([], rotatingBleId(key, T), T)).toBeNull();
  });
});
