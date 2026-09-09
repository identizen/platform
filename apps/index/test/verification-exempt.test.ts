import { describe, expect, it } from 'vitest';
import {
  exemptHosts,
  verificationRequired,
  verificationStatus,
} from '../src/services/site-verification';

const site = (rpId: string) => ({ clientId: 'idz_live_x', rpId });

describe('SITE_VERIFICATION_EXEMPT_HOSTS', () => {
  it('exempts exactly the listed hostnames, case-insensitively', () => {
    const env = {
      SITE_VERIFICATION_EXEMPT_HOSTS: ' Acme.portal.identizen.com, acme.app.identizen.com ',
    };
    expect(exemptHosts(env)).toEqual(['acme.portal.identizen.com', 'acme.app.identizen.com']);
    expect(verificationRequired(env, site('acme.portal.identizen.com'))).toBe(false);
    expect(verificationRequired(env, site('ACME.app.identizen.com'))).toBe(false);
    expect(verificationRequired(env, site('acme.index.identizen.com'))).toBe(true);
    expect(verificationRequired(env, site('evil.example'))).toBe(true);
  });

  it('changes nothing when unset', () => {
    expect(verificationRequired({}, site('app.example.com'))).toBe(true);
    expect(verificationRequired({ SITE_VERIFICATION: 'off' }, site('app.example.com'))).toBe(false);
  });
});

describe('F01: the client-id prefix never waives the proof', () => {
  it('a test client on a real host must verify; on localhost it need not', () => {
    const test = (rpId: string) => ({ clientId: 'idz_test_x', rpId });
    expect(verificationRequired({}, test('bank.example'))).toBe(true);
    expect(verificationRequired({}, test('localhost'))).toBe(false);
    expect(verificationRequired({}, test('127.0.0.1'))).toBe(false);
  });

  it('a row auto-passed as not_required reads as pending once the host needs proof', () => {
    const autoPassed = {
      clientId: 'idz_test_x',
      rpId: 'bank.example',
      verifiedAt: new Date(),
      verificationMethod: 'not_required',
    };
    expect(verificationStatus({}, autoPassed)).toBe('pending');
    expect(verificationStatus({ SITE_VERIFICATION: 'off' }, autoPassed)).toBe('not_required');
    expect(verificationStatus({}, { ...autoPassed, verificationMethod: 'dns' })).toBe('verified');
  });
});
