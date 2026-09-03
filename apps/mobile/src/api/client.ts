/**
 * Signed requests to the index (PROTOCOL.md section 8) and the account endpoints the app uses.
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

async function throwIfNotOk(res: Response): Promise<void> {
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

/** Idz-Signature request as this device. */
export async function signedFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const device = await requireDevice();
  const key = await getDeviceKey();
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

async function signedJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await signedFetch(method, path, body);
  await throwIfNotOk(res);
  return (await res.json()) as T;
}

/** Public (unsigned) fetch against the index. */
export async function indexFetch(path: string, init?: RequestInit): Promise<Response> {
  const device = await requireDevice();
  return fetchImpl(`${device.indexUrl}${path}`, init);
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
  me: () =>
    signedJson<{
      idz: string;
      handle: string | null;
      device: { id: string; status: string } | null;
    }>('GET', '/me'),
  devices: () => signedJson<{ devices: DeviceRow[] }>('GET', '/me/devices').then((r) => r.devices),
  pairings: () =>
    signedJson<{ pairings: PairingRow[] }>('GET', '/me/pairings').then((r) => r.pairings),
  sessions: () =>
    signedJson<{ sessions: SessionRow[] }>('GET', '/me/sessions').then((r) => r.sessions),
  revokeDevice: (id: string) =>
    signedJson<{ device_id: string; status: string }>('POST', `/me/devices/${id}/revoke`, {}),
  revokePairing: (id: string) =>
    signedJson<{ id: string; status: string }>('POST', `/me/pairings/${id}/revoke`, {}),
  revokeSession: (sid: string) =>
    signedJson<{ sid: string }>('POST', `/me/sessions/${sid}/revoke`, {}),
  setHandle: (handle: string | null) =>
    signedJson<{ idz: string; handle: string | null }>('POST', '/me/handle', { handle }),
  updatePushToken: (
    deviceId: string,
    token: string | null,
    platform: 'apns' | 'fcm' | 'web' | null,
  ) =>
    signedJson<{ device_id: string }>('POST', `/devices/${deviceId}/push-token`, {
      push_token: token,
      push_platform: platform,
    }),
  inbox: (deviceId: string) =>
    signedJson<{ challenge_ids: string[] }>('GET', `/devices/${deviceId}/inbox`).then(
      (r) => r.challenge_ids,
    ),
};
