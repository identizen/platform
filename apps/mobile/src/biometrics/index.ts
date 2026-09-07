/**
 * The gate before signing, and the `amr` values that say what actually happened at it.
 *
 * The rule is that the app never claims more than it observed:
 * - `hwk` is not asserted. The keys are protected by the platform keychain or keystore behind the
 *   biometric, which is not a hardware-isolated signing key. It returns when enclave-backed keys
 *   ship (see spec/THREAT-MODEL.md).
 * - A biometric method is asserted only when a biometrics-only prompt succeeded. When the prompt
 *   had to allow the device passcode, or the platform cannot say which biometric it used, the
 *   weaker description is reported (`pin`, `user`).
 * - Skipping the prompt (development, simulators) reports `swk`: a software-held key signed,
 *   and nobody was verified.
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
  /** The methods that verified the person, in RFC 8176 terms. Empty when `ok` is false. */
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

/**
 * The `amr` for a successful biometrics-only prompt. The platform reports which biometric types
 * the device supports but not which one just succeeded, so a single supported type is named and
 * more than one is reported as `user` (a person was verified; the method is not known).
 */
function biometricAmr(types: LocalAuthentication.AuthenticationType[]): Amr[] {
  const named: Amr[] = [];
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) named.push('face');
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) named.push('fingerprint');
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) named.push('iris');
  return named.length === 1 ? named : ['user'];
}

const CANCELLED = new Set(['user_cancel', 'app_cancel', 'system_cancel']);

/**
 * Prompt Face ID / Touch ID / fingerprint, falling back to the device passcode only when the
 * biometric prompt cannot be completed. `required=false` skips the prompt (dev / simulator) and
 * reports that nothing verified the person.
 */
export async function authenticate(
  promptMessage: string,
  required = true,
): Promise<BiometricResult> {
  if (!required) return { ok: true, amr: ['swk'] };
  let level = LocalAuthentication.SecurityLevel.NONE;
  let types: LocalAuthentication.AuthenticationType[] = [];
  try {
    level = await LocalAuthentication.getEnrolledLevelAsync();
    types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  } catch (err) {
    return { ok: false, amr: [], reason: String(err) };
  }
  const prompt = (disableDeviceFallback: boolean) =>
    LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback,
    });
  try {
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return { ok: false, amr: [], reason: 'no_authentication_enrolled' };
    }
    if (level === LocalAuthentication.SecurityLevel.SECRET) {
      // Passcode only: the prompt can only ever be the device credential.
      const r = await prompt(false);
      return r.success ? { ok: true, amr: ['pin'] } : { ok: false, amr: [], reason: r.error };
    }
    // A biometric is enrolled. Biometrics only first, so a success is exactly that.
    const first = await prompt(true);
    if (first.success) return { ok: true, amr: biometricAmr(types) };
    if (CANCELLED.has(first.error)) return { ok: false, amr: [], reason: first.error };
    // Lockout or the sensor is unavailable: allow the passcode, and report no more than that.
    const second = await prompt(false);
    return second.success
      ? { ok: true, amr: ['pin'] }
      : { ok: false, amr: [], reason: second.error };
  } catch (err) {
    return { ok: false, amr: [], reason: String(err) };
  }
}
