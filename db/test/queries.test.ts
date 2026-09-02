import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import {
  BindingConflictError,
  ConflictError,
  HandleTakenError,
  InvalidTransitionError,
  NotFoundError,
} from '../src/errors';
import {
  bindOrVerify,
  deleteBinding,
  getBinding,
  listBindingsForIdentity,
} from '../src/queries/bindings';
import {
  createDevice,
  disableDevice,
  enableDevice,
  getDevice,
  listActiveBleDevices,
  listDevicesForIdentity,
  requireDevice,
  revokeDevice,
  setDeviceStatus,
  touchDevice,
  updatePushToken,
} from '../src/queries/devices';
import {
  createIdentity,
  getIdentity,
  getIdentityByHandle,
  requireIdentity,
  setHandle,
} from '../src/queries/identities';
import {
  createPairing,
  getPairing,
  getPairingWithDevice,
  listPairingsForDevice,
  listPairingsForIdentity,
  revokePairing,
  revokePairingsForDevice,
  touchPairing,
} from '../src/queries/pairings';
import {
  createSession,
  getSession,
  isSessionLive,
  listLiveSessionsForIdentity,
  revokeSession,
  revokeSessionsForDevice,
  revokeSessionsForIdentity,
} from '../src/queries/sessions';
import {
  createSite,
  getSite,
  getSiteByRpId,
  listSites,
  requireSite,
  updateSite,
} from '../src/queries/sites';
import {
  createVerification,
  getVerification,
  listPendingVerificationsBefore,
  resolveVerification,
} from '../src/queries/verifications';
import { listAuditForIdentity, listAuditForSite, recordAudit } from '../src/queries/audit';
import { bytes, freshDatabase, truncateAll } from './setup';

let h: DbHandle;

beforeAll(async () => {
  h = await freshDatabase();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await truncateAll(h);
});

const IDZ = 'idz_A'.padEnd(32, 'A');
const IDZ2 = 'idz_B'.padEnd(32, 'B');

async function seedIdentityAndDevice(idz = IDZ, deviceId = 'dev_01K3ZB2N9G0000000000000001') {
  await createIdentity(h.db, { idz, masterPubkey: bytes(1) });
  return createDevice(h.db, { id: deviceId, idz, devicePubkey: bytes(2), bleKey: bytes(3) });
}

async function seedSite(clientId = 'idz_live_site1', rpId = 'app.example.com') {
  return createSite(h.db, {
    clientId,
    rpId,
    name: 'Example App',
    redirectUris: ['https://app.example.com/callback'],
  });
}

describe('identities', () => {
  it('creates, reads, and enforces handle uniqueness', async () => {
    const a = await createIdentity(h.db, { idz: IDZ, masterPubkey: bytes(1), handle: 'george' });
    expect(a.kind).toBe('personal');
    expect(a.handle).toBe('george');
    expect(a.masterPubkey).toEqual(bytes(1));
    expect(await getIdentity(h.db, IDZ)).toMatchObject({ idz: IDZ });
    expect(await getIdentityByHandle(h.db, 'GEORGE')).toMatchObject({ idz: IDZ });
    expect(await getIdentity(h.db, 'nope')).toBeNull();
    await expect(requireIdentity(h.db, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createIdentity(h.db, { idz: IDZ2, masterPubkey: bytes(9), handle: 'george' }),
    ).rejects.toBeInstanceOf(HandleTakenError);
    await expect(createIdentity(h.db, { idz: IDZ, masterPubkey: bytes(9) })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('sets and clears handles', async () => {
    await createIdentity(h.db, { idz: IDZ, masterPubkey: bytes(1) });
    await createIdentity(h.db, { idz: IDZ2, masterPubkey: bytes(2), handle: 'taken' });
    expect((await setHandle(h.db, IDZ, 'Fresh')).handle).toBe('fresh');
    await expect(setHandle(h.db, IDZ, 'taken')).rejects.toBeInstanceOf(HandleTakenError);
    expect((await setHandle(h.db, IDZ, null)).handle).toBeNull();
    await expect(setHandle(h.db, 'nope', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('devices', () => {
  it('creates, lists, updates push token, touches', async () => {
    const d = await seedIdentityAndDevice();
    expect(d.status).toBe('active');
    expect(d.bleKey).toEqual(bytes(3));
    expect(await getDevice(h.db, d.id)).toMatchObject({ id: d.id });
    expect(await requireDevice(h.db, d.id)).toMatchObject({ id: d.id });
    await expect(requireDevice(h.db, 'dev_nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(await listDevicesForIdentity(h.db, IDZ)).toHaveLength(1);
    const u = await updatePushToken(h.db, d.id, 'tok', 'apns');
    expect(u.pushToken).toBe('tok');
    expect(u.pushPlatform).toBe('apns');
    await expect(updatePushToken(h.db, 'dev_nope', 'x', 'fcm')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await touchDevice(h.db, d.id);
    expect((await listActiveBleDevices(h.db)).map((x) => x.id)).toEqual([d.id]);
  });

  it('status transitions: active -> disabled -> active -> revoked (terminal)', async () => {
    const d = await seedIdentityAndDevice();
    expect((await disableDevice(h.db, d.id)).device.status).toBe('disabled');
    expect(await listActiveBleDevices(h.db)).toHaveLength(0);
    expect((await enableDevice(h.db, d.id)).device.status).toBe('active');
    expect((await revokeDevice(h.db, d.id)).device.status).toBe('revoked');
    await expect(enableDevice(h.db, d.id)).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(disableDevice(h.db, d.id)).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(setDeviceStatus(h.db, d.id, 'revoked')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    await expect(setDeviceStatus(h.db, 'dev_nope', 'revoked')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('revoking a device cascades to pairings and live sessions', async () => {
    const d = await seedIdentityAndDevice();
    const site = await seedSite();
    const p = await createPairing(h.db, {
      id: 'pr_01K3ZB2N9G0000000000000002',
      deviceId: d.id,
      browserPubkey: bytes(4, 65),
      label: 'Safari on MacBook',
    });
    await createSession(h.db, {
      sid: 's1',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await createSession(h.db, {
      sid: 's_expired',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: new Date(Date.now() - 1000),
    });
    const change = await revokeDevice(h.db, d.id);
    expect(change.revokedSessions.map((s) => s.sid)).toEqual(['s1']);
    expect((await getPairing(h.db, p.id))?.status).toBe('revoked');
    expect((await getSession(h.db, 's1'))?.revokedAt).not.toBeNull();
    expect((await getSession(h.db, 's_expired'))?.revokedAt).toBeNull();
  });
});

describe('sites', () => {
  it('creates, reads, updates, lists; rp_id unique', async () => {
    const s = await seedSite();
    expect(s.redirectUris).toEqual(['https://app.example.com/callback']);
    expect(await getSite(h.db, s.clientId)).toMatchObject({ rpId: 'app.example.com' });
    expect(await getSiteByRpId(h.db, 'app.example.com')).toMatchObject({ clientId: s.clientId });
    expect(await getSite(h.db, 'nope')).toBeNull();
    await expect(requireSite(h.db, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(seedSite('idz_live_other', 'app.example.com')).rejects.toBeInstanceOf(
      ConflictError,
    );
    const u = await updateSite(h.db, s.clientId, {
      name: 'Renamed',
      webhookUrl: 'https://x/y',
      redirectUris: ['a', 'b'],
    });
    expect(u.name).toBe('Renamed');
    expect(u.webhookUrl).toBe('https://x/y');
    expect(u.redirectUris).toEqual(['a', 'b']);
    expect((await updateSite(h.db, s.clientId, {})).name).toBe('Renamed');
    await expect(updateSite(h.db, 'nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listSites(h.db)).toHaveLength(1);
  });
});

describe('site bindings (TOFU)', () => {
  it('creates on first use, verifies on later use, conflicts on mismatch', async () => {
    await seedIdentityAndDevice();
    await createIdentity(h.db, { idz: IDZ2, masterPubkey: bytes(9) });
    const first = await bindOrVerify(h.db, {
      rpId: 'app.example.com',
      sub: 'sub1',
      idz: IDZ,
      sitePubkey: bytes(5),
    });
    expect(first.created).toBe(true);
    const again = await bindOrVerify(h.db, {
      rpId: 'app.example.com',
      sub: 'sub1',
      idz: IDZ,
      sitePubkey: bytes(5),
    });
    expect(again.created).toBe(false);
    expect(again.binding.sitePubkey).toEqual(bytes(5));
    await expect(
      bindOrVerify(h.db, { rpId: 'app.example.com', sub: 'sub1', idz: IDZ, sitePubkey: bytes(6) }),
    ).rejects.toBeInstanceOf(BindingConflictError);
    await expect(
      bindOrVerify(h.db, { rpId: 'app.example.com', sub: 'sub1', idz: IDZ2, sitePubkey: bytes(5) }),
    ).rejects.toBeInstanceOf(BindingConflictError);
    expect(await getBinding(h.db, 'app.example.com', 'sub1')).toMatchObject({ idz: IDZ });
    expect(await getBinding(h.db, 'app.example.com', 'nope')).toBeNull();
    expect(await listBindingsForIdentity(h.db, IDZ)).toHaveLength(1);
    expect(await deleteBinding(h.db, 'app.example.com', 'sub1')).toBe(true);
    expect(await deleteBinding(h.db, 'app.example.com', 'sub1')).toBe(false);
  });
});

describe('pairings', () => {
  it('creates, joins with device, lists, touches, revokes', async () => {
    const d = await seedIdentityAndDevice();
    const p = await createPairing(h.db, {
      id: 'pr_01K3ZB2N9G0000000000000002',
      deviceId: d.id,
      browserPubkey: bytes(4, 65),
    });
    expect(p.status).toBe('active');
    const joined = await getPairingWithDevice(h.db, p.id);
    expect(joined?.device.id).toBe(d.id);
    expect(joined?.pairing.browserPubkey).toEqual(bytes(4, 65));
    expect(await getPairingWithDevice(h.db, 'pr_nope')).toBeNull();
    expect(await listPairingsForDevice(h.db, d.id)).toHaveLength(1);
    expect(await listPairingsForIdentity(h.db, IDZ)).toHaveLength(1);
    await touchPairing(h.db, p.id);
    expect((await revokePairing(h.db, p.id)).status).toBe('revoked');
    await expect(revokePairing(h.db, p.id)).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(revokePairing(h.db, 'pr_nope')).rejects.toBeInstanceOf(NotFoundError);
    await createPairing(h.db, {
      id: 'pr_01K3ZB2N9G0000000000000003',
      deviceId: d.id,
      browserPubkey: bytes(7, 65),
    });
    expect(await revokePairingsForDevice(h.db, d.id)).toBe(1);
    expect(await revokePairingsForDevice(h.db, d.id)).toBe(0);
  });
});

describe('verifications', () => {
  it('pending -> approved/denied/timeout once', async () => {
    const site = await seedSite();
    const v = await createVerification(h.db, {
      id: 'vf_01K3ZB2N9G0000000000000004',
      clientId: site.clientId,
      sub: 'sub1',
      reason: 'Approve?',
    });
    expect(v.status).toBe('pending');
    expect(await listPendingVerificationsBefore(h.db, new Date(Date.now() + 1000))).toHaveLength(1);
    const ok = await resolveVerification(h.db, v.id, 'approved', { sig: 'x' });
    expect(ok.status).toBe('approved');
    expect(ok.assertion).toEqual({ sig: 'x' });
    expect(ok.resolvedAt).not.toBeNull();
    await expect(resolveVerification(h.db, v.id, 'denied')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    await expect(resolveVerification(h.db, 'vf_nope', 'denied')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await getVerification(h.db, v.id)).toMatchObject({ status: 'approved' });
    const t = await createVerification(h.db, {
      id: 'vf_01K3ZB2N9G0000000000000005',
      clientId: site.clientId,
      sub: 'sub1',
    });
    expect((await resolveVerification(h.db, t.id, 'timeout')).status).toBe('timeout');
    expect(await listPendingVerificationsBefore(h.db, new Date(Date.now() + 1000))).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('creates, lists live, revokes by sid / identity / device', async () => {
    const d = await seedIdentityAndDevice();
    const site = await seedSite();
    const future = new Date(Date.now() + 3600_000);
    const s1 = await createSession(h.db, {
      sid: 's1',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: future,
    });
    await createSession(h.db, {
      sid: 's2',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: future,
    });
    await createSession(h.db, {
      sid: 's3',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(isSessionLive(s1)).toBe(true);
    expect((await listLiveSessionsForIdentity(h.db, IDZ)).map((s) => s.sid)).toEqual(['s1', 's2']);
    const r = await revokeSession(h.db, 's1');
    expect(r.revokedAt).not.toBeNull();
    expect(isSessionLive(r)).toBe(false);
    expect((await revokeSession(h.db, 's1')).sid).toBe('s1');
    await expect(revokeSession(h.db, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect((await revokeSessionsForIdentity(h.db, IDZ)).map((s) => s.sid)).toEqual(['s2']);
    await createSession(h.db, {
      sid: 's4',
      idz: IDZ,
      deviceId: d.id,
      clientId: site.clientId,
      expiresAt: future,
    });
    expect((await revokeSessionsForDevice(h.db, d.id)).map((s) => s.sid)).toEqual(['s4']);
    expect(await listLiveSessionsForIdentity(h.db, IDZ)).toHaveLength(0);
  });
});

describe('audit', () => {
  it('records and lists newest first', async () => {
    await seedIdentityAndDevice();
    const site = await seedSite();
    await recordAudit(h.db, {
      kind: 'login.denied',
      idz: IDZ,
      clientId: site.clientId,
      detail: { reason: 'expired' },
    });
    await recordAudit(h.db, { kind: 'login.success', idz: IDZ, clientId: site.clientId });
    const rows = await listAuditForIdentity(h.db, IDZ);
    expect(rows.map((r) => r.kind)).toEqual(['login.success', 'login.denied']);
    expect(rows[1]?.detail).toEqual({ reason: 'expired' });
    expect(await listAuditForSite(h.db, site.clientId)).toHaveLength(2);
    expect(await listAuditForIdentity(h.db, IDZ, 1)).toHaveLength(1);
  });
});
