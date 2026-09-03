import { useEffect, useState } from 'react';
import { IdentizenButton } from '@identizen/react';
import { beginSignIn, type SignInTransaction } from '../api/oidc';

/**
 * "Continue with Identizen" for the bank. The button from @identizen/react does the work:
 * it starts the login, shows the match code and QR (or pushes straight to a paired phone),
 * and follows the OIDC redirect to /callback when the phone approves. This wrapper only
 * prepares the PKCE transaction the callback needs.
 */
export function IdentizenLogin() {
  const [tx, setTx] = useState<SignInTransaction | null>(null);
  useEffect(() => {
    void beginSignIn().then(setTx);
  }, []);
  if (!tx) return null;
  return (
    <IdentizenButton
      label="Continue with Identizen"
      className="inline-flex h-12 w-full items-center justify-center rounded-md bg-idz px-5 font-semibold text-white hover:opacity-90"
      panelClassName="mt-6 rounded-lg border bg-surface-1 p-5"
      login={{
        redirectUri: tx.redirectUri,
        state: tx.state,
        nonce: tx.nonce,
        codeChallenge: tx.codeChallenge,
        scope: 'openid handle',
      }}
    />
  );
}
