import { describe, expect, it, vi } from 'vitest';
import { BLE_SERVICE_UUID } from '@identizen/protocol';
import { BLE_ROTATING_ID_CHARACTERISTIC, readRotatingIdViaBluetooth } from './ble';

function fakeBluetooth(
  bytes: number[] | null,
  opts: { rejectChooser?: boolean; noGatt?: boolean } = {},
) {
  const characteristic = {
    readValue: vi.fn(async () => new DataView(new Uint8Array(bytes ?? []).buffer)),
  };
  const service = {
    getCharacteristic: vi.fn(async (uuid: string) => {
      if (uuid !== BLE_ROTATING_ID_CHARACTERISTIC) throw new Error('no such characteristic');
      return characteristic;
    }),
  };
  const server = {
    getPrimaryService: vi.fn(async (uuid: string) => {
      if (uuid !== BLE_SERVICE_UUID) throw new Error('no such service');
      return service;
    }),
  };
  const gatt = { connect: vi.fn(async () => server), disconnect: vi.fn() };
  const device = opts.noGatt ? {} : { gatt };
  const bluetooth = {
    requestDevice: vi.fn(async (options: RequestDeviceOptions) => {
      if (opts.rejectChooser) throw new DOMException('User cancelled', 'NotFoundError');
      expect((options as { filters?: { services?: string[] }[] }).filters?.[0]?.services).toEqual([
        BLE_SERVICE_UUID,
      ]);
      return device as unknown as BluetoothDevice;
    }),
  };
  return { bluetooth, gatt };
}

describe('readRotatingIdViaBluetooth', () => {
  it('reads the 16-byte rotating id and disconnects', async () => {
    const { bluetooth, gatt } = fakeBluetooth(Array.from({ length: 16 }, (_, i) => i));
    const id = await readRotatingIdViaBluetooth(bluetooth);
    expect(id).toBe('AAECAwQFBgcICQoLDA0ODw');
    expect(gatt.disconnect).toHaveBeenCalledOnce();
  });

  it('returns null when the user cancels, the device has no GATT, or the value is malformed', async () => {
    expect(
      await readRotatingIdViaBluetooth(fakeBluetooth(null, { rejectChooser: true }).bluetooth),
    ).toBeNull();
    expect(
      await readRotatingIdViaBluetooth(fakeBluetooth([1, 2, 3], { noGatt: true }).bluetooth),
    ).toBeNull();
    expect(await readRotatingIdViaBluetooth(fakeBluetooth([1, 2, 3]).bluetooth)).toBeNull();
  });
});
