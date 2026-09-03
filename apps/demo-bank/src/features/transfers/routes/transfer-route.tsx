import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { CheckCircle2 } from 'lucide-react';
import { ACCOUNTS, PAYEES, accountById } from '@/features/accounts';
import { formatUsd } from '@/lib/money';
import { ApprovalPanel } from '../components/approval-panel';
import { TransferForm, type TransferFormValues } from '../components/transfer-form';
import { useTransfers } from '../hooks/use-transfers';
import type { Transfer, TransferKind } from '../types';

export interface TransferRouteProps {
  kind: TransferKind;
  /** The signed-in customer's per-site subject; the phone bound to it gets the approval. */
  sub: string;
}

const COPY = {
  ach: {
    title: 'Move money',
    intro: 'ACH to a saved payee. Arrives in one to two business days.',
  },
  wire: {
    title: 'Send a wire',
    intro: 'Same-day domestic wire. Every wire is approved on your phone before it leaves.',
  },
} as const;

/** Form -> (approval on the phone, when required) -> done. Shared by /app/transfer and /app/wire. */
export function TransferRoute({ kind, sub }: TransferRouteProps) {
  const { create, approve, decline } = useTransfers();
  const [pending, setPending] = useState<Transfer | null>(null);
  const [done, setDone] = useState<Transfer | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const payees = PAYEES.filter((p) => p.kind === kind);

  const submit = (values: TransferFormValues) => {
    const t = create({ kind, ...values });
    setFailure(null);
    if (t.status === 'needs_approval') setPending(t);
    else setDone(t);
  };

  if (done) {
    const payee = PAYEES.find((p) => p.id === done.payeeId);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 aria-hidden="true" className="size-10 text-success" />
          <p className="font-display text-2xl font-semibold" data-testid="done">
            {formatUsd(done.amount)} to {payee?.name} is scheduled
          </p>
          <p className="max-w-md text-sm text-fg-muted">
            {done.approval
              ? `Approved on your phone. The signed approval covers exactly: "${done.approval.reason}".`
              : 'Under the approval threshold, so it went straight through.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button asChild>
              <Link to="/app/activity">View activity</Link>
            </Button>
            <Button variant="outline" onClick={() => setDone(null)}>
              Another {kind === 'wire' ? 'wire' : 'transfer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pending) {
    const from = accountById(pending.fromAccountId);
    const payee = PAYEES.find((p) => p.id === pending.payeeId);
    if (from && payee)
      return (
        <ApprovalPanel
          transfer={pending}
          from={from}
          payee={payee}
          sub={sub}
          onApproved={(challengeId, reason) => {
            approve(pending.id, challengeId, reason);
            setDone({
              ...pending,
              status: 'scheduled',
              approval: { challengeId, reason, approvedAt: '' },
            });
            setPending(null);
          }}
          onFailed={(state) => {
            decline(pending.id);
            setPending(null);
            setFailure(
              state.status === 'denied'
                ? 'You declined on your phone. Nothing was sent.'
                : `The approval did not complete (${state.error?.message ?? state.status}). Nothing was sent.`,
            );
          }}
          onCancel={() => {
            decline(pending.id);
            setPending(null);
          }}
        />
      );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{COPY[kind].title}</CardTitle>
        <CardDescription>{COPY[kind].intro}</CardDescription>
      </CardHeader>
      <CardContent>
        {failure ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg"
          >
            {failure}
          </p>
        ) : null}
        <TransferForm kind={kind} accounts={ACCOUNTS} payees={payees} onSubmit={submit} />
      </CardContent>
    </Card>
  );
}
