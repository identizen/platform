# Identizen security and technical assessment

Reviewed 6 September 2026. Starting commit: `52c4aa613d701fa98d93289a2b6db31ddfe394ac`.

**Decision: do not treat the current implementation as production-ready for sensitive authentication, MFA, or transaction authorization.** The architecture and cryptographic foundations are promising, but the application does not consistently enforce who may approve which operation or where authentication results may go. Five backend probes reproduced security failures. Two additional local probes confirmed SDK token confusion and loss of replay/inbox state after reconstruction of a guard instance.

This is a source and local-test assessment, not a penetration test of the hosted service, independent cryptographic certification, or verification of deployed infrastructure. No hosted accounts were attacked and no fixes were applied. The production settings discussed below are repository settings; actual deployment overrides were not inspected.

The workspace changed concurrently during review, particularly OIDC routes, conformance tests, documentation, and fake-phone tooling. Those changes were preserved. Findings below were checked against the available source, and the backend probes passed after those OIDC edits had appeared. The test results are observations from this review, not a certification of a frozen final tree.

## Confirmed security findings

### S01 — Critical: another identity can approve a victim's verification

**Evidence:** `apps/index/src/routes/discover.ts:47,75`; `apps/index/src/do/challenge-session.ts:135`; `apps/index/src/services/assert.ts:80,106`; `apps/index/src/services/sessions.ts:34`.

Discovery overwrites `targetDeviceId`, including for an existing MFA/verification challenge. Assertion processing checks that mutable device target but never checks the assertion's subject against the original requested subject. Completion stores the attacker's assertion in a verification record that still names the victim.

The local probe enrolled two unrelated identities, started a verification for the victim, submitted the attacker's own rotating BLE identifier to discovery, and approved with the attacker's phone. The API returned `status: approved` with the victim's outer `sub` and a different `assertion.payload.sub`. No victim approval was involved in the verification itself.

**Prerequisite:** the attacker must learn the pending challenge ID. It is exposed to the requesting application, and the sample relying party forwards the verification creation response to its browser (`e2e/site/app/api/verify/route.ts`). This is particularly relevant to an attacker who has passed a first factor and faces MFA. Knowing an arbitrary victim's identity alone is insufficient.

**Fix:** persist immutable expected subject and identity at creation; reject discovery retargeting for targeted challenges; require the verified assertion to match the expected subject, identity, relying party, and operation. Enforce this again at completion, not just during discovery. Add negative tests for both BLE and paired discovery and for different keys under the same identity.

### S02 — Critical for public management clients: JSON login bypasses redirect registration

**Evidence:** `apps/index/src/routes/challenge.ts:41,53`; `apps/index/src/services/challenge.ts:90`; `apps/index/src/services/sessions.ts:30`; `apps/index/src/routes/oidc.ts` token redemption block.

`/authorize` checks the requested redirect against the site's registered URIs. `/challenge`, described as its JSON twin, accepts a caller-supplied redirect and carries it straight through to code issuance. `/token` only compares the supplied redirect against that stored request; it does not establish that the redirect was registered.

The probe used a public client, an attacker-selected PKCE verifier, and `https://attacker.example/callback`, which was not registered. After phone approval, a code was issued and successfully exchanged for tokens. For a dashboard client allowed to access `/me`, the resulting bearer token grants identity-management access, including revoking devices. Confidential clients still require their secret for token exchange.

**Prerequisite:** the victim must approve the attacker's login request. This is not an unattended compromise or theft of the recovery seed.

**Fix:** share one authorization-request validator across both endpoints. Apply exact redirect registration, secure URI policy, PKCE requirements, supported scope filtering, and prompt semantics. Validate before allocating a challenge and defensively at redemption. This follows the exact-match redirect requirement in [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.1.3).

### S03 — High: a revoked device key can be registered again using an old enrollment proof

**Evidence:** `packages/protocol/src/sign.ts:332`; `apps/index/src/routes/devices.ts:39`; `db/schema.ts:74`; `db/src/queries/devices.ts:24`.

The master proof signs only the device public key, with no freshness challenge, issuer, or enrollment metadata. Registration creates a fresh active device ID every time. There is no uniqueness or revocation check for the device key.

The probe saved an enrollment proof, revoked that device, replayed the proof, and received a new device ID that could access authenticated device management with the old device private key. The server's terminal revocation applies to a row, not to the compromised credential.

**Prerequisite:** the attacker has the device private key and a previously valid enrollment proof. Replaying the public proof alone does not grant signing ability, although it can create unwanted enrollment records and substitute unsigned push metadata.

**Fix:** use a server-issued, single-use registration challenge; bind issuer and all security-relevant enrollment fields into the proof; prevent reactivation of revoked keys through ordinary registration. Define a separate authenticated recovery/replacement procedure. A leaked recovery seed remains a separate problem: it can generate genuinely new keys, so repeated device revocation cannot repair seed compromise.

### S04 — High: replay protection and the phone inbox are not durable

**Evidence:** `apps/index/src/do/request-guard.ts:15` through its alarm handler.

Seen signatures, request quotas, push quotas, generic buckets, and inbox contents live only in Maps and arrays. Only the alarm time is persisted. Constructing a new guard against the same storage accepted a previously rejected signature and returned an empty inbox in the local simulation.

This matters during runtime restarts, relocation, deployment, or eviction within the accepted signature window. It also contradicts the claim that the inbox is the delivery of record. The probe simulated class reconstruction; it did not force a live Cloudflare eviction. Cloudflare explicitly states that in-memory state is discarded and critical information must be persisted in [Durable Object lifecycle documentation](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

**Fix:** persist replay entries with expiry, quota state where strict enforcement matters, and inbox entries in DO storage/SQLite. Use acknowledged delivery rather than destructive drain if requests must survive a failed response. Test reconstruction, restart, and retry behavior.

### S05 — High: authentication-strength claims overstate what happened

**Evidence:** `apps/mobile/src/biometrics/index.ts:35,50`; `apps/mobile/src/identity/store.ts:71,81`; `packages/protocol/src/sign.ts:185`; `apps/index/src/oidc/tokens.ts:27`.

The mobile app emits `hwk` despite signing with keys available to JavaScript. It derives face/fingerprint claims from supported authentication types, not the method that actually succeeded. `authenticate(..., false)` skips authentication but returns the same strong claims. Device-passcode fallback can therefore be described as face authentication. The server accepts client-supplied AMR without attestation enforcement or a policy tying ACR to demonstrated methods.

**Fix:** immediately report only supported, observed assurance; use software-key claims until a defensible hardware-backed design is implemented. Define what `idz:mfa` guarantees, enforce acceptable methods server-side, and distinguish trusted native authenticators from development/virtual clients. Expo SecureStore protects storage but does not turn a JavaScript Ed25519 private key into a non-exportable signing key; see [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).

### S06 — High privacy impact: the same device identifier is released to every site

**Evidence:** `apps/index/src/oidc/tokens.ts:31`; `apps/index/src/routes/oidc.ts` userinfo response; `spec/THREAT-MODEL.md` correlation claims.

Per-site subjects differ, but `idz_device` is the same database device ID in each site's ID token and userinfo response. Two colluding relying parties can correlate sign-ins from the same phone by comparing this field. Being opaque does not make an identifier unlinkable. A future shared `idz_org` can introduce a similar link.

**Fix:** remove global identifiers from relying-party responses or derive pairwise identifiers scoped to the client/sector. Reconcile protocol, documentation, tests, and migration behavior. Test the entire claim set for correlation, not just `sub`.

### S07 — High, deployment-dependent: arbitrary outbound request destinations

**Evidence:** `apps/index/src/push/index.ts:43` (`WebPushSender`); `apps/index/src/routes/sites.ts:9,23`; `apps/index/src/services/verification.ts:149`; `apps/index/src/oidc/backchannel.ts:52`.

An enrolled device can provide an HTTP(S) URL as a web push token. Site callbacks and webhook destinations accept arbitrary URLs. The index fetches these destinations without a destination policy, redirect restrictions, or explicit deadlines. This creates a blind SSRF surface and a way to make authentication wait on attacker-controlled services. Internal reachability depends on the deployment; self-hosting alongside other services increases the concern. Internal-service access was not tested.

**Fix:** disable development URL push delivery in production; validate callback ownership and HTTPS; enforce an egress policy that accounts for private/loopback addresses, DNS changes, and redirects. Add per-attempt deadlines and bounded retries. Use durable queued delivery for webhooks/logout, rather than awaiting uncontrolled network services in approval processing.

### S08 — High trust/abuse gap: open registration without domain ownership

**Evidence:** `apps/index/wrangler.jsonc:17`; `apps/index/src/routes/sites.ts:73`; `db/schema.ts:99`.

The checked-in hosted configuration sets `OPEN_SITE_REGISTRATION` to true. Registration accepts a chosen `rp_id`, display name, and redirects without proof of domain ownership. Because `rp_id` is unique, an attacker can squat an unregistered domain and present challenges bearing that domain's name. Existing registered domains cannot simply be duplicated; this is a first-registration/ownership problem.

**Fix:** close unrestricted production registration as immediate containment, then introduce authenticated ownership and domain verification. Restrict callback origins and reserve first-party names/domains. Add an administrative recovery process for disputed or lost registrations.

### S09 — Medium: SDK accepts logout JWTs as ID tokens

**Evidence:** `packages/sdk/src/server.ts:130`; `apps/index/src/oidc/tokens.ts:101`.

`verifyIdToken` verifies issuer/audience and checks only `sub` and `sid`; it does not distinguish ID tokens from other JWT types signed by the same issuer. A valid `logout+jwt` for the same client passed `verifyIdToken` in the local probe when nonce was omitted. The helper also does not require the full ID-token claim set or enforce the expected algorithm explicitly.

**Scope:** normal exchange calls that supply and validate a fresh nonce are protected from this particular substitution. Standalone helper consumers are exposed if they accept a supplied token without nonce and rely on this method as complete ID-token validation.

**Fix:** enforce token-specific validation, algorithm policy, required claims, and nonce where applicable. Test rejection of logout/access/webhook tokens as ID tokens. [JWT BCP](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.12) requires mutually exclusive validation rules for different JWT kinds.

### S10 — High correctness risk: approval has multiple authorities and non-atomic side effects

**Evidence:** `apps/index/src/services/assert.ts:104` onward; `apps/index/src/services/sessions.ts:34`; `apps/index/src/do/challenge-session.ts:141`; `apps/index/src/routes/oidc.ts` device check and session creation.

Binding/pairing creation and a success audit occur before the DO accepts approval. Verification completion writes `approved` and awaits a webhook before `stub.approve`. A competing denial or expiration can leave the verification approved while the challenge is denied/expired; failed completion can leave misleading audit/pairing side effects. The code also checks device activity separately from session insertion, leaving a revocation-versus-issuance race that deserves a targeted concurrency test.

These are source-confirmed ordering gaps; a concurrent race was not reproduced during this review. Existing database transactions and conditional terminal-state updates are useful but do not make the whole multi-store workflow atomic.

**Fix:** establish one authoritative state transition, immutable expected principal, and idempotent completion. Commit related database changes transactionally and deliver notifications through an outbox/queue. Coordinate device revocation with session issuance. Test interleavings of approve, deny, timeout, retries, revocation, and failed webhooks.

### S11 — Medium: push limits do not cover direct MFA issuance

**Evidence:** `apps/index/src/services/challenge.ts:106,116`; compare `apps/index/src/routes/discover.ts:43,71`.

Only discovery calls `allowPush`. Direct targeted `/challenge`, `/authorize`, and Verification API creation bypass that per-device check. The probe exhausted a device's push quota and then successfully started another pushed MFA challenge. Per-client and some IP quotas still limit traffic; this is not unlimited push access.

`/devices`, `/sites`, and `/token` also have no route-level IP limiter, and general request bodies and socket counts lack tight application-level caps. Self-host IP limiting trusts forwarding headers and skips unknown addresses.

**Fix:** enforce the device quota centrally in `pushChallenge`, then add endpoint-appropriate limits, body-size caps, resource quotas, and a documented trusted-proxy boundary.

### S12 — Medium: unrelated devices can deny targeted challenges

**Evidence:** `apps/index/src/routes/challenge.ts:152`.

The deny endpoint authenticates a device but does not check whether it is the device or identity targeted by the challenge. The probe used an unrelated identity to deny a victim-targeted MFA request. It requires knowing the challenge ID and provides denial of service, not authentication.

**Fix:** authorize denial against the immutable intended principal. For untargeted discovery, define a claim/ownership protocol rather than treating any enrolled device as the challenge owner.

### S13 — Medium: invalid PKCE attempts consume valid codes

**Evidence:** `apps/index/src/routes/oidc.ts` call to `redeemCode` before redirect/PKCE validation; `apps/index/src/do/challenge-session.ts:171`; `apps/index/src/routes/challenge.ts:98`.

Redemption marks a code used before verifying the redirect and PKCE verifier. Someone who learns the challenge ID can poll the public result to obtain the code and burn a public-client login by submitting the wrong verifier. Confidential-client authentication limits that attack for confidential clients. Expiration also depends on cleanup rather than a direct code expiry comparison.

**Fix:** validate and consume atomically within the code's authoritative state holder, including client, redirect, PKCE, and explicit expiry. Separate browser-management capabilities from the challenge ID shown to phones/QR readers.

### S14 — Medium: generated integrations lose revocation across processes

**Evidence:** `packages/cli/src/templates/next.ts:71`; `packages/cli/src/templates/express.ts` `revokedSids` set.

Generated relying-party integrations maintain revoked session IDs in process memory. A restart or another application instance accepts sessions that a different instance revoked. The Next template's signed sessions last seven days. The comment acknowledges a future session store, but the copyable integration does not deliver reliable backchannel revocation by default.

The Next transaction cookie also lacks `Secure`, and the Express callback does not regenerate the application session ID after authentication.

**Fix:** use durable shared sessions/revocation state; separate cookie-signing credentials from the OIDC client secret; provide secure cookie settings and session regeneration in the generated path. Test multi-instance logout and restart.

## Technical and operational gaps

**Native build reproducibility — high priority.** `apps/mobile/.gitignore:3,4` uses unanchored `ios/` and `android/`, which also ignore `modules/idz-ble-peripheral/ios` and `/android`. Git confirms the local Swift/Kotlin source and native build files are ignored and absent from tracked files. A clean checkout lacks the module implementation. Anchor generated-project exclusions and explicitly include module source, then build both platforms from a clean checkout. Current JavaScript tests use mocks and do not establish native correctness.

**Database scaling — high priority before growth.** `listActiveBleDevices` reads every active BLE-enabled device and `resolveBleId` computes candidate HMACs for each discovery request. This is O(number of devices) work on a public endpoint. Device-by-identity, pairing-by-device, session-by-identity/device, and pending-verification lookups also lack dedicated indexes in the checked-in schema; the only explicit secondary index is the audit identity/time index. Design bounded indexed BLE lookup, add indexes justified by query plans, and load-test actual concurrency and data sizes.

**Lifecycle and recovery.** Index-signing-key rotation requires re-pinning phones and is an acknowledged open item. There is no complete recovery path for a compromised master seed that preserves relying-party accounts while excluding the attacker. The existing restore path chooses the oldest active device for targeted challenges, which can strand requests on an abandoned but unrevoked phone. Define replacement, trusted-device notification, compromise recovery, and operator key-loss procedures before broad adoption.

**Public-client administration.** Public clients receive no secret, while site management always requires one (`routes/sites.ts:49`). There is no owner/admin credential allowing a public SPA to update redirects or other registration metadata. Model owner administration separately from OAuth client authentication. The unique `rp_id` also prevents multiple independent clients for one domain without a sector/client ownership design.

**Mobile recovery-phrase access — requires device validation.** `apps/mobile/app/phrase.tsx:11` reads the phrase immediately; its app-level gate exists only in the Settings navigation handler. On storage configurations that fell back to a non-biometric SecureStore entry, directly reaching that route can bypass the navigation gate. Gate the sensitive route/read itself, validate deep-link entry paths, and clear phrase state on backgrounding. Changing `biometricRequired` currently changes AsyncStorage settings without rewrapping the stored seed. Test passcode-only devices, changed biometric enrollment, locked/background states, and disabled biometrics. Hardware-backed storage must be validated on real devices.

**Headers and browser management.** The hosted login sets no-store, no-referrer, and frame denial, which is good. It has no CSP, and dashboard `_headers` contains association/install metadata only. Define CSP and anti-framing policy for the management app and login page, and no-store on sensitive API responses. Dashboard tokens in sessionStorage make XSS particularly consequential. I did not identify a demonstrated dashboard XSS, and permissive CORS alone is not a credential bypass because requests still need credentials.

**Notification reliability.** Webhooks/logout have a few in-process retries with no durable retry record, replay tracking, dead-letter handling, or explicit deadlines. Failed logout results can be silently discarded. Expo tickets are checked but final delivery receipts/token cleanup are not implemented. Real Web Push subscriptions are explicitly unsupported. Add idempotent queued delivery, delivery status, bounded concurrency, and alerts; preserve polling as a durable fallback.

**Data lifecycle and operating controls.** Documentation explicitly says there is no scheduled deletion for expired sessions, verification records, or audit events. Deletion/export is a manual request process without an implemented end-to-end workflow visible in the public code. Define retention, audited deletion, backup expiry, and restore tests. Verify actual alerts, backup policy, point-in-time recovery, secret rotation, WAF limits, and deployment access outside the repository; documentation alone does not establish that these operate.

**Self-host defaults.** `docker-compose.yml` publishes PostgreSQL on all host interfaces with a fixed development password, while the same file is advertised for self-hosting. The image runs as root and launches `wrangler dev`. Separate development and production deployment definitions; keep the database private, use unique credentials and least privilege, and validate a supported production runtime/configuration. Do not assume a working development container proves production readiness.

**Authorization product scope.** A signed 140-character reason is useful tamper detection, but does not prove that a relying party executes the same operation. For payments or agent permissions, define structured canonical operation data, resource/action/amount constraints, an operation identifier, expiry, single-use consumption, and server-side enforcement. Browser `onApproved` callbacks and the demo bank's local/session storage are demonstrations, not an authorization boundary. Enterprise policy/RBAC, attestation enforcement, and organizational lifecycle are not complete merely because schemas or roadmap pages mention them.

## Dependencies and verification

`npm audit --omit=dev --json` reported **26 affected package entries: 6 high, 17 moderate, 3 low, 0 critical**. These are dependency-tree entries, not 26 proven reachable application exploits. High entries were Astro 5.18.2, nested Miniflare 4.20260114.0, PostCSS 8.4.31, Sharp 0.34.5, Undici 7.14.0, and ws 8.18.0. Some are build/dev-server tooling pulled through production dependency declarations; Next is the e2e sample. Reachability must be assessed separately for hosted Worker bundles, builds, and the self-host image. The raw report contains advisory links and paths in [npm-audit.json](npm-audit.json).

The root audit gate uses `--audit-level=critical`, so these high findings do not fail that configured gate. Raise the threshold with explicit reviewed exceptions, assign an owner/update cadence, and include build-tool exposure. Do not apply blind force upgrades: npm proposes a major Expo downgrade for part of this graph.

| Check | Observed result |
| --- | --- |
| Protocol unit tests | 50 passed; 99.74% statement/line coverage, 93.58% branch coverage |
| SDK unit tests | 18 passed |
| Mobile Jest tests | 38 passed across 9 suites; native behavior remains mocked |
| Project typecheck | 21 tasks successful, 16 served from Turbo cache |
| Lint | One error in a concurrently added OIDC conformance test; no green full lint claim |
| Initial full backend suite | Blocked by missing tables in the isolated database; failures are not counted as application regressions |
| Isolated backend review probes | 5/5 reproduced vulnerable behavior after schema initialization inside the review database |
| SDK/restart local probes | Logout accepted as ID token; replay accepted and inbox lost on class reconstruction |
| Browser e2e, native builds, live load/penetration tests | Not run as part of this review |

Probe sources are preserved as `.txt` artifacts so intentionally vulnerable expectations do not enter normal CI: [backend probes](backend-security-probes.test.ts.txt), [runtime probes](runtime-security-probes.mjs.txt), and [backend output](backend-probes.log). The backend source was run at `apps/index/test/security-review.test.ts` with `DATABASE_URL` and `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` explicitly set to the isolated `identizen_security_review_20260906` database. It asserts that database name before touching data. The runtime source was run as `security-review-runtime.mjs` from the repository root with no outbound network. The temporary review database is left available for reproduction.

The full original gate was not established green. A separate immutable checkout and disposable test database should be used for final release validation, especially while other work is changing this workspace.

## What is already good

The project centralizes protocol cryptography instead of scattering custom implementations. It uses established Ed25519/HKDF/hash libraries, domain-separated signatures, random nonces, canonical payloads, per-site key derivation, and shared vectors. The phone verifies signed challenges against a pinned index key. Assertion validation covers relying party, nonce, challenge, ACR, reason hash, subject/key relationship, and both signatures. OIDC has code flow/PKCE, asymmetric signing, audience/issuer validation for access tokens, and server-side session-liveness checks. Database revocation cascades and binding conflict handling are useful foundations. Strict schemas, TypeScript, broad unit tests, documentation, and a threat model make the problems tractable.

These strengths explain why isolated cryptographic tests can be excellent while end-to-end authorization is still unsafe: the missing checks are mostly between otherwise well-implemented components.

## Recommended sequence and release criteria

1. **Contain first:** close unrestricted registration and arbitrary URL push in production; restrict sensitive MFA/verification integrations until S01/S02 are fixed; correct unsupported hardware/biometric and cross-site privacy claims.
2. **Repair authentication boundaries:** immutable expected subjects/identities; shared OIDC validation; authorized deny/discovery; revocation-safe enrollment; token-type validation; central push quotas; atomic code redemption.
3. **Make state and delivery reliable:** durable replay/inbox storage, one authoritative approval transition, transactional side effects/outbox, reliable revocation propagation, and operation idempotency.
4. **Make releases reproducible:** track native implementations, validate clean iOS/Android builds, triage dependencies, run the entire gate in isolation, and cover the security cases above with tests that assert rejection of attacks.
5. **Prove operational readiness:** load tests and query plans, backup/restore drills, retention/deletion implementation, key-rotation rehearsal, alerts, and independent authentication/protocol review.

Release should require all critical/high authorization defects closed, negative regression tests passing, clean-build reproducibility, demonstrated revocation/restart behavior, and documented limits on assurance. The current evidence supports controlled development and evaluation; it does not support relying on this implementation for high-consequence authentication or approvals yet.
