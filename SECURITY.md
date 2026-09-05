# Security policy

Identizen is an authentication system, so we treat every report seriously and answer every one.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

- Preferred: open a private report at https://github.com/identizen/platform/security/advisories/new.
- Or write to us through https://identizen.com/contact/ and say it is a security report; we will move to a private channel from there.

Include what you found, how to reproduce it, and which component it affects (protocol, index, dashboard, apps, SDKs, or a hosted site). A proof of concept helps but is not required.

## What to expect

- Acknowledgement within 2 business days.
- An assessment and a fix plan within 10 business days for anything that affects the hosted index, the apps, or the protocol.
- Credit in the release notes if you want it. We do not currently run a paid bounty.

## Scope

The monorepo (`apps/`, `packages/`, `db/`, `spec/`), the hosted index at index.identizen.com, the dashboard at app.identizen.com, the published npm packages under `@identizen/*`, and the iOS and Android apps. The demonstration bank at jtmerlin.com is a fictional site with no real accounts; reports about it are welcome but are not treated as production incidents.

## Supported versions

The latest published version of each package and the current app store builds. Protocol changes are versioned in `spec/PROTOCOL.md`.
