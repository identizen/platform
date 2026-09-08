import { fromBase64Url, parseIdzSignature, toHex } from '@identizen/protocol';
import { setApiFetch } from '../src/api/client';
import {
  attestationPlatform,
  devicePubkeyHash,
  getAttestation,
  hasAttestationProvider,
  setAttestationProvider,
  type Attestation,
} from '../src/attestation';
import { enrollmentFromUrl } from '../src/deeplinks';
import {
  enrollmentLinkFromParams,
  normalizeIndexUrl,
  parseEnrollmentLink,
  parseQuery,
} from '../src/enrollment/links';
import {
  beginEnrollment,
  checkPendingEnrollment,
  claimEnrollment,
  ENROLLMENT_MESSAGES,
  EnrollmentError,
  pollEnrollment,
  toEnrollmentError,
} from '../src/enrollment/machine';
import { createIdentity, register, setFetch } from '../src/identity/identity';
import {
  readDevice,
  readDevices,
  readEnrollment,
  readSettings,
  wipeAll,
  writeEnrollment,
  writeSettings,
} from '../src/identity/store';

// src/deeplinks imports expo-linking, which has no native module under Jest.
jest.mock('expo-linking', () => ({ parse: (url: string) => ({ path: url }) }));

const OPEN = 'https://open.test';
const ORG = 'https://acme.index.test';
const TOKEN = 'enr_' + 'x'.repeat(40);
const LINK = `identizen://enroll?index=${encodeURIComponent(ORG)}&token=${TOKEN}`;

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Script {
  begin?: { status: number; body: unknown };
  claim?: { status: number; body: unknown };
  /** Successive answers to `/status`; the last one repeats. */
  status?: { status: number; body: unknown }[];
}

/** Scripted tenant index plus the open registration routes on any host. */
function fakeIndex(script: Script = {}) {
  const calls: Call[] = [];
  let statusIdx = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers = (init?.headers as Record<string, string> | undefined) ?? {};
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, headers, body });
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (path === '/devices/nonce')
      return Response.json({ nonce: 'n'.repeat(40), exp: Math.floor(Date.now() / 1000) + 120 });
    if (path === '/devices')
      return Response.json(
        {
          device_id: 'dev_01K3ZB2N9G0000000000000001',
          idz: 'I'.repeat(32),
          index_pubkey: 'A'.repeat(43),
          handle: null,
        },
        { status: 201 },
      );
    if (path === `/enroll/${TOKEN}/begin`) {
      const r = script.begin ?? {
        status: 200,
        body: {
          org: { display_name: 'Acme', logo_url: null },
          member_email_masked: 'g***@acme.example',
          index: ORG,
          policy: { require_attestation: false },
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          nonce: 'attest-nonce',
        },
      };
      return Response.json(r.body, { status: r.status });
    }
    if (path === `/enroll/${TOKEN}/claim`) {
      const r = script.claim ?? {
        status: 200,
        body: { enrollment: { id: 'e_1', status: 'approved' }, approval_required: false },
      };
      return Response.json(r.body, { status: r.status });
    }
    if (path === `/enroll/${TOKEN}/status`) {
      const list = script.status ?? [{ status: 200, body: { status: 'claimed' } }];
      const r = list[Math.min(statusIdx++, list.length - 1)] ?? list[0];
      if (!r) throw new Error('no status script');
      return Response.json(r.body, { status: r.status });
    }
    return Response.json({ error: 'not_found', error_description: 'nope' }, { status: 404 });
  };
  return { fetchImpl, calls };
}

function arrange(script: Script = {}) {
  const index = fakeIndex(script);
  setFetch(index.fetchImpl);
  setApiFetch(index.fetchImpl);
  return index;
}

const err = (status: number, error: string) => ({
  status,
  body: { error, error_description: error },
});

beforeEach(() => {
  setAttestationProvider(null);
});

describe('enrollment deep links', () => {
  it('parses the custom scheme, the https form and bare params; rejects the rest', () => {
    expect(parseEnrollmentLink(LINK)).toEqual({ index: ORG, token: TOKEN });
    expect(parseEnrollmentLink(`identizen:///enroll/?token=${TOKEN}&index=${ORG}/`)).toEqual({
      index: ORG,
      token: TOKEN,
    });
    expect(
      parseEnrollmentLink(`https://acme.app.identizen.com/enroll?index=${ORG}&token=${TOKEN}`),
    ).toEqual({ index: ORG, token: TOKEN });
    expect(parseEnrollmentLink(`index=${ORG}&token=${TOKEN}`)).toEqual({
      index: ORG,
      token: TOKEN,
    });
    expect(enrollmentFromUrl(LINK)).toEqual({ index: ORG, token: TOKEN });
    expect(enrollmentLinkFromParams({ index: ORG, token: TOKEN })).toEqual({
      index: ORG,
      token: TOKEN,
    });

    expect(parseEnrollmentLink(null)).toBeNull();
    expect(parseEnrollmentLink('identizen://l/ch_01K3ZB2N9G0000000000000000')).toBeNull();
    expect(parseEnrollmentLink(`identizen://enroll?index=${ORG}`)).toBeNull();
    expect(parseEnrollmentLink(`identizen://enroll?token=${TOKEN}`)).toBeNull();
    expect(
      parseEnrollmentLink(`identizen://enroll?index=http://acme.test&token=${TOKEN}`),
    ).toBeNull();
    expect(parseEnrollmentLink(`identizen://enroll?index=${ORG}&token=short`)).toBeNull();
    expect(parseEnrollmentLink(`identizen://enroll?index=${ORG}/path&token=${TOKEN}`)).toBeNull();
    expect(parseEnrollmentLink(`https://acme.test/other?index=${ORG}&token=${TOKEN}`)).toBeNull();
  });

  it('normalises the issuer and tolerates odd query strings', () => {
    expect(normalizeIndexUrl(' HTTPS://Acme.Index.Test/// ')).toBe('https://acme.index.test');
    expect(normalizeIndexUrl('http://localhost:8787/')).toBe('http://localhost:8787');
    expect(normalizeIndexUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    expect(normalizeIndexUrl('http://acme.test')).toBeNull();
    expect(normalizeIndexUrl('https://acme.test/index')).toBeNull();
    expect(normalizeIndexUrl('acme.test')).toBeNull();
    const q = parseQuery('?a=1&a=2&b&c=%ZZ&d=x%20y');
    expect([...q.entries()]).toEqual([
      ['a', '1'],
      ['b', ''],
      ['d', 'x y'],
    ]);
  });
});

describe('attestation abstraction', () => {
  it('returns null without a native provider and maps the platform', async () => {
    expect(hasAttestationProvider()).toBe(false);
    expect(await getAttestation({ platform: 'ios', nonce: 'n', devicePubkeyHash: 'h' })).toBeNull();
    expect(attestationPlatform('ios')).toBe('ios');
    expect(attestationPlatform('android')).toBe('android');
    expect(attestationPlatform('web')).toBeNull();
    // SHA-256 of 32 zero bytes, base64url: what the verifier recomputes from the device pubkey.
    expect(toHex(fromBase64Url(devicePubkeyHash(new Uint8Array(32))))).toBe(
      '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925',
    );
  });

  it('hands a registered provider the exact verifier inputs and swallows its failures', async () => {
    const attest = jest.fn(() =>
      Promise.resolve<Attestation>({ platform: 'ios', key_id: 'k', payload: 'p' }),
    );
    setAttestationProvider({ attest });
    const req = { platform: 'ios' as const, nonce: 'attest-nonce', devicePubkeyHash: 'hash' };
    expect(await getAttestation(req)).toEqual({ platform: 'ios', key_id: 'k', payload: 'p' });
    expect(attest).toHaveBeenCalledWith(req);
    setAttestationProvider({ attest: () => Promise.reject(new Error('DCError')) });
    expect(await getAttestation(req)).toBeNull();
  });
});

describe('enrollment store', () => {
  it('persists pending and managedBy, defaults to empty, and is wiped with the identity', async () => {
    expect(await readEnrollment()).toEqual({ pending: null, managedBy: null });
    await writeEnrollment({
      pending: { token: TOKEN, indexUrl: ORG, org: 'Acme', claimedAt: 1 },
      managedBy: null,
    });
    expect((await readEnrollment()).pending?.org).toBe('Acme');
    await writeEnrollment({ pending: null, managedBy: { org: 'Acme', index: ORG } });
    expect(await readEnrollment()).toEqual({
      pending: null,
      managedBy: { org: 'Acme', index: ORG },
    });
    await wipeAll();
    expect(await readEnrollment()).toEqual({ pending: null, managedBy: null });
  });
});

describe('enrollment state machine', () => {
  const link = { index: ORG, token: TOKEN };

  it('begin returns the org sheet and maps the phone-route errors', async () => {
    arrange();
    const info = await beginEnrollment(link);
    expect(info.org.display_name).toBe('Acme');
    expect(info.member_email_masked).toBe('g***@acme.example');
    expect(info.nonce).toBe('attest-nonce');
    for (const [status, code] of [
      [404, 'invalid_enrollment'],
      [410, 'enrollment_expired'],
      [409, 'enrollment_used'],
    ] as const) {
      arrange({ begin: err(status, code) });
      const e = await beginEnrollment(link).catch((x: unknown) => toEnrollmentError(x));
      expect(e).toBeInstanceOf(EnrollmentError);
      expect((e as EnrollmentError).code).toBe(code);
      expect((e as EnrollmentError).message).toBe(ENROLLMENT_MESSAGES[code]);
    }
    expect(toEnrollmentError(new TypeError('Network request failed')).code).toBe('network');
    expect(toEnrollmentError(new Error('?')).code).toBe('unknown');
  });

  it('an unregistered phone is pointed at the org index, registered, and claims signed; auto-approval remembers the org', async () => {
    const index = arrange();
    await createIdentity({
      activeIndexUrl: OPEN,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    const info = await beginEnrollment(link);
    expect(await claimEnrollment(link, info, 'ios')).toEqual({ kind: 'approved', org: 'Acme' });

    const paths = index.calls.map((c) => `${c.method} ${c.url}`);
    expect(paths).toEqual([
      `POST ${ORG}/enroll/${TOKEN}/begin`,
      `POST ${ORG}/devices/nonce`,
      `POST ${ORG}/devices`,
      `POST ${ORG}/enroll/${TOKEN}/claim`,
    ]);
    const claim = index.calls[3];
    expect(claim?.body).toEqual({});
    const sig = parseIdzSignature(claim?.headers['Idz-Signature']);
    expect(sig?.device_id).toBe('dev_01K3ZB2N9G0000000000000001');
    expect((await readDevice())?.indexUrl).toBe(ORG);
    expect((await readSettings()).activeIndexUrl).toBe(ORG);
    expect(await readEnrollment()).toEqual({
      pending: null,
      managedBy: { org: 'Acme', index: ORG },
    });
  });

  it('a phone registered on the public index registers on the org index too, keeping both', async () => {
    const index = arrange();
    await createIdentity({
      activeIndexUrl: OPEN,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    await register(null);
    const info = await beginEnrollment(link);
    const before = index.calls.length;
    expect(await claimEnrollment(link, info)).toEqual({ kind: 'approved', org: 'Acme' });
    expect(index.calls.slice(before).map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${ORG}/devices/nonce`,
      `POST ${ORG}/devices`,
      `POST ${ORG}/enroll/${TOKEN}/claim`,
    ]);
    // The personal identity is untouched; the org's index sits next to it and is now active.
    const devices = await readDevices();
    expect(Object.keys(devices).sort()).toEqual([ORG, OPEN].sort());
    expect(devices[OPEN]?.deviceId).toBe('dev_01K3ZB2N9G0000000000000001');
    expect(devices[ORG]?.deviceId).toBe('dev_01K3ZB2N9G0000000000000001');
    expect(devices[OPEN]?.devicePrivHex).not.toBe(devices[ORG]?.devicePrivHex);
    expect((await readSettings()).activeIndexUrl).toBe(ORG);
    expect((await readEnrollment()).managedBy).toEqual({ org: 'Acme', index: ORG });

    // Enrolling again with the org index already held (but not active) just switches to it.
    await writeSettings({ ...(await readSettings()), activeIndexUrl: OPEN });
    const again = index.calls.length;
    await claimEnrollment(link, info);
    expect(index.calls.slice(again).map((c) => c.url)).toEqual([`${ORG}/enroll/${TOKEN}/claim`]);
    expect((await readSettings()).activeIndexUrl).toBe(ORG);
  });

  it('a phone already registered on the org index claims straight away', async () => {
    const index = arrange();
    await createIdentity({
      activeIndexUrl: ORG,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    await register(null);
    const info = await beginEnrollment(link);
    const before = index.calls.length;
    await claimEnrollment(link, info);
    expect(index.calls.slice(before).map((c) => c.url)).toEqual([`${ORG}/enroll/${TOKEN}/claim`]);
  });

  it('without an identity nothing happens', async () => {
    arrange();
    await expect(claimEnrollment(link, await beginEnrollment(link))).rejects.toMatchObject({
      code: 'no_identity',
    });
  });

  it('require_attestation with no provider stops before registering; the server code maps too', async () => {
    const strict = {
      org: { display_name: 'Acme', logo_url: null },
      member_email_masked: 'g***@acme.example',
      index: ORG,
      policy: { require_attestation: true },
      expires_at: '',
      nonce: 'attest-nonce',
    };
    const index = arrange({
      begin: { status: 200, body: strict },
      claim: err(403, 'attestation_required'),
    });
    await createIdentity({
      activeIndexUrl: OPEN,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    const info = await beginEnrollment(link);
    const before = index.calls.length;
    await expect(claimEnrollment(link, info, 'ios')).rejects.toMatchObject({
      code: 'attestation_required',
      message: expect.stringContaining('cannot prove the phone is genuine'),
    });
    expect(index.calls.length).toBe(before);
    expect((await readDevice())?.deviceId).toBeNull();

    // A provider that cannot attest here (simulator) is treated the same by the server.
    setAttestationProvider({ attest: () => Promise.resolve(null) });
    await expect(claimEnrollment(link, info, 'ios')).rejects.toMatchObject({
      code: 'attestation_required',
    });
    setAttestationProvider({
      attest: () => Promise.resolve({ platform: 'ios', key_id: 'k', payload: 'p' }),
    });
    await expect(claimEnrollment(link, info, 'ios')).rejects.toMatchObject({
      code: 'attestation_required',
    });
  });

  it('sends the attestation the provider produced, bound to the nonce and device key', async () => {
    const index = arrange();
    await createIdentity({
      activeIndexUrl: OPEN,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    const attest = jest.fn(() =>
      Promise.resolve<Attestation>({ platform: 'android', payload: 'integrity-token' }),
    );
    setAttestationProvider({ attest });
    await claimEnrollment(link, await beginEnrollment(link), 'android');
    const claim = index.calls.find((c) => c.url.endsWith('/claim'));
    expect(claim?.body).toEqual({
      attestation: { platform: 'android', payload: 'integrity-token' },
    });
    expect(attest).toHaveBeenCalledWith({
      platform: 'android',
      nonce: 'attest-nonce',
      devicePubkeyHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });

  it('maps claim refusals', async () => {
    for (const code of ['device_already_enrolled', 'enrollment_used', 'attestation_failed']) {
      arrange({ claim: err(409, code) });
      await createIdentity({
        activeIndexUrl: ORG,
        biometricRequired: false,
        bluetoothEnabled: false,
      });
      await expect(claimEnrollment(link, await beginEnrollment(link))).rejects.toMatchObject({
        code,
      });
    }
  });

  it('a claim awaiting approval is remembered, then polling settles it', async () => {
    arrange({
      claim: {
        status: 200,
        body: { enrollment: { id: 'e_1', status: 'claimed' }, approval_required: true },
      },
      status: [
        { status: 200, body: { status: 'claimed', approval_required: true } },
        { status: 500, body: { error: 'boom' } },
        { status: 200, body: { status: 'approved', approval_required: true } },
      ],
    });
    await createIdentity({
      activeIndexUrl: OPEN,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    expect(await claimEnrollment(link, await beginEnrollment(link))).toEqual({
      kind: 'waiting',
      org: 'Acme',
    });
    const pending = (await readEnrollment()).pending;
    expect(pending).toMatchObject({ token: TOKEN, indexUrl: ORG, org: 'Acme' });
    if (!pending) throw new Error('no pending');

    const slept: number[] = [];
    const result = await pollEnrollment(pending, {
      intervalMs: 5000,
      timeoutMs: 60_000,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(result).toBe('approved');
    expect(slept).toEqual([5000, 5000]);
    expect(await readEnrollment()).toEqual({
      pending: null,
      managedBy: { org: 'Acme', index: ORG },
    });
  });

  it('polling gives up at the deadline, stops on abort, and a denial clears the claim', async () => {
    arrange();
    await createIdentity({
      activeIndexUrl: ORG,
      biometricRequired: false,
      bluetoothEnabled: false,
    });
    await register(null);
    const pending = { token: TOKEN, indexUrl: ORG, org: 'Acme', claimedAt: 0 };
    await writeEnrollment({ pending, managedBy: null });

    let t = 0;
    const timeout = await pollEnrollment(pending, {
      intervalMs: 5000,
      timeoutMs: 12_000,
      now: () => t,
      sleep: (ms) => {
        t += ms;
        return Promise.resolve();
      },
    });
    expect(timeout).toBe('timeout');
    expect(t).toBe(10_000);
    expect((await readEnrollment()).pending).toEqual(pending);

    const controller = new AbortController();
    const cancelled = pollEnrollment(pending, {
      intervalMs: 5000,
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
      signal: controller.signal,
    });
    expect(await cancelled).toBe('cancelled');

    arrange({ status: [{ status: 200, body: { status: 'denied', approval_required: true } }] });
    expect(await checkPendingEnrollment(pending)).toBe('denied');
    expect(await readEnrollment()).toEqual({ pending: null, managedBy: null });

    arrange({ status: [err(410, 'enrollment_expired')] });
    await writeEnrollment({ pending, managedBy: null });
    expect(await checkPendingEnrollment(pending)).toBe('expired');
    expect((await readEnrollment()).pending).toBeNull();
  });
});
