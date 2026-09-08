/**
 * At-rest storage. The seed and the device private keys live in the OS keychain (expo-secure-store);
 * in M8 the seed is keychain-wrapped with `requireAuthentication` when the user opts in. M9 moves
 * the seed under a Secure Enclave key (modules/idz-enclave); this module keeps the same interface.
 * Nothing here is ever sent to the index.
 *
 * One phone, one seed, identities on several indexes: `idz.devices` holds one `DeviceRecord` per
 * index the phone is registered on (or is about to register on), keyed by the index URL. The
 * master key is derived from the seed, so the identity id is the same on every index; the device
 * key pair is generated per index at registration. `Settings.activeIndexUrl` names the index the
 * app acts on by default (Home, the lists, Bluetooth advertising).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  seed: 'idz.seed',
  devices: 'idz.devices',
  /** Pre-multi-index builds stored one record here; read once and migrated into `devices`. */
  legacyDevice: 'idz.device',
  settings: 'idz.settings',
  activity: 'idz.activity',
  enrollment: 'idz.enrollment',
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

export type DeviceRecords = Record<string, DeviceRecord>;

export interface Settings {
  /** The index Home, the lists and Bluetooth act on. Always one of the registered indexes. */
  activeIndexUrl: string;
  biometricRequired: boolean;
  /** Advertise the rotating id so a nearby computer can find this phone (PROTOCOL.md §6.3). */
  bluetoothEnabled: boolean;
}

/**
 * The org that manages this phone (enterprise enrollment). Remembered locally on approval: the
 * index has no per-device endpoint that reports it yet.
 */
export interface ManagedBy {
  org: string;
  index: string;
}

/** An enrollment this phone claimed that an administrator has not decided on yet. */
export interface PendingEnrollment {
  token: string;
  indexUrl: string;
  org: string;
  claimedAt: number;
}

export interface EnrollmentState {
  pending: PendingEnrollment | null;
  managedBy: ManagedBy | null;
}

export const EMPTY_ENROLLMENT: EnrollmentState = { pending: null, managedBy: null };

export const DEFAULT_INDEX_URL = 'https://index.identizen.com';
export const DEFAULT_SETTINGS: Settings = {
  activeIndexUrl: DEFAULT_INDEX_URL,
  biometricRequired: true,
  bluetoothEnabled: true,
};

/**
 * The key a device record is stored under: no trailing slash, scheme and host case-folded. The
 * record's own `indexUrl` keeps the form the identity proof was bound to.
 */
export function indexKey(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)(.*)$/i.exec(trimmed);
  return m ? `${(m[1] ?? '').toLowerCase()}${m[2] ?? ''}` : trimmed;
}

export const sameIndex = (a: string, b: string): boolean => indexKey(a) === indexKey(b);

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

async function readRawSettings(): Promise<Partial<Settings> & { indexUrl?: string }> {
  const raw = await AsyncStorage.getItem(KEYS.settings);
  return raw ? (JSON.parse(raw) as Partial<Settings> & { indexUrl?: string }) : {};
}

/**
 * Every device record, keyed by `indexKey(indexUrl)`. The first read after an upgrade moves the
 * single legacy record into the map and makes its index the active one.
 */
export async function readDevices(): Promise<DeviceRecords> {
  const raw = await SecureStore.getItemAsync(KEYS.devices);
  if (raw) return JSON.parse(raw) as DeviceRecords;
  const legacy = await SecureStore.getItemAsync(KEYS.legacyDevice);
  if (!legacy) return {};
  const record = JSON.parse(legacy) as DeviceRecord;
  const devices: DeviceRecords = { [indexKey(record.indexUrl)]: record };
  await writeDevices(devices);
  await SecureStore.deleteItemAsync(KEYS.legacyDevice);
  await writeSettings({ ...(await readSettings()), activeIndexUrl: record.indexUrl });
  return devices;
}

export async function writeDevices(devices: DeviceRecords): Promise<void> {
  await SecureStore.setItemAsync(KEYS.devices, JSON.stringify(devices), secureOpts(false));
}

/** The record for `indexUrl`, or for the active index when none is given. Never prompts. */
export async function readDevice(indexUrl?: string): Promise<DeviceRecord | null> {
  const devices = await readDevices();
  const url = indexUrl ?? (await readSettings()).activeIndexUrl;
  return devices[indexKey(url)] ?? null;
}

/** Upsert one record under its own index. Does not change the active index. */
export async function writeDevice(record: DeviceRecord): Promise<void> {
  const devices = await readDevices();
  await writeDevices({ ...devices, [indexKey(record.indexUrl)]: record });
}

export async function removeDevice(indexUrl: string): Promise<void> {
  const devices = await readDevices();
  const { [indexKey(indexUrl)]: _gone, ...rest } = devices;
  await writeDevices(rest);
}

export async function readSettings(): Promise<Settings> {
  const { indexUrl, ...stored } = await readRawSettings();
  // Pre-multi-index builds called the one index `indexUrl`.
  return {
    ...DEFAULT_SETTINGS,
    ...(indexUrl !== undefined && stored.activeIndexUrl === undefined
      ? { activeIndexUrl: indexUrl }
      : {}),
    ...stored,
  };
}

export async function writeSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export async function setActiveIndexUrl(indexUrl: string): Promise<void> {
  const settings = await readSettings();
  if (sameIndex(settings.activeIndexUrl, indexUrl)) return;
  await writeSettings({ ...settings, activeIndexUrl: indexUrl });
}

export async function readEnrollment(): Promise<EnrollmentState> {
  const raw = await AsyncStorage.getItem(KEYS.enrollment);
  return raw
    ? { ...EMPTY_ENROLLMENT, ...(JSON.parse(raw) as Partial<EnrollmentState>) }
    : EMPTY_ENROLLMENT;
}

export async function writeEnrollment(state: EnrollmentState): Promise<void> {
  await AsyncStorage.setItem(KEYS.enrollment, JSON.stringify(state));
}

/** Wipe everything: the identity is gone from this phone (recoverable from the passphrase only). */
export async function wipeAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.seed);
  await SecureStore.deleteItemAsync(KEYS.devices);
  await SecureStore.deleteItemAsync(KEYS.legacyDevice);
  await AsyncStorage.removeItem(KEYS.settings);
  await AsyncStorage.removeItem(KEYS.activity);
  await AsyncStorage.removeItem(KEYS.enrollment);
}
