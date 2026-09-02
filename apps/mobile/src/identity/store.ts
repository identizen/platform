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
}

export const DEFAULT_INDEX_URL = 'https://identizen-index.noundry.workers.dev';
export const DEFAULT_SETTINGS: Settings = { indexUrl: DEFAULT_INDEX_URL, biometricRequired: true };

const secureOpts = (requireAuthentication: boolean): SecureStore.SecureStoreOptions => ({
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  ...(requireAuthentication ? { requireAuthentication: true } : {}),
});

export async function readSeedHex(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.seed);
}

export async function writeSeedHex(seedHex: string, requireAuthentication: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.seed, seedHex, secureOpts(requireAuthentication));
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
