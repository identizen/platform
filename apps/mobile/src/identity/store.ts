/**
 * At-rest storage. The seed and device private key live in the OS keychain (expo-secure-store);
 * in M8 the seed is keychain-wrapped with `requireAuthentication` when the user opts in. M9 moves
 * the seed under a Secure Enclave key (modules/idz-enclave); this module keeps the same interface.
 * Nothing here is ever sent to the index.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  seed: 'idz.seed',
  device: 'idz.device',
  settings: 'idz.settings',
  activity: 'idz.activity',
} as const;

export interface DeviceRecord {
  devicePrivHex: string;
  bleKeyHex: string;
  deviceId: string | null;
  idz: string | null;
  indexUrl: string;
  indexPubkey: string | null;
  handle: string | null;
  pushMode: 'apns' | 'fcm' | 'poll' | null;
}

export interface Settings {
  indexUrl: string;
  biometricRequired: boolean;
  /** Advertise the rotating id so a nearby computer can find this phone (PROTOCOL.md §6.3). */
  bluetoothEnabled: boolean;
}

export const DEFAULT_INDEX_URL = 'https://index.identizen.com';
export const DEFAULT_SETTINGS: Settings = {
  indexUrl: DEFAULT_INDEX_URL,
  biometricRequired: true,
  bluetoothEnabled: true,
};

const SEED_PROMPT = 'Unlock your Identizen identity';

const secureOpts = (requireAuthentication: boolean): SecureStore.SecureStoreOptions => ({
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  ...(requireAuthentication
    ? { requireAuthentication: true, authenticationPrompt: SEED_PROMPT }
    : {}),
});

/**
 * Whether the OS can wrap the seed under a biometric-gated key. Android needs a strong (class 3)
 * biometric enrolled: a fingerprint on most phones, not camera face unlock. Without one the
 * keystore write throws, so callers fall back to a plain keystore entry and the app's own
 * biometric gate (expo-local-authentication, with device-credential fallback) still runs before
 * every signature.
 */
export function canProtectSeedWithBiometrics(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** Prompts for biometrics on the platforms that gate the entry (see `writeSeedHex`). */
export async function readSeedHex(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.seed, { authenticationPrompt: SEED_PROMPT });
}

export async function writeSeedHex(seedHex: string, requireAuthentication: boolean): Promise<void> {
  const protect = requireAuthentication && canProtectSeedWithBiometrics();
  await SecureStore.setItemAsync(KEYS.seed, seedHex, secureOpts(protect));
}

export async function readDevice(): Promise<DeviceRecord | null> {
  const raw = await SecureStore.getItemAsync(KEYS.device);
  return raw ? (JSON.parse(raw) as DeviceRecord) : null;
}

export async function writeDevice(record: DeviceRecord): Promise<void> {
  await SecureStore.setItemAsync(KEYS.device, JSON.stringify(record), secureOpts(false));
}

export async function readSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEYS.settings);
  return raw
    ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
    : DEFAULT_SETTINGS;
}

export async function writeSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

/** Wipe everything: the identity is gone from this phone (recoverable from the passphrase only). */
export async function wipeAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.seed);
  await SecureStore.deleteItemAsync(KEYS.device);
  await AsyncStorage.removeItem(KEYS.settings);
  await AsyncStorage.removeItem(KEYS.activity);
}
