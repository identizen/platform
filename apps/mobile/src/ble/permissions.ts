/**
 * Runtime permissions for advertising. iOS asks on first use through the system prompt the
 * native module triggers. Android 12+ needs BLUETOOTH_ADVERTISE and BLUETOOTH_CONNECT granted at
 * runtime before the advertiser or the GATT server can start; older Android grants them at
 * install. Neither permission involves location.
 */
import { PermissionsAndroid, Platform } from 'react-native';

export const ANDROID_BLE_PERMISSIONS = [
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.BLUETOOTH_CONNECT',
] as const;

export type BlePermissionResult = 'granted' | 'denied' | 'blocked';

export interface BlePermissionEnv {
  os: string;
  /** Android API level (a number) or an iOS version string. */
  version: number | string;
  request: (permissions: string[]) => Promise<Record<string, string>>;
}

const live = (): BlePermissionEnv => ({
  os: Platform.OS,
  version: Platform.Version,
  request: (permissions) =>
    PermissionsAndroid.requestMultiple(permissions as never),
});

/** Ask if needed. Resolves 'granted' on iOS and on Android below 12 without prompting. */
export async function ensureBlePermissions(
  env: BlePermissionEnv = live(),
): Promise<BlePermissionResult> {
  if (env.os !== 'android') return 'granted';
  if (typeof env.version === 'number' && env.version < 31) return 'granted';
  try {
    const results = await env.request([...ANDROID_BLE_PERMISSIONS]);
    const values = ANDROID_BLE_PERMISSIONS.map((p) => results[p]);
    if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
    if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}
