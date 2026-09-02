import { useState } from 'react';
import { Button } from '@identizen/ui';

export interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  /** Accessible name for the item being acted on, e.g. "Revoke iPhone 15". */
  ariaLabel?: string;
}

/**
 * Two-step destructive action: first click arms it, second confirms, blur/cancel disarms.
 * Presentational apart from its own armed state.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  busy = false,
  disabled = false,
  onConfirm,
  ariaLabel,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        aria-label={ariaLabel}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2" role="group" aria-label={ariaLabel ?? label}>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {busy ? 'Working…' : confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={busy}>
        Cancel
      </Button>
    </span>
  );
}
