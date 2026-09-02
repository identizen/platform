import { useEffect, useMemo, useState } from 'react';
import { IdentizenButton, IdentizenProvider } from '@identizen/react';
import { pkceChallenge, randomString } from '@identizen/sdk';

export interface PlaygroundProps {
  indexUrl: string;
  clientId: string;
}

interface Tx {
  state: string;
  nonce: string;
  verifier: string;
}

interface Result {
  sub: string;
  acr: string;
  amr: string[];
  idz_device: string;
  sid: string;
}

const TX_KEY = 'idz:playground:tx';
const LABELS = ['Continue with Identizen', 'Sign in with your phone'] as const;

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * The playground dogfoods the public SDK: a real login against the demo site with your own
 * phone (or `npx identizen dev` as the phone). The index returns an OIDC code to this page;
 * the island exchanges it as a public PKCE client and shows the id_token claims.
 */
export function Playground({ indexUrl, clientId }: PlaygroundProps): React.JSX.Element {
  const [labelIndex, setLabelIndex] = useState<0 | 1>(0);
  const [tx, setTx] = useState<Tx | null>(null);
  const [codeChallenge, setCodeChallenge] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redirectUri = useMemo(
    () => (typeof location === 'undefined' ? '' : `${location.origin}/playground`),
    [],
  );

  // Prepare a fresh PKCE transaction, or finish one when the index sent us back with ?code=.
  useEffect(() => {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    const stored = sessionStorage.getItem(TX_KEY);
    const previous = stored ? (JSON.parse(stored) as Tx) : null;
    if (err) {
      setError(err);
      history.replaceState(null, '', '/playground');
    }
    if (code && previous && state === previous.state) {
      sessionStorage.removeItem(TX_KEY);
      history.replaceState(null, '', '/playground');
      void exchange(indexUrl, clientId, code, previous, redirectUri).then(setResult, (e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    }
    const fresh: Tx = {
      state: randomString(16),
      nonce: randomString(16),
      verifier: randomString(32),
    };
    sessionStorage.setItem(TX_KEY, JSON.stringify(fresh));
    setTx(fresh);
    void pkceChallenge(fresh.verifier).then(setCodeChallenge);
  }, [indexUrl, clientId, redirectUri]);

  const ready = tx !== null && codeChallenge !== null;

  return (
    <IdentizenProvider indexUrl={indexUrl} clientId={clientId}>
      <div className="grid gap-6 rounded-xl border border-border bg-surface-1 p-6 shadow-xs">
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-muted">
            Button label (we are testing both)
          </legend>
          {LABELS.map((label, i) => (
            <label
              key={label}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5"
            >
              <input
                type="radio"
                name="label"
                checked={labelIndex === i}
                onChange={() => setLabelIndex(i as 0 | 1)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="rounded-lg border border-border bg-surface-0 p-6 [&_[data-idz=button]]:rounded-md [&_[data-idz=button]]:bg-accent [&_[data-idz=button]]:px-4 [&_[data-idz=button]]:py-2 [&_[data-idz=button]]:font-medium [&_[data-idz=button]]:text-accent-fg [&_[data-idz=cancel]]:mt-3 [&_[data-idz=cancel]]:text-sm [&_[data-idz=cancel]]:underline [&_[data-idz=code]]:mt-3 [&_[data-idz=code]_strong]:font-mono [&_[data-idz=code]_strong]:text-3xl [&_[data-idz=qr]]:mt-3 [&_[data-idz=qr]_svg]:h-48 [&_[data-idz=qr]_svg]:w-48 [&_[data-idz=retry]]:mt-3 [&_[data-idz=retry]]:text-sm [&_[data-idz=retry]]:underline [&_[data-idz=status]]:text-sm [&_[data-idz=status]]:text-fg-muted">
          {ready ? (
            <IdentizenButton
              key={labelIndex}
              label={LABELS[labelIndex]}
              login={{
                redirectUri,
                state: tx.state,
                nonce: tx.nonce,
                codeChallenge,
                scope: 'openid handle',
              }}
            />
          ) : (
            <p className="text-sm text-fg-muted">Preparing…</p>
          )}
        </div>

        {result ? (
          <div
            className="rounded-lg border border-success-soft bg-success-soft p-4 text-sm text-success-soft-fg"
            data-testid="playground-result"
          >
            <p className="font-medium">Signed in. This is what the demo site received:</p>
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs">
              <dt>sub</dt>
              <dd className="break-all">{result.sub}</dd>
              <dt>acr</dt>
              <dd>{result.acr}</dd>
              <dt>amr</dt>
              <dd>{result.amr.join(', ')}</dd>
              <dt>idz_device</dt>
              <dd className="break-all">{result.idz_device}</dd>
              <dt>sid</dt>
              <dd className="break-all">{result.sid}</dd>
            </dl>
            <p className="mt-2">
              No email, no name, no Google. A stable per-site identifier and nothing else.
            </p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            The login did not complete: <code>{error}</code>
          </p>
        ) : null}

        <p className="text-xs text-fg-muted">
          No phone yet? Run <code className="font-mono">npx identizen dev --index {indexUrl}</code>{' '}
          and paste the QR link into the fake phone at{' '}
          <code className="font-mono">localhost:4400</code>.
        </p>
      </div>
    </IdentizenProvider>
  );
}

async function exchange(
  indexUrl: string,
  clientId: string,
  code: string,
  tx: Tx,
  redirectUri: string,
): Promise<Result> {
  const res = await fetch(`${indexUrl.replace(/\/+$/, '')}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: tx.verifier,
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `token ${res.status}`);
  }
  const { id_token } = (await res.json()) as { id_token: string };
  const claims = decodeJwtPayload(id_token);
  if (claims.nonce !== tx.nonce) throw new Error('nonce_mismatch');
  return {
    sub: String(claims.sub),
    acr: String(claims.acr),
    amr: Array.isArray(claims.amr) ? (claims.amr as string[]) : [],
    idz_device: String(claims.idz_device),
    sid: String(claims.sid),
  };
}
