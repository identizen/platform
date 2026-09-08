/**
 * Identity lifecycle: create / restore the seed, register the install with an index, forget.
 * Mirrors apps/fake-phone/src/phone.ts; everything cryptographic comes from @identizen/protocol.
 *
 * One seed serves every index: the master key (hence the identity id) is the same everywhere,
 * and each index gets its own device key pair at registration (`DeviceRecord` per index).
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
  indexKey,
  readDevice,
  readDevices,
  readSeedHex,
  readSettings,
  sameIndex,
  setActiveIndexUrl,
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

/** One registered (or about to be registered) index. */
export interface IndexSummary {
  indexUrl: string;
  idz: string | null;
  deviceId: string | null;
  handle: string | null;
  registered: boolean;
  active: boolean;
}

/** The active index, plus every index the phone holds. */
export interface IdentitySummary {
  idz: string | null;
  deviceId: string | null;
  handle: string | null;
  indexUrl: string;
  registered: boolean;
  indexes: IndexSummary[];
}

export interface RegisterOptions {
  /** Which index to register on; the active one when omitted. */
  indexUrl?: string | undefined;
  /** Make it the active index afterwards (default true). */
  makeActive?: boolean | undefined;
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
  await writeDevice(freshDevice(indexKey(settings.activeIndexUrl)));
  return seedToMnemonic(seed);
}

/**
 * Restore on a new phone: validates the 24 words (checksum) and stores the same seed, pointed at
 * `settings.activeIndexUrl` (the public index by default). Organization indexes are added again
 * by enrolling, or from Settings.
 */
export async function restoreIdentity(
  mnemonic: string,
  settings: Settings = DEFAULT_SETTINGS,
): Promise<void> {
  const seed = mnemonicToSeed(mnemonic); // throws on invalid phrase
  await writeSeedHex(toHex(seed), settings.biometricRequired);
  await writeSettings(settings);
  await writeDevice(freshDevice(indexKey(settings.activeIndexUrl)));
}

/** Device records are written with the seed and wiped with it, and reading them never prompts. */
export async function hasIdentity(): Promise<boolean> {
  return Object.keys(await readDevices()).length > 0;
}

const summarize = (d: DeviceRecord, active: boolean): IndexSummary => ({
  indexUrl: d.indexUrl,
  idz: d.idz,
  deviceId: d.deviceId,
  handle: d.handle,
  registered: d.deviceId !== null,
  active,
});

/** Every index, the active one first, then the rest in the order they were added. */
export async function listIndexes(): Promise<IndexSummary[]> {
  const [devices, settings] = await Promise.all([readDevices(), readSettings()]);
  const all = Object.values(devices).map((d) =>
    summarize(d, sameIndex(d.indexUrl, settings.activeIndexUrl)),
  );
  return [...all.filter((i) => i.active), ...all.filter((i) => !i.active)];
}

export async function getSummary(): Promise<IdentitySummary> {
  const [indexes, settings] = await Promise.all([listIndexes(), readSettings()]);
  const active = indexes.find((i) => i.active);
  return {
    idz: active?.idz ?? null,
    deviceId: active?.deviceId ?? null,
    handle: active?.handle ?? null,
    indexUrl: active?.indexUrl ?? settings.activeIndexUrl,
    registered: active?.registered ?? false,
    indexes,
  };
}

/** The 24 words, for the "show recovery phrase" screen (gate behind biometrics in the UI). */
export async function getMnemonic(): Promise<string | null> {
  const hex = await readSeedHex();
  return hex ? seedToMnemonic(fromHex(hex)) : null;
}

export async function getDeviceKey(indexUrl?: string): Promise<KeyPair> {
  const device = await readDevice(indexUrl);
  if (!device) throw new Error('no device record');
  return keyPairFromPrivateKey(fromHex(device.devicePrivHex));
}

export type RegisteredDevice = DeviceRecord & { deviceId: string; indexPubkey: string };

/** The registered record for `indexUrl` (active index by default), or a clear refusal. */
export async function requireDevice(indexUrl?: string): Promise<RegisteredDevice> {
  const device = await readDevice(indexUrl);
  if (!device?.deviceId || !device.indexPubkey)
    throw new Error(
      indexUrl
        ? `this phone is not registered on ${indexKey(indexUrl)}`
        : 'device is not registered',
    );
  return { ...device, deviceId: device.deviceId, indexPubkey: device.indexPubkey };
}

/** Every record that finished registering, active index first. */
export async function registeredDevices(): Promise<RegisteredDevice[]> {
  const [devices, settings] = await Promise.all([readDevices(), readSettings()]);
  const done = Object.values(devices).filter(
    (d): d is RegisteredDevice => d.deviceId !== null && d.indexPubkey !== null,
  );
  return [
    ...done.filter((d) => sameIndex(d.indexUrl, settings.activeIndexUrl)),
    ...done.filter((d) => !sameIndex(d.indexUrl, settings.activeIndexUrl)),
  ];
}

/**
 * `POST /devices`: registers the install on one index and (on first sight there) the identity.
 * Idempotent per index. `push` is what this install can receive: an APNs/FCM token, `'poll'` for
 * inbox polling, or null. The index becomes the active one unless `makeActive` is false.
 */
export async function register(
  push: { platform: 'apns' | 'fcm' | 'web'; token: string } | null,
  opts: RegisterOptions = {},
): Promise<RegistrationResult> {
  const seedHex = await readSeedHex();
  const devices = await readDevices();
  if (!seedHex || Object.keys(devices).length === 0)
    throw new Error('create or restore an identity first');
  const indexUrl = opts.indexUrl ?? (await readSettings()).activeIndexUrl;
  // A fresh record stores the normalized URL: that is what the proof binds and requests use.
  const device = devices[indexKey(indexUrl)] ?? freshDevice(indexKey(indexUrl));
  const makeActive = opts.makeActive ?? true;
  if (device.deviceId && device.idz && device.indexPubkey) {
    if (makeActive) await setActiveIndexUrl(device.indexUrl);
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
  // PROTOCOL.md §8.1: the proof is bound to this index and a nonce it just issued.
  const nonceRes = await fetchImpl(`${device.indexUrl}/devices/nonce`, { method: 'POST' });
  if (!nonceRes.ok) throw new Error(`registration nonce failed: ${nonceRes.status}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const res = await fetchImpl(`${device.indexUrl}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(master.publicKey),
      master_sig: signIdentityProof(devicePub, master.privateKey, {
        index: device.indexUrl,
        nonce,
      }),
      nonce,
      ble_key: toBase64Url(fromHex(device.bleKeyHex)),
      ...(push ? { push_token: push.token, push_platform: push.platform } : {}),
      label: 'Identizen app',
    }),
  });
  // 201 enrolls; 200 is the same install registering again (reinstall, retry).
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`registration failed: ${res.status} ${await res.text()}`);
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
  if (makeActive) await setActiveIndexUrl(device.indexUrl);
  return {
    deviceId: body.device_id,
    idz: body.idz,
    indexPubkey: body.index_pubkey,
    handle: body.handle,
  };
}

/** Handles are per index; this updates the record for `indexUrl` (active by default). */
export async function updateLocalHandle(handle: string | null, indexUrl?: string): Promise<void> {
  const device = await readDevice(indexUrl);
  if (device) await writeDevice({ ...device, handle });
}

/**
 * Forget this identity on this phone: every index and the seed. Each index keeps its device until
 * it is revoked elsewhere. To drop a single index keep the identity and use `forgetIndex`.
 */
export async function forgetIdentity(): Promise<void> {
  await wipeAll();
}
