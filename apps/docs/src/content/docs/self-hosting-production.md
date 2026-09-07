---
title: Running an index in production
description: What is state and what is not, the two keys and what happens if you lose one, upgrades, monitoring, backups, and how a site moves from the hosted index to its own.
---

[Self-hosting](/self-hosting/) gets an index running. This page is what to know after that. Both deployments, Cloudflare Workers and Docker, run the same Worker, so everything here applies to both.

## What is state

| Where           | What                                                                                                                                                                                                                                                                                                                | Treatment                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres        | `identities`, `devices`, `sites`, `site_bindings`, `pairings`, `sessions`, `verifications`, `audit_events`, `orgs`                                                                                                                                                                                                  | The only persistent store. Back it up.                                                                                                                                |
| Durable Objects | `ChallengeSession`: one in-flight login (the signed challenge, its OIDC parameters, one authorization code) for 60 seconds, wiped five minutes after it resolves. `RequestGuard`: per-device replay window, push counter, and an inbox of at most 50 challenge ids                                                  | Transient. Losing it aborts logins that are in flight and nothing else. In Docker it lives under `/data` (the `dostate` volume); on Cloudflare it is managed for you. |
| Worker secrets  | `INDEX_SIGNING_KEY`, `OIDC_SIGNING_KEYS`, `SITE_REGISTRATION_TOKEN`, push credentials                                                                                                                                                                                                                               | Not in Postgres. Keep a copy in your secret store. The first two are covered below.                                                                                   |
| Configuration   | `INDEX_URL`, `APP_URL`, `PUSH_PROVIDER`, `OPEN_SITE_REGISTRATION`, `DASHBOARD_CLIENT_IDS`, rate limits. `OIDC_PKCE_OPTIONAL` and `OUTBOUND_ALLOW_LOCAL` must be unset and `SITE_VERIFICATION` left at `required`: the index then only calls public https destinations, with a five-second deadline and no redirects | Environment variables in `wrangler.jsonc` `vars` or on the `index` container. Keep them in version control.                                                           |

The index stores no private keys and no plaintext secrets: client and webhook secrets are stored as hashes, and the phone's keys never leave the phone.

## The two keys

### `INDEX_SIGNING_KEY`

The 32-byte Ed25519 key that signs every challenge and every browser pairing. When a phone registers (`POST /devices`) the response carries `index_pubkey`, and the app stores it next to the index URL. From then on the app fetches each challenge from the index and verifies the signature against that stored key and that URL. A challenge signed by any other key is rejected on the phone with `challenge rejected: bad_index_signature`. The app writes the pinned key only during registration; there is no re-pin flow. `GET /.well-known/identizen` publishes the current public key, so you can record what phones will pin.

If the key is lost, generating a new one means every phone registered before the change rejects every challenge from your index. Recovery is per phone, and it is the same as a lost phone:

1. In the app, Settings → **Forget identity on this phone**.
2. Restore from the 24 words. This creates a new device record with the same seed.
3. Set the index URL in Settings if it is not the default, then tap **Register this phone** on Home. The phone registers a new `device_id` and pins the new key.

The person's `sub` at every site is unchanged because it derives from the seed and the site's `rp_id`. Their old device row stays `active` on the index until they revoke it from the new phone's Devices tab or the dashboard. Until then a browser paired to the old device pushes each login to a device that no longer exists and the login times out, so revoking is part of the procedure; revocation ends the old pairings and sessions, and those browsers show the QR once and pair again. There is no way to do this for everyone at once. Back this key up first. Rotating it without a re-pin is open item 1 in the [threat model](/protocol/threat-model/).

### `OIDC_SIGNING_KEYS`

The ES256 keys that sign id_tokens, access tokens, logout tokens, and verification webhooks. Rotation is supported and described on [Self-hosting](/self-hosting/#cloudflare-workers): prepend a new JWK, deploy, drop the old key after an hour. Losing this key is recoverable: generate a new pair, deploy, and every token issued so far fails verification. Access tokens live one hour, id_tokens one hour, logout tokens two minutes, webhook JWTs ten minutes, so the damage is bounded by those windows.

## Upgrades

Migrate, then deploy:

```bash
git pull
DATABASE_URL="postgres://…" npm run migrate -w @identizen/db
npx wrangler deploy -c apps/index/wrangler.jsonc     # or rebuild the container
```

- Migrations are Drizzle SQL files in `db/migrations`, applied in journal order by `drizzle-orm`'s migrator. Running them again is a no-op, so the command is safe to repeat.
- The self-host container runs the migrator on every start before it launches the Worker, so `docker compose --profile selfhost up --build` is the whole procedure there.
- Every migration so far is additive: `0000_init` creates the schema, `0001` adds two nullable columns to `pairings`. An old Worker keeps working on a newer schema. A migration that removes or renames a column will say so in the release notes with the order to follow.
- Never point `e2e/reset-db.ts` at a production database. It drops the `public` schema.
- To roll back the Worker, deploy the previous commit. The schema stays migrated.

After a deploy check `GET /health`, `GET /.well-known/openid-configuration` (the `issuer` must equal `INDEX_URL`), and `GET /.well-known/identizen` (the `index_pubkey` must be the one your phones pinned).

## What to monitor

**Health.** `GET /health` returns `{ ok, service, issuer, database }` with `200`, or `503` with `database: "error"` when `select 1` fails. The Docker healthcheck polls it every 10 seconds. Alert on anything other than `200`.

**Logs.** `wrangler.jsonc` sets `observability.enabled: true`, so Workers Logs receives the Worker's output. Lines worth an alert: `unhandled error` (a request failed with a non-API error), `push to <device> via <provider> failed` (the phone still gets the challenge through its inbox, but the push provider is unhappy), `background task failed`, and `backchannel logout pending OIDC keys`.

**Error codes.** The full list is on the [Errors](/errors/) page. The ones that mean load or abuse: `rate_limited` (429, more than `RATE_LIMIT_REQUESTS_PER_IP` challenge or discovery calls from one IP per minute, default 60), `client_rate_limited` (429, one site started more than `RATE_LIMIT_CHALLENGES_PER_CLIENT` logins per minute, default 300), `push_rate_limited` (429, more than 10 pushes to one device per minute). Per-IP limits and the pairing `last_ip` read `CF-Connecting-IP`, then `X-Forwarded-For`. Behind your own proxy in Docker, make sure one of them is set, or nothing is limited by IP.

**Audit events.** Every login, denial, enrollment, pairing, session, verification, site change, and revocation writes a row to `audit_events` with a `kind` and a `detail` JSON object. The API exposes only the caller's own last 100 events (`GET /me/audit`); as the operator you read the table:

```sql
select kind, count(*) from audit_events
where at > now() - interval '1 hour'
group by kind order by 2 desc;

select detail->>'reason', count(*) from audit_events
where kind = 'login.denied' and at > now() - interval '1 day'
group by 1 order by 2 desc;
```

A rise in `login.denied` with `reason: bad_signature` or `binding_conflict`, or in `verification.timeout`, is worth a look. The kinds written today: `identity.created`, `identity.handle_changed`, `device.enrolled`, `device.revoked`, `pairing.created`, `pairing.used`, `pairing.revoked`, `session.created`, `session.revoked`, `login.challenge_created`, `login.success`, `login.denied`, `verification.created`, `verification.approved`, `verification.denied`, `verification.timeout`, `site.created`, `site.updated`.

## Backups

Postgres is the only thing to back up. Take a `pg_dump` on a schedule you can live with; a restore loses everything written after it. If the database is on Neon, its point-in-time restore covers the history window configured on the project; check the window rather than assume it. Back up the Worker secrets separately, in whatever holds your other secrets.

Run a restore drill before you need one:

1. Restore the dump into an empty database.
2. Run `npm run migrate -w @identizen/db` against it. It should report `migrations applied` without doing anything.
3. Start an index against it with the same `INDEX_SIGNING_KEY` and `OIDC_SIGNING_KEYS`.
4. `GET /health` is `200`; `GET /.well-known/identizen` shows the `index_pubkey` you recorded.
5. A phone registered before the dump approves a login, and the site sees the same `sub` as before (its row in `site_bindings` came back).

What a restore does not bring back: devices registered after the dump (those phones must forget and restore, as above), pairings (browsers show the QR once and pair again), sessions (people log in again), and the verifications and audit rows written since.

## Moving from the hosted index to your own

A site that started on `index.identizen.com` can move to its own index. The procedure follows from how the pieces fit; there is no migration tool, and no endpoint exports or imports data. This is what moves and what does not:

| Thing                                 | Moves?                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub` for each person                 | Yes, by construction. `sub = base64url(SHA-256(perSitePublicKey))[0:32]`, and the per-site key is HKDF of the seed and your `rp_id`. Nothing from the index goes in. The new index creates the `site_bindings` row on the first approval. |
| Your site registration                | No. Register again on the new index; you get a new `client_id` and secret.                                                                                                                                                                |
| Phone registrations                   | No. The app registers with one index at a time. Each person forgets the identity on the phone, restores from the 24 words, sets the new index URL in Settings, and registers.                                                             |
| Paired browsers                       | No. Pairings belong to a device on the old index. Browsers show the QR once and pair again.                                                                                                                                               |
| Sessions                              | No. People log in again. Your own application sessions are yours and are not affected.                                                                                                                                                    |
| Handles                               | No. A handle is unique per index and resolves through WebFinger at that index's host. People set it again.                                                                                                                                |
| Verification history and audit events | No. They stay on the hosted index.                                                                                                                                                                                                        |

The steps:

1. Run the new index and register your site on it with the same `rp_id`:

   ```bash
   npx identizen register-site --index https://index.example.com --name "My App" \
     --rp-id app.example.com --redirect-uri https://app.example.com/api/auth/callback --live
   ```

2. Add the new issuer, `client_id`, and secret to your application. Because `sub` is identical on both indexes, you can accept id_tokens from both issuers for a transition period and look up the same user row either way. Verify each token against the JWKS of the issuer named in its `iss`.
3. Tell your users to move their phone. The steps are in the key-loss section above, with the new index URL entered in Settings before **Register this phone**. A phone can be registered with one index, so a person who moves stops being able to approve logins for other sites that stayed on the hosted index.
4. When everyone has moved, drop the old issuer from your configuration. The registration on the hosted index can stay; it holds a hashed secret and your redirect URIs, nothing more.

The hosted index exports or deletes an identity's records on the holder's request, as described in the [privacy policy](https://identizen.com/legal/privacy/). The [enterprise roadmap](/enterprise/) lists EU/US data residency under compliance packaging; nothing on it promises a migration tool.
