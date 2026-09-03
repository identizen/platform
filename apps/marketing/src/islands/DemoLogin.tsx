import { useEffect } from 'react';
import { KimiMark } from '@identizen/ui/components/brand/logo';
import { useIdentizen } from '@identizen/react';
import type { Tx } from '../lib/playground-oidc';
import { CHALLENGE_EVENT } from './useVirtualPhone';

export type Mode = 'virtual' | 'phone';

function Mark(): React.JSX.Element {
  return <KimiMark size={16} title={null} />;
}

interface LoginProps {
  label: string;
  mode: Mode;
  tx: Tx;
  codeChallenge: string;
  redirectUri: string;
}

/** The demo site's sign-in box, driven by the real `useIdentizen()` session. */
export function DemoLogin({
  label,
  mode,
  tx,
  codeChallenge,
  redirectUri,
}: LoginProps): React.JSX.Element {
  const { state, busy, startLogin, cancel, reset } = useIdentizen();

  useEffect(() => {
    if (!state) return;
    window.dispatchEvent(
      new CustomEvent(CHALLENGE_EVENT, {
        detail: {
          challengeId: state.challengeId,
          status: state.status,
          method: state.method,
          mode,
        },
      }),
    );
    if (state.status === 'approved' && state.redirect) location.assign(state.redirect);
  }, [state, mode]);

  const start = () =>
    void startLogin({
      redirectUri,
      state: tx.state,
      nonce: tx.nonce,
      codeChallenge,
      scope: 'openid handle',
      // A virtual phone is not a Bluetooth peripheral: skip the device chooser in that mode.
      ...(mode === 'virtual' && { discovery: { bluetooth: false } }),
    });

  if (!state || state.status === 'cancelled') {
    return (
      <button
        type="button"
        onClick={start}
        className="btn h-11 w-full bg-fg text-fg-inverse hover:opacity-90"
        data-idz="button"
      >
        <Mark />
        {label}
      </button>
    );
  }

  const statusText = (() => {
    switch (state.status) {
      case 'starting':
        return 'Contacting the index…';
      case 'discovering':
        return 'Looking for your phone…';
      case 'waiting':
        return state.method === 'qr'
          ? mode === 'virtual'
            ? 'The virtual phone is reading the code…'
            : 'Scan with the Identizen app, then check the match code.'
          : state.method === 'paired'
            ? 'This browser is paired. Check your phone.'
            : 'Waiting on your phone…';
      case 'approved':
        return 'Approved. Exchanging the code…';
      case 'denied':
        return 'Declined on the phone.';
      case 'expired':
        return 'That request expired.';
      case 'error':
        return state.error
          ? `${state.error.message} (${state.error.code})`
          : 'Something went wrong.';
      default:
        return '';
    }
  })();

  return (
    <div
      data-idz="panel"
      data-status={state.status}
      data-method={state.method ?? ''}
      className="text-center"
    >
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {statusText}
      </p>
      {busy && state.method === 'qr' ? (
        <div
          className="mx-auto mt-4 w-fit rounded-lg bg-white p-2 shadow-xs ring-1 ring-border [&_svg]:h-40 [&_svg]:w-40"
          dangerouslySetInnerHTML={{ __html: state.qrSvg }}
        />
      ) : null}
      {busy && state.code ? (
        <p className="mt-4" aria-label="Match code">
          <span className="block text-2xs text-fg-muted">Match code</span>
          <strong className="tabular font-mono text-4xl font-semibold tracking-tight">
            {state.code}
          </strong>
        </p>
      ) : null}
      {busy && state.method ? (
        <p className="mt-2 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
          via {state.method}
        </p>
      ) : null}
      {busy ? (
        <button type="button" onClick={cancel} className="btn btn-ghost btn-sm mt-4">
          Cancel
        </button>
      ) : null}
      {!busy && state.status !== 'approved' ? (
        <button type="button" onClick={reset} className="btn btn-secondary btn-sm mt-4">
          Try again
        </button>
      ) : null}
    </div>
  );
}
