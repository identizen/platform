import { ANDROID_BLE_PERMISSIONS, ensureBlePermissions } from '../src/ble/permissions';

const env = (os: string, version: number | string, answers: Record<string, string> = {}) => {
  const request = jest.fn(() => Promise.resolve(answers));
  return { env: { os, version, request }, request };
};

describe('ensureBlePermissions', () => {
  it('is granted without prompting on iOS and on Android before 12', async () => {
    const ios = env('ios', '18.0');
    expect(await ensureBlePermissions(ios.env)).toBe('granted');
    expect(ios.request).not.toHaveBeenCalled();
    const old = env('android', 30);
    expect(await ensureBlePermissions(old.env)).toBe('granted');
    expect(old.request).not.toHaveBeenCalled();
  });

  it('asks Android 12+ for advertise and connect, and maps the answers', async () => {
    const ok = env('android', 34, {
      'android.permission.BLUETOOTH_ADVERTISE': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    });
    expect(await ensureBlePermissions(ok.env)).toBe('granted');
    expect(ok.request).toHaveBeenCalledWith([...ANDROID_BLE_PERMISSIONS]);

    const denied = env('android', 34, {
      'android.permission.BLUETOOTH_ADVERTISE': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'denied',
    });
    expect(await ensureBlePermissions(denied.env)).toBe('denied');

    const blocked = env('android', 34, {
      'android.permission.BLUETOOTH_ADVERTISE': 'never_ask_again',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    });
    expect(await ensureBlePermissions(blocked.env)).toBe('blocked');

    const thrown = { os: 'android', version: 34, request: () => Promise.reject(new Error('x')) };
    expect(await ensureBlePermissions(thrown)).toBe('denied');
  });
});
