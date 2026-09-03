import { IdentizenStepUp } from '@identizen/react';
import type { LoginState } from '@identizen/react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KimiMark,
} from '@identizen/ui';
import { formatUsd } from '@/lib/money';
import type { Account, Payee } from '@/features/accounts';
import type { Transfer } from '../types';

export interface ApprovalPanelProps {
  transfer: Transfer;
  from: Account;
  payee: Payee;
  /** The bound per-site subject from the session's id_token. */
  sub: string;
  onApproved: (challengeId: string, reason: string) => void;
  onFailed: (state: LoginState) => void;
  onCancel: () => void;
}

/** The text the phone shows and the person signs. Keep it short; the protocol caps it at 140 chars. */
export function approvalReason(t: Transfer, payee: Payee): string {
  const verb = t.kind === 'wire' ? 'Wire' : 'ACH';
  return `${verb} ${formatUsd(t.amount)} to ${payee.name} (···${payee.accountNumber})`;
}

/**
 * Transaction approval. <IdentizenStepUp> pushes a challenge to the phone bound to `sub`
 * carrying `reason`; the phone displays it verbatim above the match code. Approving signs an
 * assertion over that reason, so what was approved is exactly what was shown.
 */
export function ApprovalPanel(p: ApprovalPanelProps) {
  const reason = approvalReason(p.transfer, p.payee);
  return (
    <Card className="border-idz/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KimiMark size={18} className="text-idz" /> Approve on your phone
        </CardTitle>
        <CardDescription>
          We sent this to your phone. Check that the amount and payee match, and that the code on
          the phone matches the one below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid gap-2 rounded-md border bg-surface-1 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-fg-muted">From</dt>
            <dd className="font-medium">{p.from.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">To</dt>
            <dd className="font-medium">{p.payee.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Amount</dt>
            <dd className="tnum font-medium">{formatUsd(p.transfer.amount)}</dd>
          </div>
        </dl>
        <p
          className="rounded-md border border-dashed px-3 py-2 font-mono text-xs text-fg-muted"
          data-testid="reason"
        >
          Phone will show: {reason}
        </p>
        <IdentizenStepUp
          sub={p.sub}
          reason={reason}
          label="Send to my phone again"
          className="rounded-md border p-4"
          onApproved={(state) => p.onApproved(state.challengeId, reason)}
          onError={p.onFailed}
        />
        <Button variant="ghost" onClick={p.onCancel} className="self-start">
          Cancel this transfer
        </Button>
      </CardContent>
    </Card>
  );
}
