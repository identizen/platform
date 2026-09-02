import * as React from 'react';
import type { LoginState } from '@identizen/sdk';
import { useIdentizen } from './context';

export interface IdentizenStepUpProps {
  /** The per-site sub bound at enrollment. */
  sub: string;
  /** Shown on the phone and bound into the signed assertion (≤ 140 chars). */
  reason?: string;
  /** OIDC parameters when the step-up should complete through the site's callback. */
  redirectUri?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  /** Start immediately on mount (default true). */
  auto?: boolean;
  onApproved?: (state: LoginState) => void;
  onError?: (state: LoginState) => void;
  label?: string;
  className?: string;
}

/**
 * Path B step-up / transaction approval: pushes to the bound phone and shows the match code
 * and the reason. Renders nothing but a status line and the code while waiting.
 */
export function IdentizenStepUp(props: IdentizenStepUpProps): React.JSX.Element {
  const { state, busy, stepUp, cancel } = useIdentizen();
  const {
    sub,
    reason,
    redirectUri,
    state: oidcState,
    nonce,
    codeChallenge,
    auto = true,
    onApproved,
    onError,
    label = 'Approve on your phone',
    className,
  } = props;
  const started = React.useRef(false);

  const run = React.useCallback(async () => {
    const final = await stepUp(sub, {
      ...(reason !== undefined && { reason }),
      ...(redirectUri !== undefined && { redirectUri }),
      ...(oidcState !== undefined && { state: oidcState }),
      ...(nonce !== undefined && { nonce }),
      ...(codeChallenge !== undefined && { codeChallenge }),
    });
    if (final.status === 'approved') onApproved?.(final);
    else if (final.status !== 'cancelled') onError?.(final);
  }, [stepUp, sub, reason, redirectUri, oidcState, nonce, codeChallenge, onApproved, onError]);

  React.useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      void run();
    }
  }, [auto, run]);

  return (
    <div className={className} data-idz="step-up" data-status={state?.status ?? 'idle'}>
      {reason ? <p data-idz="reason">{reason}</p> : null}
      <p role="status" aria-live="polite" data-idz="status">
        {!state
          ? 'Ready.'
          : busy
            ? 'Check your phone and confirm the match code.'
            : stateText(state)}
      </p>
      {busy && state?.code ? (
        <p data-idz="code" aria-label="Match code">
          <strong>{state.code}</strong>
        </p>
      ) : null}
      {!busy && state?.status !== 'approved' ? (
        <button type="button" onClick={() => void run()} data-idz="start">
          {label}
        </button>
      ) : null}
      {busy ? (
        <button type="button" onClick={cancel} data-idz="cancel">
          Cancel
        </button>
      ) : null}
    </div>
  );
}

function stateText(s: LoginState): string {
  if (s.status === 'approved') return 'Approved.';
  if (s.status === 'denied') return 'Declined on the phone.';
  if (s.status === 'expired') return 'Expired. Try again.';
  if (s.status === 'error')
    return s.error ? `${s.error.message} (${s.error.code})` : 'Something went wrong.';
  return '';
}
