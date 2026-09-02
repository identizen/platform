import { BLE_SERVICE_UUID } from '@identizen/protocol';

/** GATT characteristic that exposes the phone's 16-byte rotating identifier. */
export const BLE_ROTATING_ID_CHARACTERISTIC = 'f1d0e1a2-1d2e-4b0c-9c0d-1d3e2f4a5b6d';

export interface BluetoothLike {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Web Bluetooth discovery (Chromium desktop). Prompts the user to pick the nearby phone,
 * reads its rotating identifier, and returns it base64url-encoded for `POST /discover/ble`.
 * Returns null when the user cancels or the device does not expose the characteristic.
 */
export async function readRotatingIdViaBluetooth(bluetooth: BluetoothLike): Promise<string | null> {
  let device: BluetoothDevice;
  try {
    device = await bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID] }] });
  } catch {
    return null;
  }
  try {
    const server = await device.gatt?.connect();
    if (!server) return null;
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(BLE_ROTATING_ID_CHARACTERISTIC);
    const value = await characteristic.readValue();
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.length !== 16) return null;
    return b64url(bytes);
  } catch {
    return null;
  } finally {
    try {
      device.gatt?.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
