import { describe, expect, it } from 'vitest';
import { exemptHosts, verificationRequired } from '../src/services/site-verification';

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
