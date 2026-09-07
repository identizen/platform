/**
 * The app reports what actually happened at the gate, never more (review S05).
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { authenticate } from '../src/biometrics';

const la = jest.mocked(LocalAuthentication);
const { FACIAL_RECOGNITION, FINGERPRINT, IRIS } = LocalAuthentication.AuthenticationType;
const { NONE, SECRET, BIOMETRIC_STRONG } = LocalAuthentication.SecurityLevel;

function arrange(
  level: number,
  types: number[],
  ...results: { success: boolean; error?: string }[]
) {
  la.getEnrolledLevelAsync.mockResolvedValue(level);
  la.supportedAuthenticationTypesAsync.mockResolvedValue(types);
  la.authenticateAsync.mockReset();
  for (const r of results) la.authenticateAsync.mockResolvedValueOnce(r as never);
}

describe('authenticate', () => {
  it('skipping the prompt reports swk: nobody was verified and the key is software-held', async () => {
    arrange(BIOMETRIC_STRONG, [FACIAL_RECOGNITION]);
    expect(await authenticate('x', false)).toEqual({ ok: true, amr: ['swk'] });
    expect(la.authenticateAsync).not.toHaveBeenCalled();
  });

  it('a biometrics-only success names the single enrolled biometric, and never hwk', async () => {
    arrange(BIOMETRIC_STRONG, [FACIAL_RECOGNITION], { success: true });
    expect(await authenticate('x')).toEqual({ ok: true, amr: ['face'] });
    expect(la.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true }),
    );
    arrange(BIOMETRIC_STRONG, [FINGERPRINT], { success: true });
    expect((await authenticate('x')).amr).toEqual(['fingerprint']);
    arrange(BIOMETRIC_STRONG, [IRIS], { success: true });
    expect((await authenticate('x')).amr).toEqual(['iris']);
  });

  it('when the platform cannot say which biometric succeeded it reports user, not a guess', async () => {
    arrange(BIOMETRIC_STRONG, [FACIAL_RECOGNITION, FINGERPRINT], { success: true });
    expect((await authenticate('x')).amr).toEqual(['user']);
  });

  it('a cancelled biometric prompt fails without a passcode fallback', async () => {
    arrange(BIOMETRIC_STRONG, [FACIAL_RECOGNITION], { success: false, error: 'user_cancel' });
    const r = await authenticate('x');
    expect(r.ok).toBe(false);
    expect(r.amr).toEqual([]);
    expect(la.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('a lockout falls back to the passcode and is reported as pin, never as the biometric', async () => {
    arrange(
      BIOMETRIC_STRONG,
      [FACIAL_RECOGNITION],
      { success: false, error: 'lockout' },
      { success: true },
    );
    expect(await authenticate('x')).toEqual({ ok: true, amr: ['pin'] });
    expect(la.authenticateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });

  it('a passcode-only device reports pin; a device with nothing enrolled cannot approve', async () => {
    arrange(SECRET, [], { success: true });
    expect(await authenticate('x')).toEqual({ ok: true, amr: ['pin'] });
    arrange(NONE, []);
    const r = await authenticate('x');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_authentication_enrolled');
    expect(la.authenticateAsync).not.toHaveBeenCalled();
  });
});
