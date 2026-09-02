/**
 * FakePhone: everything a real Identizen phone does, minus the biometrics and the UI.
 * Used by `identizen dev`, the playground, and the e2e suite.
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
  seedToMnemonic,
  signAssertion,
  signIdentityProof,
  signRequest,
  toBase64Url,
  toHex,
  rotatingBleIdString,
  verifyChallenge,
  type Amr,
  type Challenge,
  type KeyPair,
} from '@identizen/protocol';

export type Policy = 'approve' | 'deny' | 'ignore' | 'manual';

export interface PhoneState {
  seedHex: string;
  devicePrivHex: string;
  bleKeyHex: string;
  deviceId: string | null;
  idz: string | null;
  indexPubkey: string | null;
  handle: string | null;
}

export interface PendingChallenge {
  challenge: Challenge;
  receivedAt: number;
  via: 'push' | 'scan' | 'manual';
}

export interface LogEntry {
  at: number;
  event: string;
  detail?: Record<string, unknown>;
}

export interface FakePhoneOptions {
  indexUrl: string;
  /** Public URL of this phone's HTTP server, used as the web push token (index POSTs {challenge_id}). */
  pushUrl?: string | null;
  policy?: Policy;
  amr?: Amr[];
  state?: PhoneState | null;
  handle?: string | null;
  fetchImpl?: typeof fetch;
  onStateChange?: (state: PhoneState) => void;
}

export interface ApproveResult {
  status: number;
  body: Record<string, unknown>;
}

export class FakePhone {
  readonly indexUrl: string;
  pushUrl: string | null;
  policy: Policy;
  amr: Amr[];
  readonly pending = new Map<string, PendingChallenge>();
  readonly log: LogEntry[] = [];
  private state: PhoneState;
  private readonly fetchImpl: typeof fetch;
  private readonly onStateChange: ((s: PhoneState) => void) | undefined;
  private readonly waiters = new Set<(c: PendingChallenge) => void>();

  constructor(opts: FakePhoneOptions) {
    this.indexUrl = opts.indexUrl.replace(/\/+$/, '');
    this.pushUrl = opts.pushUrl ?? null;
    this.policy = opts.policy ?? 'approve';
    this.amr = opts.amr ?? ['face', 'hwk'];
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onStateChange = opts.onStateChange;
    this.state = opts.state ?? FakePhone.freshState(opts.handle ?? null);
  }

  static freshState(handle: string | null = null): PhoneState {
    return {
      seedHex: toHex(generateSeed()),
      devicePrivHex: toHex(generateKeyPair().privateKey),
      bleKeyHex: toHex(generateSeed()),
      deviceId: null,
      idz: null,
      indexPubkey: null,
      handle,
    };
  }

  get snapshot(): PhoneState {
    return { ...this.state };
  }
  get deviceId(): string | null {
    return this.state.deviceId;
  }
  get idz(): string | null {
    return this.state.idz;
  }
  get registered(): boolean {
    return this.state.deviceId !== null;
  }
  get seed(): Uint8Array {
    return fromHex(this.state.seedHex);
  }
  get mnemonic(): string {
    return seedToMnemonic(this.seed);
  }
  get deviceKey(): KeyPair {
    return keyPairFromPrivateKey(fromHex(this.state.devicePrivHex));
  }
  get bleKey(): Uint8Array {
    return fromHex(this.state.bleKeyHex);
  }

  /** Register device + identity with the index (idempotent per device key). */
  async register(): Promise<PhoneState> {
    if (this.state.deviceId) return this.snapshot;
    const master = deriveMasterKey(this.seed);
    const devicePub = toBase64Url(this.deviceKey.publicKey);
    const res = await this.fetchImpl(`${this.indexUrl}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: devicePub,
        master_pubkey: toBase64Url(master.publicKey),
        master_sig: signIdentityProof(devicePub, master.privateKey),
        ble_key: toBase64Url(this.bleKey),
        ...(this.state.handle && { handle: this.state.handle }),
        ...(this.pushUrl && { push_token: `${this.pushUrl}/push`, push_platform: 'web' }),
        label: 'Fake phone',
      }),
    });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      device_id: string;
      idz: string;
      index_pubkey: string;
      handle: string | null;
    };
    this.state = {
      ...this.state,
      deviceId: body.device_id,
      idz: body.idz,
      indexPubkey: body.index_pubkey,
      handle: body.handle,
    };
    this.onStateChange?.(this.snapshot);
    this.record('registered', { device_id: body.device_id, idz: body.idz });
    return this.snapshot;
  }

  /** Forget everything and become a brand-new identity. */
  reset(handle: string | null = null): void {
    this.state = FakePhone.freshState(handle);
    this.pending.clear();
    this.onStateChange?.(this.snapshot);
    this.record('reset');
  }

  /** Signed request as this device (Idz-Signature). */
  async signed(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.state.deviceId) throw new Error('not registered');
    const raw = body === undefined ? '' : JSON.stringify(body);
    const header = signRequest(
      { method, path, body: raw, timestamp: Math.floor(Date.now() / 1000) },
      this.state.deviceId,
      this.deviceKey.privateKey,
    );
    return this.fetchImpl(`${this.indexUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'Idz-Signature': header },
      ...(body !== undefined && { body: raw }),
    });
  }

  /** Handle an incoming push `{ challenge_id }`. */
  async onPush(challengeId: string): Promise<PendingChallenge> {
    return this.receive(challengeId, 'push');
  }

  /** "Scan" a QR / open a deep link: `https://app.../l/<challenge_id>` or a bare id. */
  async scan(urlOrId: string): Promise<PendingChallenge> {
    const m = /(ch_[0-9A-HJKMNP-TV-Z]{26})/.exec(urlOrId);
    if (!m?.[1]) throw new Error('no challenge id in input');
    return this.receive(m[1], 'scan');
  }

  /** Fetch + verify the signed challenge, then apply the policy. */
  async receive(challengeId: string, via: PendingChallenge['via']): Promise<PendingChallenge> {
    const res = await this.fetchImpl(`${this.indexUrl}/challenge/${challengeId}`);
    if (res.status !== 200) throw new Error(`challenge fetch failed: ${res.status}`);
    const body = (await res.json()) as { payload: unknown; sig: string; status: string };
    if (!this.state.indexPubkey) throw new Error('index public key is not pinned; register first');
    const verified = verifyChallenge(
      { payload: body.payload, sig: body.sig },
      fromBase64Url(this.state.indexPubkey),
      {
        index: this.indexUrl,
      },
    );
    if (!verified.ok) throw new Error(`challenge rejected: ${verified.error}`);
    const pending: PendingChallenge = { challenge: verified.value, receivedAt: Date.now(), via };
    this.pending.set(challengeId, pending);
    this.record('challenge', {
      challenge_id: challengeId,
      via,
      rp_name: verified.value.rp_name,
      code: verified.value.code,
      acr: verified.value.acr,
      reason: verified.value.reason,
    });
    for (const w of this.waiters) w(pending);
    if (body.status === 'pending') {
      if (this.policy === 'approve') await this.approve(challengeId);
      else if (this.policy === 'deny') await this.deny(challengeId);
    }
    return pending;
  }

  /** Sign and submit the assertion. */
  async approve(challengeId: string): Promise<ApproveResult> {
    const pending = this.pending.get(challengeId);
    if (!pending) throw new Error('unknown challenge');
    if (!this.state.deviceId) throw new Error('not registered');
    const site = deriveSiteKey(this.seed, pending.challenge.rp_id);
    const assertion = createAssertion({
      challenge: pending.challenge,
      sitePublicKey: site.publicKey,
      deviceId: this.state.deviceId,
      amr: this.amr,
    });
    const signed = signAssertion(assertion, site.privateKey, this.deviceKey.privateKey);
    const res = await this.signed('POST', `/challenge/${challengeId}/assert`, signed);
    const body = (await res.json()) as Record<string, unknown>;
    this.pending.delete(challengeId);
    this.record(res.ok ? 'approved' : 'approve_failed', {
      challenge_id: challengeId,
      status: res.status,
      ...(res.ok ? { sub: body.sub } : { error: body.error }),
    });
    return { status: res.status, body };
  }

  async deny(challengeId: string): Promise<ApproveResult> {
    const res = await this.signed('POST', `/challenge/${challengeId}/deny`, {});
    const body = (await res.json()) as Record<string, unknown>;
    this.pending.delete(challengeId);
    this.record('denied', { challenge_id: challengeId, status: res.status });
    return { status: res.status, body };
  }

  /** Wait for the next challenge to arrive (any policy). */
  waitForChallenge(timeoutMs = 10_000): Promise<PendingChallenge> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(handler);
        reject(new Error('timed out waiting for a challenge'));
      }, timeoutMs);
      const handler = (c: PendingChallenge) => {
        clearTimeout(timer);
        this.waiters.delete(handler);
        resolve(c);
      };
      this.waiters.add(handler);
    });
  }

  /** Dashboard helpers. */
  async me(): Promise<Record<string, unknown>> {
    return (await (await this.signed('GET', '/me')).json()) as Record<string, unknown>;
  }
  async pairings(): Promise<{ id: string; status: string; label: string | null }[]> {
    const r = (await (await this.signed('GET', '/me/pairings')).json()) as {
      pairings: { id: string; status: string; label: string | null }[];
    };
    return r.pairings;
  }
  async sessions(): Promise<{ sid: string; client_id: string }[]> {
    const r = (await (await this.signed('GET', '/me/sessions')).json()) as {
      sessions: { sid: string; client_id: string }[];
    };
    return r.sessions;
  }
  async revokePairing(id: string): Promise<number> {
    return (await this.signed('POST', `/me/pairings/${id}/revoke`, {})).status;
  }
  async revokeSession(sid: string): Promise<number> {
    return (await this.signed('POST', `/me/sessions/${sid}/revoke`, {})).status;
  }

  /**
   * Revoke this device the way a user would from another phone: enrol a second device on the
   * same seed and revoke the first. Returns the new device's phone.
   */
  async revokeSelfFromNewDevice(): Promise<FakePhone> {
    if (!this.state.deviceId) throw new Error('not registered');
    const other = new FakePhone({
      indexUrl: this.indexUrl,
      pushUrl: this.pushUrl,
      policy: this.policy,
      fetchImpl: this.fetchImpl,
      state: { ...FakePhone.freshState(), seedHex: this.state.seedHex },
    });
    await other.register();
    const res = await other.signed('POST', `/devices/${this.state.deviceId}/revoke`, {});
    if (!res.ok) throw new Error(`revoke failed: ${res.status}`);
    this.record('device_revoked', { by: other.deviceId });
    return other;
  }

  /** Rotating BLE id for "now", as the SDK would see it. */
  bleId(now = Math.floor(Date.now() / 1000)): string {
    return rotatingBleIdString(this.bleKey, now);
  }

  private record(event: string, detail?: Record<string, unknown>): void {
    this.log.push({ at: Date.now(), event, ...(detail && { detail }) });
    if (this.log.length > 500) this.log.shift();
  }
}
