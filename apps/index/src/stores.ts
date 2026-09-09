import type { Assertion, SignedChallenge, SignedPairing } from '@identizen/protocol';
import type {
  BrowserMeta,
  RedeemCodeInput,
  RedeemCodeResult,
  SessionInit,
  SessionState,
} from './do/challenge-session';
import type { Env } from './env';

/**
 * The two pieces of in-flight state the index keeps outside Postgres: one login's session and
 * one device's (or one client's, or one IP's) request guard. On Cloudflare they are the
 * `ChallengeSession` and `RequestGuard` Durable Objects; a host running the index somewhere
 * without Durable Objects (several replicas on-prem, say) supplies its own with
 * `createApp({ stores })` and the routes never touch the namespaces.
 *
 * Every method must be linearizable per `name`: two replicas calling `approve` or `redeemCode`
 * on the same session, or `check` with the same signature, must see one of them win. A store
 * backed by a database does that with one row per name and a transaction (or a conditional
 * update) per call.
 */
export interface Stores {
  /** The session for a challenge id. `name` is already namespaced (`nsName(env, id)`). */
  challenge(name: string): ChallengeStore;
  /**
   * The guard for a device id, or for a rate-limit key (`client:<id>`, `ip:<addr>`). `name` is
   * already namespaced (`nsName(env, key)`).
   */
  guard(name: string): GuardStore;
}

/**
 * One in-flight login: the signed challenge and the session state around it, from creation to
 * approval, denial or expiry, then briefly kept so `/token` and pollers can read the outcome.
 *
 * The persisted shape is `StoredSession` (the public `SessionState` plus the signed challenge);
 * `ChallengeSession` in `do/challenge-session.ts` is the reference for every transition.
 *
 * What the Durable Object's alarm does and an implementation must reproduce:
 * - Expiry: at `signed.payload.exp` (seconds since the epoch) a session still `pending` becomes
 *   `expired` with `resolvedAt` set, and if it carries a `verificationId` the verification is
 *   expired too (`expireVerification`, exported). `getState` after that moment must never
 *   report `pending`; do it lazily on read if there is no scheduler.
 * - Retention: a resolved session (approved, denied or expired) stays readable for
 *   `CODE_TTL_MS` (five challenge TTLs) after `resolvedAt`, so a late `/state` poll sees the
 *   outcome and the authorization code can be exchanged; after that everything about it is
 *   deleted. `redeemCode` itself refuses a code older than `CODE_TTL_MS`.
 * - Nothing about a session survives beyond that: no assertion, no code, no browser key.
 */
export interface ChallengeStore {
  /** Create the session; rejects if one exists under this name. */
  create(init: SessionInit): Promise<SessionState>;
  /** The signed challenge the phone fetches, or null when unknown or already wiped. */
  getSigned(): Promise<SignedChallenge | null>;
  /** The public state (never the signed challenge), or null when unknown or already wiped. */
  getState(): Promise<SessionState | null>;
  /** Attach the browser's P-256 key; true only while pending and no key is set yet. */
  setBrowserPubkey(key: string, browser?: BrowserMeta | null): Promise<boolean>;
  /**
   * Route the challenge to a device. A session created for an identity accepts only that
   * identity's devices; an untargeted one is routed once, to the first device, and rejects
   * every other device after that.
   */
  setTargetDevice(
    deviceId: string,
    idz: string,
  ): Promise<'ok' | 'not_pending' | 'wrong_identity' | 'already_targeted'>;
  /**
   * Claim a pending session for approval: true exactly once while it is pending and unclaimed.
   * While claimed, `deny` refuses and expiry waits `RESERVE_GRACE_MS`, so the durable side
   * effects of a verified assertion (binding, pairing, audit) are never written for a session
   * that ends denied or expired (F03). `approve` or `release` ends the claim.
   */
  reserve(): Promise<boolean>;
  /** Give up a claim without resolving the session (the side effects failed); no-op otherwise. */
  release(): Promise<void>;
  /** Move pending -> approved (throws otherwise) and wake any waiting browser. */
  approve(
    assertion: Assertion,
    pairing: SignedPairing | null,
    code: string | null,
    redirect: string | null,
  ): Promise<SessionState>;
  /**
   * Move pending -> denied (throws otherwise) and wake any waiting browser. Throws
   * `ReservedError` while an approval holds the claim (`reserve`).
   */
  deny(): Promise<SessionState>;
  /**
   * Redeem the authorization code exactly once, running every check (client, redirect, PKCE,
   * age) before marking it used. Reference implementation: `ChallengeSession.redeemCode`.
   */
  redeemCode(input: RedeemCodeInput): Promise<RedeemCodeResult>;
  /** Record the OIDC session the code was exchanged for, so a reuse of the code can revoke it. */
  markExchanged(sid: string): Promise<void>;
  /**
   * WebSocket upgrade for the waiting browser (`GET /challenge/:id/ws`). The Durable Object
   * accepts the socket, sends `{ type: 'pending', challenge_id, exp }` at once and a
   * `SessionEvent` when the session resolves (404 for an unknown session, 426 without an
   * `Upgrade: websocket` header). A store with no socket bridge may return a plain `426`
   * response: the login page then polls `/challenge/:id/state`.
   */
  websocket(request: Request): Promise<Response>;
}

/**
 * One device's replay guard, rate limits and challenge inbox, or one rate-limit bucket. All
 * windows are sliding and measured from now. `GuardState` (exported) is the reference and is
 * reusable as is: give it a `GuardStorage` over your database (one `GuardRecord` row per name,
 * read and written under a lock or a transaction) and every method below is one call on it.
 *
 * What the Durable Object's alarm does and an implementation must reproduce:
 * - Replay window: a `(timestamp, sig)` pair is remembered for `WINDOW_MS` (two minutes, the
 *   signature timestamp tolerance) and refused again within it. Pairs older than that may be
 *   forgotten; the signature check itself rejects such timestamps.
 * - Rate windows: `check` counts signed requests per device per minute
 *   (`RATE_LIMIT_PER_MINUTE`), `allowPush` pushes per device per minute
 *   (`PUSH_LIMIT_PER_MINUTE`), `allowRate` events per bucket per minute; events older than a
 *   minute fall out of the count. Pruning on every call is enough; the alarm only sweeps idle
 *   state so storage does not grow.
 * - Inbox: `enqueue` is idempotent per id and keeps the newest `INBOX_LIMIT` ids; `drain`
 *   returns them in order and clears the inbox atomically, so two phones of one identity never
 *   both receive the same id.
 * - Durability: a replayed signature, a spent quota or a queued id must survive a restart or a
 *   replica switch; keep the state in the shared database, not in process memory.
 */
export interface GuardStore {
  /** False if `(timestamp, sig)` was already seen or the device exceeds its request rate. */
  check(timestamp: number, sig: string): Promise<boolean>;
  /** False when the device has been pushed too often in the last minute. */
  allowPush(): Promise<boolean>;
  /** Sliding-window limiter: at most `limit` events per minute for `bucket`. */
  allowRate(bucket: string, limit: number): Promise<boolean>;
  /** Queue a challenge id for the device's inbox (idempotent per id, bounded). */
  enqueue(challengeId: string): Promise<void>;
  /** Return and clear queued challenge ids. */
  drain(): Promise<string[]>;
}

/** The Durable Object stores: what a plain index and the hosted one use. */
export function defaultStores(env: Pick<Env, 'CHALLENGE_SESSION' | 'REQUEST_GUARD'>): Stores {
  return {
    challenge: (name) => {
      const stub = env.CHALLENGE_SESSION.getByName(name);
      return {
        create: (init) => stub.create(init),
        getSigned: () => stub.getSigned(),
        getState: () => stub.getState(),
        setBrowserPubkey: (key, browser) => stub.setBrowserPubkey(key, browser),
        setTargetDevice: (deviceId, idz) => stub.setTargetDevice(deviceId, idz),
        reserve: () => stub.reserve(),
        release: () => stub.release(),
        approve: (assertion, pairing, code, redirect) =>
          stub.approve(assertion, pairing, code, redirect),
        deny: () => stub.deny(),
        redeemCode: (input) => stub.redeemCode(input),
        markExchanged: (sid) => stub.markExchanged(sid),
        websocket: (request) => stub.fetch(request),
      };
    },
    guard: (name) => {
      const stub = env.REQUEST_GUARD.getByName(name);
      return {
        check: (timestamp, sig) => stub.check(timestamp, sig),
        allowPush: () => stub.allowPush(),
        allowRate: (bucket, limit) => stub.allowRate(bucket, limit),
        enqueue: (challengeId) => stub.enqueue(challengeId),
        drain: () => stub.drain(),
      };
    },
  };
}
