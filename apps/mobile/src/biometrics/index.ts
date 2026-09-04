/**
 * Biometric gate before signing. Returns the `amr` values for the assertion.
 *
 * `hwk` (hardware-bound key) is asserted here on the promise that M9's `modules/idz-enclave`
 * wraps the seed under a Secure Enclave / StrongBox key. In M8 the seed is keychain-protected
 * (expo-secure-store); the claim is kept so the wire format does not change when M9 lands.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import type { Amr } from '@identizen/protocol';

/** What to call the biometric gate in copy: Apple's names on iOS, the generic term elsewhere. */
export function biometricName(): string {
  return Platform.OS === 'ios' ? 'Face ID' : 'your fingerprint or face';
}

export interface BiometricResult {
  ok: boolean;
  amr: Amr[];
  reason?: string;
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

/** Map the enrolled authenticator to RFC 8176 `amr` values. */
export async function enrolledAmr(): Promise<Amr[]> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
      return ['face', 'hwk'];
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
      return ['fingerprint', 'hwk'];
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return ['face', 'hwk'];
  } catch {
    /* fall through */
  }
  return ['pin', 'hwk'];
}

/** Prompt Face ID / Touch ID / device passcode. `required=false` skips the prompt (dev/sim). */
export async function authenticate(
  promptMessage: string,
  required = true,
): Promise<BiometricResult> {
  const amr = await enrolledAmr();
  if (!required) return { ok: true, amr };
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true, amr };
    return { ok: false, amr, reason: result.error };
  } catch (err) {
    return { ok: false, amr, reason: String(err) };
  }
}
