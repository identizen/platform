/** Realistic fixture data for the mock index (Playwright + Vitest). Times are relative to "now". */

const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

export const DEVICE_IPHONE = 'dev_01K3ZB2N9G0000000000000001';
export const DEVICE_PIXEL = 'dev_01K3ZB2N9G0000000000000002';
export const DEVICE_OLD = 'dev_01K3ZB2N9G0000000000000003';
export const PAIRING_MAC = 'pr_01K3ZB2N9G0000000000000010';
export const PAIRING_WIN = 'pr_01K3ZB2N9G0000000000000011';
export const SID_DASHBOARD = 'sid_dashboard_0000000000000001';
export const SID_ACME = 'sid_acme_0000000000000000000002';
export const CHALLENGE_LOGIN = 'ch_01K3ZB2N9G0000000000000020';
export const CHALLENGE_MFA = 'ch_01K3ZB2N9G0000000000000021';
export const IDZ = 'Q4KpB8kZ7QwFHo5n4wKXk1s0JmHkq5pE';
export const CLIENT_DASHBOARD = 'idz_test_dashboard';

export interface AuditFixture {
  id: number;
  at: string;
  kind: string;
  device_id: string | null;
  client_id: string | null;
  detail: Record<string, unknown> | null;
}

export function freshFixtures() {
  return {
    me: {
      idz: IDZ,
      handle: 'george' as string | null,
      kind: 'personal' as const,
      via: 'dashboard' as const,
    },
    devices: [
      {
        id: DEVICE_IPHONE,
        status: 'active',
        push_platform: 'apns',
        has_ble: true,
        last_seen_at: minutes(3),
        created_at: minutes(60 * 24 * 40),
        current: false,
      },
      {
        id: DEVICE_PIXEL,
        status: 'active',
        push_platform: 'fcm',
        has_ble: true,
        last_seen_at: minutes(60 * 5),
        created_at: minutes(60 * 24 * 9),
        current: false,
      },
      {
        id: DEVICE_OLD,
        status: 'revoked',
        push_platform: 'apns',
        has_ble: false,
        last_seen_at: minutes(60 * 24 * 200),
        created_at: minutes(60 * 24 * 400),
        current: false,
      },
    ],
    pairings: [
      {
        id: PAIRING_MAC,
        device_id: DEVICE_IPHONE,
        label: 'Safari on macOS',
        status: 'active',
        last_used_at: minutes(12),
        created_at: minutes(60 * 24 * 30),
      },
      {
        id: PAIRING_WIN,
        device_id: DEVICE_IPHONE,
        label: 'Chrome on Windows',
        status: 'active',
        last_used_at: minutes(60 * 30),
        created_at: minutes(60 * 24 * 3),
      },
    ],
    sessions: [
      {
        sid: SID_DASHBOARD,
        client_id: CLIENT_DASHBOARD,
        device_id: DEVICE_IPHONE,
        created_at: minutes(1),
        expires_at: new Date(Date.now() + 29 * 86400_000).toISOString(),
      },
      {
        sid: SID_ACME,
        client_id: 'idz_live_acme',
        device_id: DEVICE_IPHONE,
        created_at: minutes(60 * 2),
        expires_at: new Date(Date.now() + 20 * 86400_000).toISOString(),
      },
    ],
    audit: [
      {
        id: 12,
        at: minutes(1),
        kind: 'session.created',
        device_id: DEVICE_IPHONE,
        client_id: CLIENT_DASHBOARD,
        detail: null,
      },
      {
        id: 11,
        at: minutes(1),
        kind: 'login.success',
        device_id: DEVICE_IPHONE,
        client_id: CLIENT_DASHBOARD,
        detail: { acr: 'idz:login' },
      },
      {
        id: 10,
        at: minutes(60 * 2),
        kind: 'verification.approved',
        device_id: DEVICE_IPHONE,
        client_id: 'idz_live_acme',
        detail: { reason: 'Approve wire transfer of $12,000 to Acme?' },
      },
      {
        id: 9,
        at: minutes(60 * 24),
        kind: 'pairing.created',
        device_id: DEVICE_IPHONE,
        client_id: 'idz_live_acme',
        detail: null,
      },
      {
        id: 8,
        at: minutes(60 * 24 * 9),
        kind: 'device.enrolled',
        device_id: DEVICE_PIXEL,
        client_id: null,
        detail: null,
      },
      {
        id: 7,
        at: minutes(60 * 24 * 200),
        kind: 'device.revoked',
        device_id: DEVICE_OLD,
        client_id: null,
        detail: null,
      },
    ] as AuditFixture[],
    challenges: {
      [CHALLENGE_LOGIN]: {
        payload: {
          type: 'challenge',
          id: CHALLENGE_LOGIN,
          rp_id: 'app.example.com',
          rp_name: 'Acme Demo',
          nonce: 'A'.repeat(43),
          code: '47',
          iat: 1,
          exp: 61,
          index: 'http://localhost:8787',
          acr: 'idz:login',
          reason: null,
        },
        sig: 'B'.repeat(86),
        status: 'pending',
      },
      [CHALLENGE_MFA]: {
        payload: {
          type: 'challenge',
          id: CHALLENGE_MFA,
          rp_id: 'app.example.com',
          rp_name: 'Acme Demo',
          nonce: 'A'.repeat(43),
          code: '08',
          iat: 1,
          exp: 61,
          index: 'http://localhost:8787',
          acr: 'idz:mfa',
          reason: 'Approve wire transfer of $12,000 to Acme?',
        },
        sig: 'B'.repeat(86),
        status: 'pending',
      },
    } as Record<string, { payload: Record<string, unknown>; sig: string; status: string }>,
  };
}

export type Fixtures = ReturnType<typeof freshFixtures>;

/** A signed-in dashboard session for tests (no signature check on the mock). */
export const MOCK_SESSION = {
  accessToken: 'mock-access-token',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  claims: {
    sub: 'S'.repeat(32),
    sid: SID_DASHBOARD,
    acr: 'idz:login',
    amr: ['face', 'hwk'],
    idz_handle: 'george',
  },
};

/** Unsigned JWT-shaped id_token for the mock /token endpoint. */
export function mockIdToken(nonce: string): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ sub: 'S'.repeat(32), sid: SID_DASHBOARD, acr: 'idz:login', amr: ['face', 'hwk'], idz_handle: 'george', nonce })}.`;
}
