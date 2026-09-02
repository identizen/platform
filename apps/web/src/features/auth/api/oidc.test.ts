import { describe, expect, it } from 'vitest';
import { buildSignIn, completeSignIn, decodeClaims } from './oidc';
import { getSession } from './session';
import { mockIdToken } from '@/mocks/fixtures';

describe('sign-in', () => {
  it('builds a PKCE authorization URL for the public dashboard client and stores the transaction', async () => {
    const { url, tx } = await buildSignIn();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('http://localhost:8787/authorize');
    const q = Object.fromEntries(u.searchParams);
    expect(q).toMatchObject({
      response_type: 'code',
      client_id: 'idz_test_dashboard',
      redirect_uri: `${location.origin}/callback`,
      scope: 'openid handle',
      state: tx.state,
      nonce: tx.nonce,
      code_challenge_method: 'S256',
    });
    expect(q.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.client_secret).toBeUndefined();
    const stored = JSON.parse(sessionStorage.getItem('idz:oidc-tx') ?? '{}') as {
      verifier: string;
    };
    expect(stored.verifier).toBe(tx.verifier);
  });

  it('completes the code exchange, verifies state and nonce, and stores the session', async () => {
    sessionStorage.setItem(
      'idz:oidc-tx',
      JSON.stringify({
        state: 'st',
        nonce: 'mock-nonce',
        verifier: 'v',
        clientId: 'idz_test_dashboard',
      }),
    );
    const session = await completeSignIn(new URLSearchParams({ code: 'good-code', state: 'st' }));
    expect(session.claims.sub).toBe('S'.repeat(32));
    expect(session.claims.idz_handle).toBe('george');
    expect(getSession()?.accessToken).toBe('mock-access-token');
  });

  it('rejects state mismatch, index errors, and nonce mismatch', async () => {
    sessionStorage.setItem(
      'idz:oidc-tx',
      JSON.stringify({ state: 'st', nonce: 'mock-nonce', verifier: 'v', clientId: 'x' }),
    );
    await expect(
      completeSignIn(new URLSearchParams({ code: 'good-code', state: 'wrong' })),
    ).rejects.toThrow(/state/);
    await expect(completeSignIn(new URLSearchParams({ error: 'access_denied' }))).rejects.toThrow(
      /access_denied/,
    );
    sessionStorage.setItem(
      'idz:oidc-tx',
      JSON.stringify({ state: 'st', nonce: 'other', verifier: 'v', clientId: 'x' }),
    );
    await expect(
      completeSignIn(new URLSearchParams({ code: 'good-code', state: 'st' })),
    ).rejects.toThrow(/nonce/);
    sessionStorage.setItem(
      'idz:oidc-tx',
      JSON.stringify({ state: 'st', nonce: 'mock-nonce', verifier: 'v', clientId: 'x' }),
    );
    await expect(completeSignIn(new URLSearchParams({ code: 'bad', state: 'st' }))).rejects.toThrow(
      /400/,
    );
    expect(getSession()).toBeNull();
  });

  it('decodes id_token claims', () => {
    const claims = decodeClaims(mockIdToken('n'));
    expect(claims).toMatchObject({
      sub: 'S'.repeat(32),
      acr: 'idz:login',
      amr: ['face', 'hwk'],
      idz_handle: 'george',
    });
    expect(() => decodeClaims('a.b.c')).toThrow();
  });
});
