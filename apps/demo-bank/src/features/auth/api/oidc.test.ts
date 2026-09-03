import { describe, expect, it } from 'vitest';
import { beginSignIn, completeSignIn, completeSignInOnce, decodeClaims } from './oidc';
import { getSession } from './session';

const b64 = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idToken = (nonce: string) =>
  `${b64({ alg: 'EdDSA' })}.${b64({ sub: 'S'.repeat(32), sid: 'sid_1', acr: 'idz:login', amr: ['face', 'hwk'], nonce })}.sig`;

const tokenEndpoint = (nonce: string): typeof fetch => {
  return async (_input, init) => {
    const body = new URLSearchParams(init?.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBeTruthy();
    return Response.json({ access_token: 'at', id_token: idToken(nonce), expires_in: 3600 });
  };
};

describe('bank sign-in', () => {
  it('prepares a PKCE transaction and completes it with state and nonce checks', async () => {
    const tx = await beginSignIn();
    expect(tx.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await completeSignIn(
      new URLSearchParams({ code: 'c', state: tx.state }),
      tokenEndpoint(tx.nonce),
    );
    expect(session.claims.sub).toBe('S'.repeat(32));
    expect(getSession()?.accessToken).toBe('at');
  });

  it('rejects a foreign state, a wrong nonce, and a callback with no transaction', async () => {
    const tx = await beginSignIn();
    await expect(
      completeSignIn(new URLSearchParams({ code: 'c', state: 'nope' }), tokenEndpoint(tx.nonce)),
    ).rejects.toThrow(/state/);
    const tx2 = await beginSignIn();
    await expect(
      completeSignIn(new URLSearchParams({ code: 'c', state: tx2.state }), tokenEndpoint('other')),
    ).rejects.toThrow(/nonce/);
    await expect(
      completeSignIn(new URLSearchParams({ code: 'c', state: 'x' }), tokenEndpoint('n')),
    ).rejects.toThrow(/another window/);
    expect(getSession()).toBeNull();
  });

  it('runs one exchange per callback URL', async () => {
    const params = new URLSearchParams({ code: 'c', state: 's' });
    const a = completeSignInOnce(params);
    const b = completeSignInOnce(new URLSearchParams(params));
    expect(b).toBe(a);
    await expect(a).rejects.toThrow();
  });

  it('decodes claims', () => {
    expect(decodeClaims(idToken('n'))).toMatchObject({ sub: 'S'.repeat(32), amr: ['face', 'hwk'] });
  });
});
