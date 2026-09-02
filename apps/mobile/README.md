# @identizen/mobile

The Identizen authenticator: the phone holds an Ed25519 identity, sites see standard OIDC. Expo /
React Native with expo-router and NativeWind. iOS first; Android is a later build of the same app.

## Develop

```bash
npm install                                   # repo root
npm run build -w @identizen/protocol          # the app imports the protocol dist
cd apps/mobile
npm run test:unit                             # Jest: screens, identity/api modules, spec/vectors
npm run test:hermes                           # spec/vectors reproduced on the Hermes engine
npx expo start                                # Expo Go (no push: falls back to inbox polling)
npx expo run:ios                              # development build (macOS + Xcode)
```

Settings > Index sets where the phone registers (`https://identizen-index.noundry.workers.dev` by
default, `http://localhost:8787` for the local index). Register from Home; then sign in on any site
that uses that index. No phone at hand? `npx identizen dev` runs a fake one.

## Layout

- `app/` — expo-router routes (thin containers): onboarding, passphrase, verify, restore, home,
  `approve/[id]`, `l/[id]` (universal link / `identizen://` scheme), scan, devices, pairings,
  sessions, settings, phrase.
- `src/screens/` — presentational screens (props in, JSX out).
- `src/identity` (seed + device key at rest, registration), `src/api` (Idz-Signature requests),
  `src/challenges` (fetch/verify/approve/deny + pending store + local activity log),
  `src/push` (APNs/FCM token or inbox polling), `src/deeplinks`, `src/biometrics`,
  `src/theme` (mirrored token sheet + `idz:theme` preference shared with the web).
- `maestro/` — Simulator e2e (human-run, M8.6).

## Tokens

React Native cannot consume `packages/ui/src/tokens.css` (CSS variables, oklch). `src/theme/tokens.js`
is a mirrored sRGB-hex copy of the same scale; update it when the token sheet changes.

## Hermes interop

`npm run test:hermes` bundles `scripts/vectors-check.ts` with esbuild, lowers it with Babel
(`hermes-engine-cli` ships Hermes 0.12, which has no async/await, classes or `**`) and runs it on
`hermes.exe`/`hermes` from that package. `scripts/hermes-polyfill.js` adds the globals React Native
installs on the device engine but the bare CLI lacks: `TextEncoder`/`TextDecoder`, a minimal `URL`
(zod's `url()` check needs it) and `console`. The run passes when all seven `spec/vectors` files are
reproduced byte for byte; Jest's `vectors.test.ts` is the same check on V8 and is the CI gate.
The bundle is written to `node_modules/.cache/identizen-hermes/`.

## Native modules (M9)

Secure Enclave key wrapping, BLE peripheral advertising, and the passkey credential-provider extension
are Swift Expo modules under `modules/` (not yet present). The `hwk` value in `amr` is asserted on
that promise; the biometric gate and keychain storage already work without them.
