import * as React from 'react';
import type { LoginState, StartLoginOptions } from '@identizen/sdk';
import { useIdentizen } from './context';

export interface IdentizenButtonProps {
  /** Called with the terminal state when the phone approved. Navigate to `state.redirect` for OIDC. */
  onSuccess?: (state: LoginState) => void;
  onError?: (state: LoginState) => void;
  /** Button text. Test both in the playground: "Continue with Identizen" vs "Sign in with your phone". */
  label?: string;
  /** Options passed to `startLogin`. */
  login?: StartLoginOptions;
  /** Follow the OIDC redirect automatically when the index returns one (default true). */
  followRedirect?: boolean;
  className?: string;
  /** Class for the waiting panel (code + QR). */
  panelClassName?: string;
}

/**
 * Presentational-plus-hook composite: idle button -> waiting panel (match code, QR or
 * "check your phone") -> approved / denied / expired / error. Accessible: live region for
 * status, labelled QR, keyboard-reachable retry.
 */
export function IdentizenButton({
  onSuccess,
  onError,
  label = 'Continue with Identizen',
  login,
  followRedirect = true,
  className,
  panelClassName,
}: IdentizenButtonProps): React.JSX.Element {
  const { state, busy, startLogin, cancel, reset } = useIdentizen();

  const start = async () => {
    const final = await startLogin(login);
    if (final.status === 'approved') {
      onSuccess?.(final);
      if (followRedirect && final.redirect && typeof location !== 'undefined')
        location.assign(final.redirect);
    } else if (final.status !== 'cancelled') {
      onError?.(final);
    }
  };

  if (!state || state.status === 'cancelled') {
    return (
      <button type="button" className={className} onClick={() => void start()} data-idz="button">
        {label}
      </button>
    );
  }

  return (
    <div
      className={panelClassName}
      data-idz="panel"
      data-status={state.status}
      data-method={state.method ?? ''}
    >
      <p role="status" aria-live="polite" data-idz="status">
        {statusText(state)}
      </p>
      {busy && state.code ? (
        <p data-idz="code" aria-label="Match code">
          <span>Match code</span> <strong>{state.code}</strong>
        </p>
      ) : null}
      {busy && state.method === 'qr' ? (
        <div data-idz="qr" dangerouslySetInnerHTML={{ __html: state.qrSvg }} />
      ) : null}
      {busy && state.method === 'deeplink' ? (
        <a href={state.deepLink} data-idz="deeplink">
          Open in Identizen
        </a>
      ) : null}
      {busy ? (
        <button type="button" onClick={cancel} data-idz="cancel">
          Cancel
        </button>
      ) : null}
      {!busy && state.status !== 'approved' ? (
        <button type="button" onClick={reset} data-idz="retry">
          Try again
        </button>
      ) : null}
    </div>
  );
}

function statusText(s: LoginState): string {
  switch (s.status) {
    case 'starting':
      return 'Contacting Identizen…';
    case 'discovering':
      return 'Looking for your phone…';
    case 'waiting':
      return s.method === 'qr'
        ? 'Scan the code with the Identizen app and check the match code.'
        : s.method === 'deeplink'
          ? 'Open Identizen to approve.'
          : 'Waiting on your phone…';
    case 'approved':
      return 'Approved. Signing you in…';
    case 'denied':
      return 'You declined on your phone.';
    case 'expired':
      return 'That request expired.';
    case 'error':
      return s.error ? `${s.error.message} (${s.error.code})` : 'Something went wrong.';
    case 'cancelled':
      return 'Cancelled.';
  }
}
