---
title: On-prem installation
description: Running Identizen Enterprise inside your own boundary — the signed images, the compose pilot, the Helm production install, keys, the license, and the single-replica rule with its Postgres alternative.
---

The on-prem edition is the cloud edition, packaged: the same index Worker executed by `workerd` inside a container, the portal and the members' app served by one nginx image, one Postgres database, one license. Everything documented for Identizen Cloud applies unchanged. The full install guide, the backup and restore procedure and the upgrade runbook ship with the release; this page is the shape of an install so you can plan one.

## What you run

| Surface        | Image                              | Serves                                                                             |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| index          | `ghcr.io/plsft/identizen-ee-index` | the OIDC provider, phone challenges, the SAML IdP, SCIM and the org API, port 8787 |
| portal and app | `ghcr.io/plsft/identizen-ee-web`   | the admin portal and the members' app, chosen by Host, port 8080                   |

The web image renders its runtime configuration (`/config.json`: index URL, tenant slug and name, the two URLs) and its security headers from environment variables at start, so one image serves any install. Nothing phones home; `TELEMETRY` is off by default and sends nothing in this version even when on.

**Prerequisites.** Postgres 15 or 16 with a database the index owns; three DNS names (index, portal, app) reachable by the people who sign in, VPN included; TLS for all three (the index sets HSTS and the app is a PWA); outbound HTTPS from the index for push, mail and attestation; Docker 24 with Compose 2.20 for a pilot or Kubernetes 1.27 with Helm 3.12 for production; a license issued to you; the Identizen app on your users' phones pointed at your index URL.

## Signed images

Every release `ee-vX.Y.Z` publishes both images tagged with the version, signed keyless with Sigstore and carrying an SPDX SBOM attestation, plus the Helm chart, the compose bundle, their checksums and signatures as release assets. Verify with `cosign verify` and `cosign verify-attestation --type spdxjson` against the release workflow's identity before running anything. Air-gapped installs pull the images on a connected machine, `docker save` them across, and point the compose file or the chart at an internal registry; the images fetch nothing at run time.

## Keys and the license

Two keys, generated once and backed up in your secret store, both environment variables of the index only:

- `INDEX_SIGNING_KEY`, the Ed25519 seed that signs every challenge. Phones pin its public half when they register, so losing it means every phone re-registers.
- `OIDC_SIGNING_KEYS`, a JSON array of ES256 private JWKs that sign tokens. Rotate by prepending a new key and dropping the old one after the overlap.

`LICENSE` is a one-line Ed25519-signed document Identizen issues for your subject and seat count. The index verifies it at start and reports it on `GET /orgs/public`, in the portal's status page and in the app. When it expires there are 14 days of grace with a banner, then sign-ins are refused with `503 license_expired` while the portal keeps working, so renewing is never locked out. Active members above the seat count refuse new invitations and SCIM creates with `409 seats_exceeded`. Renewing is replacing the value and restarting the index.

## Pilot in ten minutes (Compose)

Copy `.env.example`, set the tenant slug and name, the three URLs, the two keys, the license and either your `DATABASE_URL` or the bundled Postgres profile. `docker compose up -d` runs the migrations, then the index and the web container. Two one-shot commands finish it: `bootstrap.mjs clients` registers the portal and the app as OIDC clients (their client ids derive from the slug, so nothing is copied around), and `bootstrap.mjs owner --email …` writes the first owner's invitation straight to the database and prints the link once; there is no control plane on-prem. A `tls` profile adds Caddy with Let's Encrypt or an internal CA for a shared pilot.

## Production (Helm)

The chart reads one Kubernetes Secret (`DATABASE_URL`, the two keys, `LICENSE`, and optionally the site registration token, the SAML signing material, the mail key and push credentials), created from your secret store or rendered from values on a first install. Values cover the tenant, the three URLs, the ingress class and TLS (cert-manager annotations or your own certificate secret), mail, resources, the index's persistent volume and the web replica count. The migration Job runs as a pre-install and pre-upgrade hook, then the index Deployment, the web Deployment, Services and Ingress. The first owner is invited with the same `bootstrap.mjs` commands run inside the index pod.

## Replicas and the challenge store

By default the index runs **one replica**: in-flight logins and per-device replay windows live in Durable Objects persisted to the pod's `/data` volume, which two pods cannot share. A `Recreate` Deployment on a networked volume gives active/passive failover; a node failure costs a new pod on the same volume and at most a minute of aborted sign-ins.

From `ee-v0.6.0`, `CHALLENGE_STORE=postgres` (`challengeStore: postgres` in the chart) moves that state into Postgres rows and lets `index.replicas` apply. The login page then polls instead of holding a WebSocket, which is the only visible difference. Everything durable, in both modes, is in Postgres; the `/data` volume holds in-flight logins only.

## Backup, restore, upgrade

Back up Postgres with the tool you already use; the `/data` volume is optional (losing it aborts in-flight logins, nothing else). Upgrading is pulling the new images and running the migration Job before the rollout; migrations are forward-only, so a rollback restores the database backup taken before the upgrade. Both runbooks, and an install checklist for whoever operates the cluster, are in the release bundle.
