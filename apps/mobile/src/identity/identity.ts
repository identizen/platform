/**
 * Identity lifecycle: create / restore the seed, register the install with the index, forget.
 * Mirrors apps/fake-phone/src/phone.ts; everything cryptographic comes from @identizen/protocol.
 */
import {
  deriveMasterKey,
  fromHex,
  generateKeyPair,
  generateSeed,
  keyPairFromPrivateKey,
  mnemonicToSeed,
  seedToMnemonic,
  signIdentityProof,
  toBase64Url,
  toHex,
  type KeyPair,
} from '@identizen/protocol';
import {
  DEFAULT_SETTINGS,
  readDevice,
  readSeedHex,
  readSettings,
  wipeAll,
  writeDevice,
  writeSeedHex,
  writeSettings,
  type DeviceRecord,
  type Settings,
} from './store';

export interface RegistrationResult {
  deviceId: string;
  idz: string;
  indexPubkey: string;
  handle: string | null;
}

export interface IdentitySummary {
  idz: string | null;
  deviceId: string | null;
  handle: string | null;
  indexUrl: string;
  registered: boolean;
}

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** Test hook. */
export function setFetch(f: typeof fetch): void {
  fetchImpl = f;
}

function freshDevice(indexUrl: string): DeviceRecord {
  return {
    devicePrivHex: toHex(generateKeyPair().privateKey),
    bleKeyHex: toHex(generateSeed()),
    deviceId: null,
    idz: null,
    indexUrl,
    indexPubkey: null,
    handle: null,
    pushMode: null,
  };
}

/** Step 1 of onboarding: a brand-new 256-bit seed. Returns the 24 words to show once. */
export async function createIdentity(settings: Settings = DEFAULT_SETTINGS): Promise<string> {
  const seed = generateSeed();
  await writeSeedHex(toHex(seed), settings.biometricRequired);
  await writeSettings(settings);
  await writeDevice(freshDevice(settings.indexUrl));
  return seedToMnemonic(seed);
}

/** Restore on a new phone: validates the 24 words (checksum) and stores the same seed. */
export async function restoreIdentity(
  mnemonic: string,
  settings: Settings = DEFAULT_SETTINGS,
): Promise<void> {
  const seed = mnemonicToSeed(mnemonic); // throws on invalid phrase
  await writeSeedHex(toHex(seed), settings.biometricRequired);
  await writeSettings(settings);
  await writeDevice(freshDevice(settings.indexUrl));
}

export async function hasIdentity(): Promise<boolean> {
  return (await readSeedHex()) !== null;
}

export async function getSummary(): Promise<IdentitySummary> {
  const [device, settings] = await Promise.all([readDevice(), readSettings()]);
  return {
    idz: device?.idz ?? null,
    deviceId: device?.deviceId ?? null,
    handle: device?.handle ?? null,
    indexUrl: device?.indexUrl ?? settings.indexUrl,
    registered: device?.deviceId !== null && device?.deviceId !== undefined,
  };
}

/** The 24 words, for the "show recovery phrase" screen (gate behind biometrics in the UI). */
export async function getMnemonic(): Promise<string | null> {
  const hex = await readSeedHex();
  return hex ? seedToMnemonic(fromHex(hex)) : null;
}

export async function getDeviceKey(): Promise<KeyPair> {
  const device = await readDevice();
  if (!device) throw new Error('no device record');
  return keyPairFromPrivateKey(fromHex(device.devicePrivHex));
}

export async function requireDevice(): Promise<
  DeviceRecord & { deviceId: string; indexPubkey: string }
> {
  const device = await readDevice();
  if (!device?.deviceId || !device.indexPubkey) throw new Error('device is not registered');
  return { ...device, deviceId: device.deviceId, indexPubkey: device.indexPubkey };
}

/**
 * `POST /devices`: registers the install and (on first sight) the identity. Idempotent per install.
 * `push` is what this install can receive: an APNs/FCM token, `'poll'` for inbox polling, or null.
 */
export async function register(
  push: { platform: 'apns' | 'fcm' | 'web'; token: string } | null,
): Promise<RegistrationResult> {
  const seedHex = await readSeedHex();
  const device = await readDevice();
  if (!seedHex || !device) throw new Error('create or restore an identity first');
  if (device.deviceId && device.idz && device.indexPubkey) {
    return {
      deviceId: device.deviceId,
      idz: device.idz,
      indexPubkey: device.indexPubkey,
      handle: device.handle,
    };
  }
  const master = deriveMasterKey(fromHex(seedHex));
  const deviceKey = keyPairFromPrivateKey(fromHex(device.devicePrivHex));
  const devicePub = toBase64Url(deviceKey.publicKey);
  const res = await fetchImpl(`${device.indexUrl}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(master.publicKey),
      master_sig: signIdentityProof(devicePub, master.privateKey),
      ble_key: toBase64Url(fromHex(device.bleKeyHex)),
      ...(push ? { push_token: push.token, push_platform: push.platform } : {}),
      label: 'Identizen app',
    }),
  });
  if (res.status !== 201) throw new Error(`registration failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    device_id: string;
    idz: string;
    index_pubkey: string;
    handle: string | null;
  };
  await writeDevice({
    ...device,
    deviceId: body.device_id,
    idz: body.idz,
    indexPubkey: body.index_pubkey,
    handle: body.handle,
    pushMode: push ? (push.platform === 'web' ? 'poll' : push.platform) : null,
  });
  return {
    deviceId: body.device_id,
    idz: body.idz,
    indexPubkey: body.index_pubkey,
    handle: body.handle,
  };
}

export async function updateLocalHandle(handle: string | null): Promise<void> {
  const device = await readDevice();
  if (device) await writeDevice({ ...device, handle });
}

/** Forget this identity on this phone. The index keeps the device until it is revoked elsewhere. */
export async function forgetIdentity(): Promise<void> {
  await wipeAll();
}
