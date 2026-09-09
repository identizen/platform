# Identizen security reassessment

Reviewed 8 September 2026 at commit `c5429ccfd8f87611da6df3779f4d78684bacda93`.

**Decision: Identizen is not ready for high-assurance authentication, MFA, or transaction approval.** The September changes close most of the previously reported direct authorization defects, and the focused regression suite is green. This reassessment nevertheless reproduced four high-severity authentication/state-integrity defects, one high-severity outbound-request defect, a cross-client denial-of-service issue, and an unresolved high-advisory dependency backlog.

The most urgent containment is to prevent hosted callers from creating `idz_test_` clients for arbitrary real domains. Release should then be held until device revocation, enrollment, and approval are made race-safe.

## Scope and method

This was an owner-authorized, white-box security assessment of the monorepo plus low-impact checks against the public Identizen endpoints. It used:

- OWASP Top 10:2025 category coverage;
- OWASP API Security Top 10:2023 category coverage;
- applicable OWASP ASVS 5.0 verification areas;
- OWASP WSTG technique families;
- OWASP MASVS control groups for the Expo mobile client;
- source review of trust boundaries, authentication, OIDC, cryptography, storage, Cloudflare Workers and Durable Objects, database queries, generated relying-party integrations, and deployment configuration;
- isolated PostgreSQL/Miniflare adversarial tests, dependency analysis, secret-pattern scanning, browser security tests, and low-impact public HTTP checks.

The review did not mutate production data, create production users, send pushes, exercise real relying-party accounts, perform denial-of-service/load testing, inspect the Cloudflare account/WAF/Access configuration, verify deployed-source parity, or test iOS/Android native behavior on physical devices. It is therefore a comprehensive code and limited black-box penetration assessment, not a certification of every production control.

OWASP references: [Top 10:2025](https://owasp.org/Top10/), [API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), [ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/), [WSTG](https://owasp.org/www-project-web-security-testing-guide/), and [MASVS](https://mas.owasp.org/MASVS/).

## Confirmed findings

### F01 — High: production test clients can impersonate any relying-party domain

**Evidence:** `apps/index/src/services/site-verification.ts:50-57`; `apps/index/src/routes/sites.ts:37,130-151`.

The public registration request chooses `environment: "test"`. That creates an `idz_test_` client, and every client with that prefix bypasses domain verification, including a client claiming `bank.example` or another public domain. The phone can therefore be shown an attacker-controlled registration carrying a trusted site's domain identity. Because pairwise subjects are scoped by `rp_id`, the attacker's client also receives the same subject value the legitimate domain receives.

The probe created an unauthenticated test client for a real-looking external domain, completed a login, and confirmed the subject matched a legitimate registration for that domain. The resulting token remains audience-bound to the attacker's client; this is a relying-party identity/phishing and correlation failure rather than direct token substitution at the legitimate client. A person must still approve the misleading request.

**Fix:** hosted registration must force live registrations for non-local domains. Restrict test clients to loopback/development environments or an authenticated tenant-owned sandbox namespace. Apply domain proof based on the claimed domain and deployment policy, not a caller-selected client prefix. Reject existing unverified production test registrations before they can start challenges.

**OWASP:** A01 Broken Access Control, A06 Insecure Design, A07 Authentication Failures; API2, API6, API8.

### F02 — High: device revocation can race token/session issuance

**Evidence:** `apps/index/src/routes/oidc.ts:250-269,361-368`.

The token route reads an active device, calls an asynchronous session-creation hook, and inserts the session afterward. Revocation between the activity check and insert removes existing sessions, but the later insert creates a fresh active session. Userinfo validates session liveness without checking the associated device again.

The adversarial hook revoked the device at this exact boundary. Token exchange still succeeded and the new access token remained usable at userinfo. The hook provides deterministic reproduction of an interleaving that can also occur through concurrent requests.

**Fix:** serialize revocation with session issuance using one database transaction and a lock, a device revocation generation checked at insert, or an equivalent conditional insert that cannot succeed after revocation. Check device status during bearer-token use as defense in depth. Add concurrent tests for revocation before, during, and after code redemption and session creation.

**OWASP:** A06 Insecure Design, A07 Authentication Failures, A10 Mishandling of Exceptional Conditions; API2.

### F03 — High: a denied challenge can leave an active pairing and success audit

**Evidence:** `apps/index/src/services/assert.ts:155-212`; `apps/index/src/routes/challenge.ts:150-168`.

Assertion processing creates the binding and pairing, updates device activity, and records `login.success` before the Durable Object accepts the terminal approval. If denial wins the race, final approval fails while those durable side effects remain.

The probe denied the challenge immediately before `completeApproval`. The challenge ended denied, yet the database contained an active pairing and a success audit. This can create authorization material from an operation whose authoritative state says it did not succeed.

**Fix:** establish a single authoritative transition. Reserve/approve idempotently before committing success side effects, then write binding, pairing, session/verification state, and audit in a coordinated transaction or saga with compensation. Publish notifications through an outbox after commit. Test approve/deny/expiry/retry interleavings.

**OWASP:** A01 Broken Access Control, A06 Insecure Design, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions; API2.

### F04 — High: concurrent enrollment duplicates a device credential and defeats revocation

**Evidence:** `db/schema.ts:74-85`; `db/src/queries/devices.ts:24-53`; `apps/index/src/routes/devices.ts:85-91,131-136`.

Registration performs an application-level lookup by `device_pubkey` and then inserts a row, but the database has no unique constraint on the key. Concurrent requests can both see no existing row and create two active device records for the same private key. Revoking one record leaves the duplicate active.

The probe submitted concurrent, valid enrollments, observed two rows for one key, revoked one row, and authenticated with the other. The earlier replay fix protects sequential registration but does not provide database-enforced uniqueness.

**Fix:** add a unique database constraint/index over the canonical device public key, make enrollment an idempotent insert/upsert, and preserve revoked-key tombstones so ordinary enrollment cannot reactivate a credential. Handle constraint conflicts by returning the authoritative existing record and status.

**OWASP:** A06 Insecure Design, A07 Authentication Failures, A10 Mishandling of Exceptional Conditions; API2.

### F05 — Medium: another OAuth client can turn a spent code into victim-session revocation

**Evidence:** `apps/index/src/do/challenge-session.ts:240-256`; `apps/index/src/routes/oidc.ts:225-240`.

`redeemCode` checks `codeUsed` before checking the requesting client. For a spent code it returns the session ID created by the first exchange. The token route then revokes that session as a code-reuse response. A different public client can therefore present a victim's spent code and trigger revocation without authenticating as the client to which the code was issued.

The probe exchanged a confidential client's code normally, then submitted the spent code with a separate public client. The victim session was revoked. Exploitation requires learning the spent code/challenge material, so the demonstrated impact is targeted denial of service and a session-existence oracle.

**Fix:** establish client/code/redirect binding before returning any reuse signal, and only apply reuse revocation for an authenticated, matching client context. Keep the session ID internal to the code's authority and do not disclose it through a cross-client failure path.

**OWASP:** A01 Broken Access Control, A10 Mishandling of Exceptional Conditions; API2, API5.

### F06 — High for self-hosting, medium on the current Cloudflare deployment: outbound policy remains bypassable and body reads are unbounded

**Evidence:** `apps/index/src/lib/outbound.ts:25-71,103-120`.

The policy blocks literal local/private addresses but deliberately does not resolve DNS. It also does not normalize a trailing root dot before local-hostname matching, so `https://localhost./` is accepted. A public hostname can change or resolve to a private target in environments where egress permits it.

The timeout is cleared as soon as `fetch` returns response headers. Callers that subsequently read the body can wait indefinitely and buffer an unbounded response. The probe confirmed both the `localhost.` policy bypass and a body that remained pending after the configured deadline. Redirect following is correctly disabled.

**Fix:** canonicalize hostnames, reject trailing-dot/local aliases, and enforce a deployment-level egress allowlist or DNS/IP validation that cannot be changed between validation and connection. Keep the abort signal active through body consumption, cap response bytes, cancel the reader on expiry, and bound retries/concurrency. Treat Cloudflare and self-host policies separately where platform capabilities differ.

**OWASP:** A06 Insecure Design, A10 Mishandling of Exceptional Conditions; API4, API7, API10.

### F07 — High advisory backlog: production dependency audit reports six high vulnerabilities

**Evidence:** `review/2026-09-08/audit-production.log`.

`npm audit --omit=dev` reports **26 affected dependency entries: 6 high, 17 moderate, 3 low, 0 critical**. Direct packages include Astro 5.18.2 (high), `@astrojs/cloudflare` 12.6.13, Starlight 0.36.3, Expo 57.0.19, Expo Router 57.0.18, Expo Splash Screen 57.0.8, and Next 15.5.25. Astro advisories include high-severity reflected XSS and host-header SSRF. High transitive entries include Miniflare, PostCSS, Sharp, Undici, and ws.

The count describes dependency-tree exposure, not 26 proven reachable exploits. Some paths are build/dev tooling or e2e applications. Astro is a direct dependency of hosted documentation/marketing builds, so the backlog still needs release-blocking reachability triage.

**Fix:** upgrade Astro and its Cloudflare/Starlight integrations together, validate the generated sites, then update the Expo and Next trees with reviewed migrations. Record explicit temporary exceptions only after checking whether affected code is bundled, deployed, or reachable. Change the audit gate so reviewed high vulnerabilities cannot silently pass.

**OWASP:** A03 Software Supply Chain Failures, A08 Software or Data Integrity Failures.

### F08 — Medium: browser/API hardening is inconsistent and CORS reflects every origin

**Evidence:** `apps/index/src/app.ts:38-41`; `review/2026-09-08/public-endpoints.json`.

The dashboard returns a strong CSP, HSTS, `nosniff`, frame denial, and referrer policy. The marketing and documentation origins returned none of those headers in the public check. Index JSON endpoints also omitted HSTS, `nosniff`, and referrer policy. The index globally reflects any request origin in `Access-Control-Allow-Origin`, including on bearer-authenticated management routes.

Reflected CORS alone did not bypass authentication and credentials are not enabled. It expands the set of browser contexts allowed to call the API and increases the impact of a leaked bearer token or browser compromise. Missing CSP is more material while direct Astro XSS advisories remain unresolved.

**Fix:** apply a common header baseline to all browser origins and appropriate API headers at the edge. Use an explicit origin policy by route/client instead of reflection. Keep token responses `no-store`, as currently observed.

**OWASP:** A02 Security Misconfiguration; API8.

### F09 — Medium: public resource controls are incomplete

**Evidence:** `apps/index/src/middleware/idz-signature.ts:36`; `apps/index/src/middleware/principal.ts:38`; `apps/index/src/middleware/rate-limit.ts:38`; `apps/index/src/routes/discover.ts:53`.

Signed-request middleware buffers the full request body without an application size cap. BLE discovery enumerates all active BLE devices and computes candidates, making a public request O(number of devices). The self-host rate limiter accepts `x-forwarded-for` without an enforced trusted-proxy boundary. Existing IP/client/device buckets and durable quota storage are useful but do not bound these costs.

No production load test was performed because that would affect service availability.

**Fix:** enforce route-specific body, socket, concurrency, and response limits before buffering; redesign BLE lookup for bounded indexed work; and trust forwarding headers only from a configured proxy chain. Load-test in a controlled environment at realistic database sizes.

**OWASP:** A06 Insecure Design; API4, API8.

### F10 — Medium: generated integrations still use process-local revocation by default

**Evidence:** `packages/cli/src/templates/express.ts:33-36`; `packages/cli/src/templates/next.ts:53-60`.

The generated Express and Next integrations keep revoked session IDs in a `Set`. Restarting or routing to another instance loses revocation. Recent changes improved cookie settings, session regeneration, and documentation, but the generated secure path remains unsafe for multi-instance production unless the adopter replaces the default.

**Fix:** require or scaffold a durable shared revocation/session adapter for production mode, fail clearly when a process-local store is used outside development, and test restart and multi-instance logout behavior.

**OWASP:** A07 Authentication Failures, A08 Software or Data Integrity Failures; API2.

### F11 — Low: the Worker compatibility date is more than a year old

**Evidence:** `apps/index/wrangler.jsonc:5-8`.

The checked-in compatibility date is `2025-08-01`. Current Workers types are recent and observability is enabled, but the runtime behavior pin is stale. This can postpone security-relevant platform changes and makes future upgrades larger.

**Fix:** advance the compatibility date on a regular tested cadence and run the security/OIDC suites against it before deployment.

**OWASP:** A02 Security Misconfiguration; API8, API9.

## OWASP coverage matrices

### OWASP Top 10:2025

| Category | Result | Evidence |
| --- | --- | --- |
| A01 Broken Access Control | Fail | F01, F03, and F05; cross-identity/device management negative controls passed |
| A02 Security Misconfiguration | Fail | F08 and F11; dashboard headers are strong |
| A03 Software Supply Chain Failures | Fail | F07; production audit has 6 high entries |
| A04 Cryptographic Failures | Pass with mobile assurance gap | ES256/Ed25519 verification, domain separation, nonce/PKCE, no private JWKS material; no independent cryptographic proof or hardware-key validation |
| A05 Injection | Pass for tested paths | SQL injection payload persisted as data; strict schemas and parameterized queries observed; dependency XSS remains under A03/F07 |
| A06 Insecure Design | Fail | F01-F04, F06, F09 |
| A07 Authentication Failures | Fail | F01, F02, F04, F10 |
| A08 Software or Data Integrity Failures | Partial/fail | Lockfile and signature design are present; F07 and F10 remain |
| A09 Security Logging and Alerting Failures | Partial/fail | Audit records exist, but F03 creates a false success record; deployed alerting was not verified |
| A10 Mishandling of Exceptional Conditions | Fail | F02-F06 demonstrate unsafe concurrent/error paths |

### OWASP API Security Top 10:2023

| Category | Result | Evidence |
| --- | --- | --- |
| API1 Broken Object Level Authorization | Pass for tested controls | Cross-identity management and unrelated-device denial tests passed |
| API2 Broken Authentication | Fail | F01-F05 and F10 |
| API3 Broken Object Property Level Authorization | Pass for reviewed routes | Strict request schemas and explicit response shapes; no mass-assignment exploit found |
| API4 Unrestricted Resource Consumption | Fail | F06 and F09 |
| API5 Broken Function Level Authorization | Partial | Dashboard allowlist and device/principal middleware work; F05 crosses client authority |
| API6 Unrestricted Access to Sensitive Business Flows | Fail | Public arbitrary-domain test registration in F01 |
| API7 Server Side Request Forgery | Fail | F06 |
| API8 Security Misconfiguration | Fail | F08, F09, F11 |
| API9 Improper Inventory Management | Partial | Public OIDC metadata and documented routes are consistent; deployed inventory/version retirement was not verified |
| API10 Unsafe Consumption of APIs | Fail | F06 unbounded and insufficiently constrained outbound responses |

### WSTG and ASVS coverage

| Verification area | Result |
| --- | --- |
| Information gathering and exposed metadata | Public discovery/JWKS/health and application headers checked; no private JWK material found |
| Configuration and deployment | Fail: F08, F11; Cloudflare account settings and deployed-source parity unavailable |
| Identity management | Fail: F01 and F04; earlier cross-identity approval defect is fixed |
| Authentication and OAuth/OIDC | Fail: F01, F02, F05; PKCE, redirect, claim, and token-type regression tests pass |
| Authorization | Fail: F03/F05; tested tenant/device negative controls pass |
| Session management | Fail: F02, F05, F10; server-side liveness and backchannel mechanisms exist |
| Input validation and injection | Mostly pass: strict schemas/SQL parameters; F06 URL canonicalization fails |
| Error and exceptional-condition handling | Fail: F02-F06 |
| Cryptography and secure communication | Source controls pass; physical-device key protection and infrastructure TLS policy not independently validated |
| Business logic | Fail: F01-F05 and F09 |
| Client-side security | Dashboard CSP tests pass; marketing/docs headers and dependency XSS advisories fail |
| API/web-service security | Fail per API matrix above |
| Logging, privacy, and data protection | Partial: pairwise device identifiers are fixed; false-success audit in F03 and operating controls remain |

ASVS 5.0 was applied at the control-family level across validation/business logic, frontend, APIs, authentication, sessions, authorization, self-contained tokens, OAuth/OIDC, cryptography, communications, configuration, data protection, architecture, and logging/error handling. A claim of formal ASVS Level 2/3 compliance would require a frozen release, production evidence, and control-by-control evidence collection beyond this engagement.

### OWASP MASVS mobile coverage

| MASVS group | Result |
| --- | --- |
| STORAGE | Partial: SecureStore is used; recovery-phrase route/background behavior and backup semantics need real-device validation |
| CRYPTO | Source pass: established primitives and vectors; native/hardware-backed key properties unverified |
| AUTH | Partial: biometric AMR overclaim was corrected; enrollment/revocation server races remain |
| NETWORK | Partial: HTTPS index defaults; certificate pinning and hostile-network behavior not validated |
| PLATFORM | Unverified: BLE/deep-link/native module behavior was not tested on physical iOS/Android devices |
| CODE | JavaScript tests pass; clean native release builds and runtime instrumentation were outside scope |
| RESILIENCE | Gap: no demonstrated anti-tamper/root/jailbreak strategy, which may be acceptable only if documented in the assurance model |
| PRIVACY | Improved: pairwise device claim is covered by regression tests; analytics/log/OS-backup behavior remains to validate |

## Prior finding disposition

| 6 September finding | Current disposition |
| --- | --- |
| S01 cross-identity approval | Fixed; targeted and untargeted negative tests pass |
| S02 JSON redirect bypass | Fixed; shared redirect/PKCE/scope tests pass |
| S03 revoked-key re-enrollment | Sequential replay fixed; concurrent duplicate-key race remains as F04 |
| S04 volatile guard state | Fixed; rebuild/replay/quota/inbox tests pass |
| S05 AMR overclaim | Server/client claims corrected; physical-device assurance remains unverified |
| S06 global device correlation | Fixed; pairwise device identifiers tested across two sites |
| S07 unrestricted outbound destinations | Partially fixed; redirects/local literals blocked, F06 remains |
| S08 unverified open registration | Live registrations fixed; caller-selected test registration bypass remains F01 |
| S09 SDK JWT-type confusion | Fixed by token-specific validation tests |
| S10 non-atomic approval | Confirmed and split into F02/F03 |
| S11 incomplete push quota | Fixed; direct step-up and Verification API quota tests pass |
| S12 unrelated denial | Fixed; intended-principal tests pass |
| S13 non-atomic code consumption | PKCE/redirect consumption fixed; cross-client reuse handling remains F05 |
| S14 in-memory generated revocation | Cookie/session handling improved; durable default remains F10 |

## Verification results

Passing adversarial tests intentionally prove that the vulnerable behavior occurred. They are not security passes.

| Check | Result |
| --- | --- |
| Independent adversarial probes | 8/8 executed: 6 reproduced findings, 2 negative-control groups passed |
| Focused security regression suite | 30/30 passed |
| Protocol unit tests | 51/51 passed |
| SDK unit tests | 20/20 passed |
| CLI unit tests | 7/7 passed |
| Dashboard unit tests | 21/21 passed |
| Web header unit tests | 4/4 passed |
| Mobile Jest tests | 78/78 across 12 suites; native behavior mocked |
| Browser security tests | 2/2 passed |
| Lint | Passed with zero warnings |
| Typecheck | 22/22 workspace tasks passed |
| Selected package builds | Protocol, DB, and SDK passed |
| Full isolated backend run | 169 passed, 12 did not complete after a late workerd `Maximum call stack size exceeded`; focused security suites pass independently |
| Production dependency audit | Failed: 26 entries, including 6 high |
| Public endpoint checks | 9/9 returned expected status; OIDC metadata consistent; JWKS has two public ES256 keys |
| Tracked secret-pattern scan | No matching private keys or common live-token formats; tracked production env files contain documented public values only |

Reproduction artifacts:

- `apps/index/test/security-audit-20260908.test.ts` — six adversarial reproductions and negative controls;
- `review/2026-09-08/adversarial.log` — probe output;
- `review/2026-09-08/security-regressions.log` — focused regression output;
- `review/2026-09-08/backend-isolated.log` — full backend attempt;
- `review/2026-09-08/audit-production.log` — raw npm audit JSON;
- `review/2026-09-08/public-endpoints.json` — public response/header evidence;
- the remaining logs in this directory — unit, browser, lint, and typecheck evidence.

The audit runner pins an isolated database and is in `review/2026-09-08/run-review.mjs`. No tracked application source was changed by this assessment.

## Release criteria

1. Disable arbitrary-domain hosted test registration and invalidate existing unverified test registrations (F01).
2. Make session issuance, device revocation, device-key enrollment, and approval side effects race-safe (F02-F04).
3. Bind code-reuse handling to the authoritative client and harden all outbound fetches through response completion (F05-F06).
4. Resolve or formally reachability-triage all high dependency advisories and apply the browser/API header baseline (F07-F08).
5. Add bounded resource controls, a durable generated revocation path, and a compatibility-date upgrade cadence (F09-F11).
6. Rerun the adversarial cases with rejection expectations, the complete backend suite in fresh runtimes, controlled load tests, physical-device MASVS tests, and an authorized production configuration review.

Production readiness for high-consequence authentication should require zero open critical/high authorization findings, deterministic revocation under concurrency, a fully green isolated release gate, and evidence that deployed Cloudflare/mobile controls match the reviewed configuration.
