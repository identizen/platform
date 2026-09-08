/**
 * The set of indexes this phone holds an identity on: add one (register there), make one active,
 * forget one. Forgetting the whole identity, seed included, is `forgetIdentity`.
 */
import { api } from '../api/client';
import { INDEX_URL_HINT, normalizeIndexUrl } from '../enrollment/links';
import { obtainPushToken } from '../push';
import { listIndexes, register, type IndexSummary } from './identity';
import {
  DEFAULT_INDEX_URL,
  indexKey,
  readDevices,
  readEnrollment,
  readSettings,
  removeDevice,
  sameIndex,
  setActiveIndexUrl,
  writeEnrollment,
} from './store';

export { INDEX_URL_HINT };

/**
 * Register this phone's identity on one more index and make it active. Prompts for biometrics
 * the way first registration does (the seed is read from the keychain).
 */
export async function addIndex(raw: string): Promise<IndexSummary> {
  const indexUrl = normalizeIndexUrl(raw);
  if (!indexUrl) throw new Error(INDEX_URL_HINT);
  await register(await obtainPushToken(), { indexUrl, makeActive: true });
  const added = (await listIndexes()).find((i) => sameIndex(i.indexUrl, indexUrl));
  if (!added) throw new Error('registration did not store a record');
  return added;
}

/** Switch the index Home, the lists and Bluetooth act on. Only a registered index qualifies. */
export async function setActiveIndex(indexUrl: string): Promise<void> {
  const device = (await readDevices())[indexKey(indexUrl)];
  if (!device?.deviceId) throw new Error(`this phone is not registered on ${indexKey(indexUrl)}`);
  await setActiveIndexUrl(device.indexUrl);
}

/**
 * Remove one index from this phone. The device is revoked on that index first, best effort
 * (offline or already revoked is fine); the record then goes, and the active index moves to
 * another one when needed. The last index cannot be forgotten this way: use `forgetIdentity`.
 */
export async function forgetIndex(indexUrl: string): Promise<void> {
  const devices = await readDevices();
  const record = devices[indexKey(indexUrl)];
  if (!record) throw new Error(`this phone holds no identity on ${indexKey(indexUrl)}`);
  const remaining = Object.values(devices).filter((d) => !sameIndex(d.indexUrl, indexUrl));
  if (remaining.length === 0)
    throw new Error('This is the only index on this phone. To leave it, forget the identity.');
  if (record.deviceId) {
    try {
      await api.revokeDevice(record.deviceId, record.indexUrl);
    } catch {
      /* best effort: the index may be unreachable or the device already revoked there */
    }
  }
  await removeDevice(indexUrl);
  const settings = await readSettings();
  if (sameIndex(settings.activeIndexUrl, indexUrl)) {
    const next =
      remaining.find((d) => sameIndex(d.indexUrl, DEFAULT_INDEX_URL)) ??
      remaining.find((d) => d.deviceId !== null) ??
      remaining[0];
    if (next) await setActiveIndexUrl(next.indexUrl);
  }
  const enrollment = await readEnrollment();
  const managedHere = enrollment.managedBy && sameIndex(enrollment.managedBy.index, indexUrl);
  const pendingHere = enrollment.pending && sameIndex(enrollment.pending.indexUrl, indexUrl);
  if (managedHere || pendingHere)
    await writeEnrollment({
      managedBy: managedHere ? null : enrollment.managedBy,
      pending: pendingHere ? null : enrollment.pending,
    });
}
