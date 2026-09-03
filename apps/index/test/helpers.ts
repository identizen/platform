import { SELF, env } from 'cloudflare:test';
import { sql } from 'drizzle-orm';
import { createDb } from '@identizen/db';
import {
  createAssertion,
  deriveMasterKey,
  deriveSiteKey,
  generateKeyPair,
  generateSeed,
  signAssertion,
  signIdentityProof,
  signRequest,
  toBase64Url,
  type Challenge,
  type KeyPair,
  type SignedAssertion,
} from '@identizen/protocol';

export const BASE = 'http://index.test';

/** Wipe all rows between tests (the schema is created once by global-setup). */
export async function resetDb(): Promise<void> {
  const handle = createDb(env.HYPERDRIVE.connectionString, { max: 1 });
  try {
    await handle.db.execute(
      sql`truncate table audit_events, sessions, verifications, pairings, site_bindings, sites, devices, identities, orgs restart identity cascade`,
    );
  } finally {
    await handle.close();
  }
}

export function dbHandle() {
  return createDb(env.HYPERDRIVE.connectionString, { max: 1 });
}

export async function json<T = unknown>(res: Response): Promise<T> {
  return await res.json();
}

export interface Phone {
  seed: Uint8Array;
  master: KeyPair;
  device: KeyPair;
  bleKey: Uint8Array;
  deviceId: string;
  idz: string;
  indexPubkey: string;
}

/** Register a device + identity like the app would. */
export async function registerPhone(
  opts: {
    handle?: string;
    pushToken?: string;
    pushPlatform?: 'apns' | 'fcm' | 'web';
    seed?: Uint8Array;
  } = {},
): Promise<Phone> {
  const seed = opts.seed ?? generateSeed();
  const master = deriveMasterKey(seed);
  const device = generateKeyPair();
  const bleKey = generateSeed();
  const devicePub = toBase64Url(device.publicKey);
  const res = await SELF.fetch(`${BASE}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(master.publicKey),
      master_sig: signIdentityProof(devicePub, master.privateKey),
      ble_key: toBase64Url(bleKey),
      ...(opts.handle && { handle: opts.handle }),
      ...(opts.pushToken && {
        push_token: opts.pushToken,
        push_platform: opts.pushPlatform ?? 'web',
      }),
    }),
  });
  if (res.status !== 201)
    throw new Error(`registerPhone failed: ${res.status} ${await res.text()}`);
  const body = await json<{ device_id: string; idz: string; index_pubkey: string }>(res);
  return {
    seed,
    master,
    device,
    bleKey,
    deviceId: body.device_id,
    idz: body.idz,
    indexPubkey: body.index_pubkey,
  };
}

/** Signed request as the phone. */
export function signedFetch(
  phone: Phone,
  method: string,
  path: string,
  body?: unknown,
  timestamp?: number,
): Promise<Response> {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const header = signRequest(
    { method, path, body: raw, timestamp: t },
    phone.deviceId,
    phone.device.privateKey,
  );
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'Idz-Signature': header },
    ...(body !== undefined && { body: raw }),
  });
}

export interface RegisteredSite {
  client_id: string;
  client_secret: string | null;
  rp_id: string;
  name: string;
}

export async function registerSite(
  over: Partial<{
    name: string;
    rp_id: string;
    redirect_uris: string[];
    public: boolean;
    backchannel_logout_uri: string;
    webhook_url: string;
  }> = {},
): Promise<RegisteredSite> {
  const res = await SELF.fetch(`${BASE}/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Example App',
      rp_id: 'app.example.com',
      redirect_uris: ['https://app.example.com/callback'],
      ...over,
    }),
  });
  if (res.status !== 201) throw new Error(`registerSite failed: ${res.status} ${await res.text()}`);
  return json<RegisteredSite>(res);
}

export interface StartedChallenge {
  challenge_id: string;
  code: string;
  exp: number;
  acr: string;
  deep_link: string;
  ws_url: string;
  pushed: boolean;
}

export async function startChallenge(body: Record<string, unknown>): Promise<StartedChallenge> {
  const res = await SELF.fetch(`${BASE}/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 201)
    throw new Error(`startChallenge failed: ${res.status} ${await res.text()}`);
  return json<StartedChallenge>(res);
}

export async function fetchChallenge(
  id: string,
): Promise<{ payload: Challenge; sig: string; status: string }> {
  const res = await SELF.fetch(`${BASE}/challenge/${id}`);
  if (res.status !== 200) throw new Error(`fetchChallenge failed: ${res.status}`);
  return json(res);
}

/** Build the phone's double-signed assertion for a challenge. */
export function buildAssertion(
  phone: Phone,
  challenge: Challenge,
  over: Partial<{
    iat: number;
    deviceId: string;
    amr: ('face' | 'hwk' | 'pin' | 'fingerprint')[];
  }> = {},
): SignedAssertion {
  const site = deriveSiteKey(phone.seed, challenge.rp_id);
  const assertion = createAssertion({
    challenge,
    sitePublicKey: site.publicKey,
    deviceId: over.deviceId ?? phone.deviceId,
    amr: over.amr ?? ['face', 'hwk'],
    ...(over.iat !== undefined && { iat: over.iat }),
  });
  return signAssertion(assertion, site.privateKey, phone.device.privateKey);
}

/** Full approve: fetch challenge, sign, POST assertion. */
export async function approve(
  phone: Phone,
  challengeId: string,
  timestampOffset = 0,
): Promise<Response> {
  const { payload } = await fetchChallenge(challengeId);
  const signed = buildAssertion(phone, payload, {
    iat: Math.floor(Date.now() / 1000) + timestampOffset,
  });
  return signedFetch(
    phone,
    'POST',
    `/challenge/${challengeId}/assert`,
    signed,
    Math.floor(Date.now() / 1000) + timestampOffset,
  );
}
