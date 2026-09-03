import { useState } from 'react';
import { Button, Input, Label } from '@identizen/ui';
import { formatUsd, last4, parseUsd } from '@/lib/money';
import type { Account, Payee } from '@/features/accounts';
import { ACH_APPROVAL_THRESHOLD, type TransferKind } from '../types';

export interface TransferFormValues {
  fromAccountId: string;
  payeeId: string;
  amount: number;
  memo: string;
}

export interface TransferFormProps {
  kind: TransferKind;
  accounts: Account[];
  payees: Payee[];
  onSubmit: (values: TransferFormValues) => void;
}

const select =
  'h-11 w-full rounded-md border border-input bg-surface-0 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

/** Presentational: from, to, amount, memo. Tells the person whether the phone will be asked. */
export function TransferForm({ kind, accounts, payees, onSubmit }: TransferFormProps) {
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '');
  const [payeeId, setPayee] = useState(payees[0]?.id ?? '');
  const [amountText, setAmountText] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const amount = parseUsd(amountText);
  const from = accounts.find((a) => a.id === fromAccountId);
  const willAsk = kind === 'wire' || (amount ?? 0) >= ACH_APPROVAL_THRESHOLD;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return setError('Enter an amount like 1,250.00.');
    if (from && amount > from.available)
      return setError('That is more than the available balance.');
    setError(null);
    onSubmit({ fromAccountId, payeeId, amount, memo: memo.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label={`${kind} transfer`}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <select
            id="from"
            className={select}
            value={fromAccountId}
            onChange={(e) => setFrom(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {last4(a.number)} · {formatUsd(a.available)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <select
            id="to"
            className={select}
            value={payeeId}
            onChange={(e) => setPayee(e.target.value)}
          >
            {payees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.bank} ···{p.accountNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="tnum h-11 text-lg"
            data-testid="amount"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="memo">Memo</Label>
          <Input
            id="memo"
            maxLength={60}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-surface-1 p-4 text-sm">
        <p className="text-fg-muted">
          {willAsk
            ? `Your phone will show the exact amount and payee. ${kind === 'wire' ? 'Every wire' : `Any transfer of ${formatUsd(ACH_APPROVAL_THRESHOLD)} or more`} needs Face ID.`
            : `Under ${formatUsd(ACH_APPROVAL_THRESHOLD)}: scheduled straight away, no approval needed.`}
        </p>
        <Button type="submit" size="lg" data-testid="review">
          {willAsk ? 'Review and approve on phone' : 'Schedule transfer'}
        </Button>
      </div>
    </form>
  );
}
