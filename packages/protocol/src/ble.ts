/**
 * Rotating BLE identifiers (PROTOCOL.md section 6.3).
 *
 * rotating_id = HMAC-SHA256(device_ble_key, UTF8(decimal(floor(now / 900))))[0:16]
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesEqual, toBase64Url, utf8Encode } from './encoding';

export const BLE_SERVICE_UUID = 'f1d0e1a2-1d2e-4b0c-9c0d-1d3e2f4a5b6c';
export const BLE_WINDOW_SECONDS = 900;
export const BLE_ID_BYTES = 16;

/** Window index for a Unix-seconds timestamp. */
export function bleWindow(nowSeconds: number): number {
  return Math.floor(nowSeconds / BLE_WINDOW_SECONDS);
}

/** 16-byte rotating identifier for a window. */
export function rotatingBleIdForWindow(bleKey: Uint8Array, window: number): Uint8Array {
  return hmac(sha256, bleKey, utf8Encode(String(window))).slice(0, BLE_ID_BYTES);
}

/** Rotating identifier for a timestamp (Unix seconds). */
export function rotatingBleId(bleKey: Uint8Array, nowSeconds: number): Uint8Array {
  return rotatingBleIdForWindow(bleKey, bleWindow(nowSeconds));
}

/** Same as `rotatingBleId`, base64url-encoded for transport. */
export function rotatingBleIdString(bleKey: Uint8Array, nowSeconds: number): string {
  return toBase64Url(rotatingBleId(bleKey, nowSeconds));
}

/**
 * Does `candidate` match this key within the current window +/- 1?
 * Returns the matching window offset (-1, 0, 1) or null.
 */
export function matchBleId(
  bleKey: Uint8Array,
  candidate: Uint8Array,
  nowSeconds: number,
): -1 | 0 | 1 | null {
  const w = bleWindow(nowSeconds);
  for (const offset of [0, -1, 1] as const) {
    if (bytesEqual(rotatingBleIdForWindow(bleKey, w + offset), candidate)) return offset;
  }
  return null;
}

/**
 * Resolve a rotating ID against many devices' keys. Returns the first match.
 * The index calls this with every active device's `ble_key`.
 */
export function resolveBleId<T extends { bleKey: Uint8Array }>(
  devices: Iterable<T>,
  candidate: Uint8Array,
  nowSeconds: number,
): T | null {
  for (const d of devices) {
    if (matchBleId(d.bleKey, candidate, nowSeconds) !== null) return d;
  }
  return null;
}
