/**
 * Device attestation for org enrollment (IdentizenEnterprise docs/api/enroll.md, "Attestation").
 *
 * The tenant index verifies a platform attestation bound to the enrollment nonce and to this
 * device's public key. Producing one needs a native module (App Attest on iOS, Play Integrity on
 * Android) that this build does not ship: `getAttestation` returns null until a provider is
 * registered, and the enrollment flow tells the user when the org insists on one.
 *
 * FUTURE NATIVE MODULE (modules/idz-attestation, not written yet) implements
 * `AttestationProvider` with exactly these inputs; they mirror the verifier's `AttestationInput`
 * in the enterprise repo (packages/attestation/src/types.ts):
 *  - iOS: `DCAppAttestService.generateKey()` once per install (persist the key id), then
 *    `attestKey(keyId, clientDataHash)` with the client data the verifier reconstructs from
 *    `nonce` and `devicePubkeyHash`; resolve `{ platform: 'ios', key_id, payload }` where
 *    `payload` is the base64 attestation object and `key_id` the base64 key id.
 *  - Android: `IntegrityManager.requestIntegrityToken` with the enrollment `nonce` as the
 *    request hash; resolve `{ platform: 'android', payload }` where `payload` is the token.
 * Register it with `setAttestationProvider` at startup (src/state/useBootstrap.ts).
 */
import { Platform } from 'react-native';
import { sha256, toBase64Url } from '@identizen/protocol';

export type AttestationPlatform = 'ios' | 'android';

/** What the phone sends in `POST /enroll/:token/claim` as `attestation`. */
export interface Attestation {
  platform: AttestationPlatform;
  /** App Attest key id (base64), iOS only. */
  key_id?: string;
  /** Base64 App Attest attestation object, or the Play Integrity token. */
  payload: string;
}

export interface AttestationRequest {
  platform: AttestationPlatform;
  /** The enrollment nonce from `POST /enroll/:token/begin`. */
  nonce: string;
  /** SHA-256 of the device public key, base64url (see `devicePubkeyHash`). */
  devicePubkeyHash: string;
}

export interface AttestationProvider {
  /** Resolves null when the platform cannot attest on this device (simulator, old OS). */
  attest(request: AttestationRequest): Promise<Attestation | null>;
}

let provider: AttestationProvider | null = null;

/** Installed by the native attestation module when one is present; tests inject a fake. */
export function setAttestationProvider(p: AttestationProvider | null): void {
  provider = p;
}

export function hasAttestationProvider(): boolean {
  return provider !== null;
}

/** The platform the verifier expects, or null where no attestation exists (web, tests). */
export function attestationPlatform(os: string = Platform.OS): AttestationPlatform | null {
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  return null;
}

/** `AttestationInput.devicePubkeyHash` on the server: SHA-256 of the raw Ed25519 public key. */
export function devicePubkeyHash(devicePublicKey: Uint8Array): string {
  return toBase64Url(sha256(devicePublicKey));
}

/**
 * Obtain an attestation for an enrollment claim. Null when this build has no native provider or
 * the platform has none; the caller decides whether that is fatal (the org's
 * `require_attestation` policy).
 */
export async function getAttestation(request: AttestationRequest): Promise<Attestation | null> {
  if (!provider) return null;
  try {
    return await provider.attest(request);
  } catch (err) {
    console.warn('attestation failed', err);
    return null;
  }
}
