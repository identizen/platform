import { useEffect, useMemo, useState } from 'react';
import { IdentizenProvider } from '@identizen/react';
import { TX_KEY, exchangeCode, newTx, type Claims, type Tx } from '../lib/playground-oidc';
import { DemoLogin, type Mode } from './DemoLogin';
import { MODE_EVENT } from './useVirtualPhone';

export interface PlaygroundProps {
  indexUrl: string;
  clientId: string;
}

const MODE_KEY = 'idz:playground:mode';
const LABELS = ['Continue with Identizen', 'Sign in with your phone'] as const;

/**
 * The playground dogfoods the public SDK: a real OIDC login against the demo site, approved by
 * the virtual phone in this tab or by your own phone. The index returns a code to this page; the
 * island exchanges it as a public PKCE client and shows the id_token claims.
 */
export function Playground({ indexUrl, clientId }: PlaygroundProps): React.JSX.Element {
  const [labelIndex, setLabelIndex] = useState<0 | 1>(0);
  const [mode, setModeState] = useState<Mode>('virtual');
  const [prepared, setPrepared] = useState<{ tx: Tx; codeChallenge: string } | null>(null);
  const [result, setResult] = useState<Claims | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redirectUri = useMemo(
    () => (typeof location === 'undefined' ? '' : `${location.origin}/playground`),
    [],
  );

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: m }));
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'phone' || saved === 'virtual') setModeState(saved);
    } catch {
      /* ignore */
    }
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
      void exchangeCode(indexUrl, clientId, code, previous, redirectUri).then(
        setResult,
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
    }
    void newTx().then((p) => {
      sessionStorage.setItem(TX_KEY, JSON.stringify(p.tx));
      setPrepared(p);
    });
  }, [indexUrl, clientId, redirectUri]);

  return (
    <IdentizenProvider indexUrl={indexUrl} clientId={clientId}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <fieldset>
            <legend className="eyebrow mb-2">Approve with</legend>
            <div
              className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5 text-sm"
              role="radiogroup"
            >
              {(['virtual', 'phone'] as const).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-md px-3 py-1.5 ${mode === m ? 'bg-surface-0 font-medium shadow-xs' : 'text-fg-muted'}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="sr-only"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {m === 'virtual' ? 'Virtual phone' : 'My phone'}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="eyebrow mb-2">Button label (A/B)</legend>
            <div className="flex flex-wrap gap-2 text-sm">
              {LABELS.map((label, i) => (
                <label
                  key={label}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-3 py-1.5"
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
            </div>
          </fieldset>
        </div>

        <div className="card-gradient overflow-hidden">
          <div
            className="flex items-center gap-3 border-b border-border bg-surface-1/80 px-3 py-2"
            aria-hidden="true"
          >
            <span className="chrome-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="flex h-7 flex-1 items-center rounded-md bg-surface-0 px-3 font-mono text-2xs text-fg-muted ring-1 ring-border">
              acme.example/login
            </span>
          </div>
          <div className="px-6 py-8 sm:px-10">
            <div className="mx-auto max-w-xs">
              <p className="text-lg font-semibold tracking-tight">Welcome back</p>
              <p className="mt-1 text-xs text-fg-muted">
                Acme is a demo site registered with {indexUrl.replace(/^https?:\/\//, '')}.
              </p>
              <div className="mt-5">
                {prepared ? (
                  <DemoLogin
                    key={`${labelIndex}-${mode}`}
                    label={LABELS[labelIndex]}
                    mode={mode}
                    tx={prepared.tx}
                    codeChallenge={prepared.codeChallenge}
                    redirectUri={redirectUri}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">Preparing…</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {result ? (
          <div
            className="rounded-xl border border-success-soft bg-success-soft p-5 text-sm text-success-soft-fg"
            data-testid="playground-result"
          >
            <p className="font-medium">Signed in. This is everything the demo site received:</p>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs">
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
            <p className="mt-3">
              No email, no name, no third-party account. A stable per-site identifier and nothing
              else.
            </p>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg"
          >
            The login did not complete: <code className="font-mono">{error}</code>
          </p>
        ) : null}
      </div>
    </IdentizenProvider>
  );
}
