/**
 * A browser-resident Identizen phone for the playground: real protocol, real index, no app.
 * Port of apps/fake-phone's core, minus HTTP push and Bluetooth (the index queues challenges in
 * the device inbox and we poll it while a login is pending). State lives in localStorage.
 */
import {
  createAssertion,
  deriveMasterKey,
  deriveSiteKey,
  fromBase64Url,
  fromHex,
  generateKeyPair,
  generateSeed,
  keyPairFromPrivateKey,
  signAssertion,
  signIdentityProof,
  signRequest,
  toBase64Url,
  toHex,
  verifyChallenge,
  type Amr,
  type Challenge,
  type KeyPair,
} from '@identizen/protocol';

export interface VirtualPhoneState {
  seedHex: string;
  devicePrivHex: string;
  deviceId: string | null;
  idz: string | null;
  indexPubkey: string | null;
}

export interface VirtualPhoneStore {
  get(): VirtualPhoneState | null;
  set(state: VirtualPhoneState | null): void;
}

export interface PendingRequest {
  challenge: Challenge;
  via: 'scan' | 'push';
  /** Index-reported status at receive time (`pending`, `approved`, ...). */
  status: string;
}

export interface VirtualPhoneOptions {
  indexUrl: string;
  store?: VirtualPhoneStore;
  fetchImpl?: typeof fetch;
  /** Unix seconds; defaults to the wall clock. */
  now?: () => number;
  label?: string;
}

export const STORAGE_KEY = 'idz:playground:virtual-phone';
export const DEFAULT_AMR: Amr[] = ['face', 'hwk'];

export function memoryStore(initial: VirtualPhoneState | null = null): VirtualPhoneStore {
  let value = initial;
  return {
    get: () => value,
    set: (s) => {
      value = s;
    },
  };
}

export function webStore(storage: Storage, key = STORAGE_KEY): VirtualPhoneStore {
  return {
    get: () => {
      try {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as VirtualPhoneState) : null;
      } catch {
        return null;
      }
    },
    set: (s) => {
      try {
        if (s) storage.setItem(key, JSON.stringify(s));
        else storage.removeItem(key);
      } catch {
        /* private mode: keep going in memory */
      }
    },
  };
}

export function freshState(): VirtualPhoneState {
  return {
    seedHex: toHex(generateSeed()),
    devicePrivHex: toHex(generateKeyPair().privateKey),
    deviceId: null,
    idz: null,
    indexPubkey: null,
  };
}

export function challengeIdFrom(input: string): string | null {
  return /(ch_[0-9A-HJKMNP-TV-Z]{26})/.exec(input)?.[1] ?? null;
}

export class VirtualPhone {
  readonly indexUrl: string;
  readonly pending = new Map<string, PendingRequest>();
  private state: VirtualPhoneState;
  private readonly store: VirtualPhoneStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly label: string;

  constructor(opts: VirtualPhoneOptions) {
    this.indexUrl = opts.indexUrl.replace(/\/+$/, '');
    this.store = opts.store ?? memoryStore();
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.label = opts.label ?? 'Virtual phone (identizen.com/playground)';
    this.state = this.store.get() ?? freshState();
  }

  get snapshot(): VirtualPhoneState {
    return { ...this.state };
  }
  get registered(): boolean {
    return this.state.deviceId !== null;
  }
  get deviceId(): string | null {
    return this.state.deviceId;
  }
  private get deviceKey(): KeyPair {
    return keyPairFromPrivateKey(fromHex(this.state.devicePrivHex));
  }

  /** Register this browser as a device (idempotent). `push_token: 'poll'` means "queue it, I will ask". */
  async register(): Promise<VirtualPhoneState> {
    if (this.state.deviceId) return this.snapshot;
    const master = deriveMasterKey(fromHex(this.state.seedHex));
    const devicePub = toBase64Url(this.deviceKey.publicKey);
    const res = await this.fetchImpl(`${this.indexUrl}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: devicePub,
        master_pubkey: toBase64Url(master.publicKey),
        master_sig: signIdentityProof(devicePub, master.privateKey),
        push_token: 'poll',
        push_platform: 'web',
        label: this.label,
      }),
    });
    if (res.status !== 201) throw new Error(`register failed (${res.status})`);
    const body = (await res.json()) as { device_id: string; idz: string; index_pubkey: string };
    this.state = {
      ...this.state,
      deviceId: body.device_id,
      idz: body.idz,
      indexPubkey: body.index_pubkey,
    };
    this.store.set(this.state);
    return this.snapshot;
  }

  /** Forget the identity and start over with a new seed and device key. */
  reset(): void {
    this.state = freshState();
    this.pending.clear();
    this.store.set(null);
  }

  /** Signed request as this device (`Idz-Signature`). */
  async signed(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.state.deviceId) throw new Error('not registered');
    const raw = body === undefined ? '' : JSON.stringify(body);
    const header = signRequest(
      { method, path, body: raw, timestamp: this.now() },
      this.state.deviceId,
      this.deviceKey.privateKey,
    );
    return this.fetchImpl(`${this.indexUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'Idz-Signature': header },
      ...(body !== undefined && { body: raw }),
    });
  }

  /** "Scan" a QR / deep link, or accept a bare challenge id. */
  async scan(urlOrId: string): Promise<PendingRequest> {
    const id = challengeIdFrom(urlOrId);
    if (!id) throw new Error('no challenge id in input');
    return this.receive(id, 'scan');
  }

  /** Fetch the signed challenge and verify it against the pinned index key. */
  async receive(challengeId: string, via: PendingRequest['via']): Promise<PendingRequest> {
    if (!this.state.indexPubkey) await this.register();
    const res = await this.fetchImpl(`${this.indexUrl}/challenge/${challengeId}`);
    if (res.status !== 200) throw new Error(`challenge fetch failed (${res.status})`);
    const body = (await res.json()) as { payload: unknown; sig: string; status: string };
    const verified = verifyChallenge(
      { payload: body.payload, sig: body.sig },
      fromBase64Url(this.state.indexPubkey ?? ''),
      { index: this.indexUrl, now: this.now() },
    );
    if (!verified.ok) throw new Error(`challenge rejected: ${verified.error}`);
    const pending: PendingRequest = { challenge: verified.value, via, status: body.status };
    this.pending.set(challengeId, pending);
    return pending;
  }

  /** Drain the inbox. Returns the requests that are new to this phone. */
  async pollInbox(): Promise<PendingRequest[]> {
    if (!this.state.deviceId) return [];
    const res = await this.signed('GET', `/devices/${this.state.deviceId}/inbox`);
    if (!res.ok) return [];
    const { challenge_ids } = (await res.json()) as { challenge_ids: string[] };
    const fresh: PendingRequest[] = [];
    for (const id of challenge_ids) {
      if (this.pending.has(id)) continue;
      try {
        fresh.push(await this.receive(id, 'push'));
      } catch {
        /* expired or malformed: skip */
      }
    }
    return fresh;
  }

  /** Derive the per-site key, sign the assertion with it and the device key, submit. */
  async approve(
    challengeId: string,
    amr: Amr[] = DEFAULT_AMR,
  ): Promise<{ ok: boolean; sub?: string; error?: string }> {
    const pending = this.pending.get(challengeId);
    if (!pending) throw new Error('unknown challenge');
    if (!this.state.deviceId) throw new Error('not registered');
    const site = deriveSiteKey(fromHex(this.state.seedHex), pending.challenge.rp_id);
    const assertion = createAssertion({
      challenge: pending.challenge,
      sitePublicKey: site.publicKey,
      deviceId: this.state.deviceId,
      amr,
      iat: this.now(),
    });
    const signed = signAssertion(assertion, site.privateKey, this.deviceKey.privateKey);
    const res = await this.signed('POST', `/challenge/${challengeId}/assert`, signed);
    const body = (await res.json().catch(() => ({}))) as { sub?: string; error?: string };
    this.pending.delete(challengeId);
    return res.ok
      ? { ok: true, ...(body.sub && { sub: body.sub }) }
      : { ok: false, error: body.error ?? `http_${res.status}` };
  }

  async deny(challengeId: string): Promise<boolean> {
    const res = await this.signed('POST', `/challenge/${challengeId}/deny`, {});
    this.pending.delete(challengeId);
    return res.ok;
  }
}
