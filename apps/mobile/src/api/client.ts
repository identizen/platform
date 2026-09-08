/**
 * Signed requests to an index (PROTOCOL.md section 8) and the account endpoints the app uses.
 * Every call takes an optional `indexUrl`; without one it goes to the active index. Anything that
 * acts on a specific challenge passes that challenge's index (see challenges/receive.ts).
 */
import { signRequest } from '@identizen/protocol';
import { getDeviceKey, requireDevice } from '../identity/identity';

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** Test hook. */
export function setApiFetch(f: typeof fetch): void {
  fetchImpl = f;
}

export class IndexError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IndexError';
  }
}

export async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  let code = `http_${res.status}`;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    if (body.error) code = body.error;
    if (body.error_description) message = body.error_description;
  } catch {
    /* not JSON */
  }
  throw new IndexError(res.status, code, message);
}

/** Idz-Signature request as this phone's device on `indexUrl` (active index by default). */
export async function signedFetch(
  method: string,
  path: string,
  body?: unknown,
  indexUrl?: string,
): Promise<Response> {
  const device = await requireDevice(indexUrl);
  const key = await getDeviceKey(device.indexUrl);
  const raw = body === undefined ? '' : JSON.stringify(body);
  const header = signRequest(
    { method, path, body: raw, timestamp: Math.floor(Date.now() / 1000) },
    device.deviceId,
    key.privateKey,
  );
  return fetchImpl(`${device.indexUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'Idz-Signature': header },
    ...(body !== undefined && { body: raw }),
  });
}

export async function signedJson<T>(
  method: string,
  path: string,
  body?: unknown,
  indexUrl?: string,
): Promise<T> {
  const res = await signedFetch(method, path, body, indexUrl);
  await throwIfNotOk(res);
  return (await res.json()) as T;
}

/** Public (unsigned) fetch against a registered index (active by default). */
export async function indexFetch(
  path: string,
  init?: RequestInit,
  indexUrl?: string,
): Promise<Response> {
  const device = await requireDevice(indexUrl);
  return fetchImpl(`${device.indexUrl}${path}`, init);
}

/** Unsigned fetch against an arbitrary index, for routes reached before this phone is registered there. */
export function publicFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchImpl(url, init);
}

export interface DeviceRow {
  id: string;
  status: 'active' | 'disabled' | 'revoked';
  push_platform: string | null;
  has_ble: boolean;
  last_seen_at: string | null;
  created_at: string;
  current: boolean;
}
export interface PairingRow {
  id: string;
  device_id: string;
  label: string | null;
  browser?: string | null;
  browser_version?: string | null;
  os?: string | null;
  os_version?: string | null;
  last_ip?: string | null;
  status: 'active' | 'revoked';
  last_used_at: string | null;
  created_at: string;
}
export interface SessionRow {
  sid: string;
  client_id: string;
  device_id: string;
  created_at: string;
  expires_at: string;
}

export const api = {
  me: (indexUrl?: string) =>
    signedJson<{
      idz: string;
      handle: string | null;
      device: { id: string; status: string } | null;
    }>('GET', '/me', undefined, indexUrl),
  devices: (indexUrl?: string) =>
    signedJson<{ devices: DeviceRow[] }>('GET', '/me/devices', undefined, indexUrl).then(
      (r) => r.devices,
    ),
  pairings: (indexUrl?: string) =>
    signedJson<{ pairings: PairingRow[] }>('GET', '/me/pairings', undefined, indexUrl).then(
      (r) => r.pairings,
    ),
  sessions: (indexUrl?: string) =>
    signedJson<{ sessions: SessionRow[] }>('GET', '/me/sessions', undefined, indexUrl).then(
      (r) => r.sessions,
    ),
  revokeDevice: (id: string, indexUrl?: string) =>
    signedJson<{ device_id: string; status: string }>(
      'POST',
      `/me/devices/${id}/revoke`,
      {},
      indexUrl,
    ),
  revokePairing: (id: string, indexUrl?: string) =>
    signedJson<{ id: string; status: string }>('POST', `/me/pairings/${id}/revoke`, {}, indexUrl),
  revokeSession: (sid: string, indexUrl?: string) =>
    signedJson<{ sid: string }>('POST', `/me/sessions/${sid}/revoke`, {}, indexUrl),
  setHandle: (handle: string | null, indexUrl?: string) =>
    signedJson<{ idz: string; handle: string | null }>('POST', '/me/handle', { handle }, indexUrl),
  updatePushToken: (
    deviceId: string,
    token: string | null,
    platform: 'apns' | 'fcm' | 'web' | null,
    indexUrl?: string,
  ) =>
    signedJson<{ device_id: string }>(
      'POST',
      `/devices/${deviceId}/push-token`,
      { push_token: token, push_platform: platform },
      indexUrl,
    ),
  inbox: (deviceId: string, indexUrl?: string) =>
    signedJson<{ challenge_ids: string[] }>(
      'GET',
      `/devices/${deviceId}/inbox`,
      undefined,
      indexUrl,
    ).then((r) => r.challenge_ids),
};
