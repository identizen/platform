import { Card, CardContent } from '@identizen/ui';
import { Briefcase, PiggyBank, Wallet } from 'lucide-react';
import { formatUsd, last4 } from '@/lib/money';
import type { Account } from '../data/accounts';

const ICON = { checking: Wallet, savings: PiggyBank, business: Briefcase } as const;

export function AccountCard({
  account,
  selected = false,
  onSelect,
}: {
  account: Account;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const Icon = ICON[account.kind];
  const body = (
    <CardContent className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent-soft-fg">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="font-mono text-xs text-fg-muted">{last4(account.number)}</span>
      </div>
      <div>
        <p className="text-sm text-fg-muted">{account.name}</p>
        <p
          className="tnum font-display text-2xl font-semibold tracking-tight"
          data-testid={`balance-${account.id}`}
        >
          {formatUsd(account.balance)}
        </p>
      </div>
      <p className="text-xs text-fg-muted">
        {formatUsd(account.available)} available
        {account.apy ? ` · ${account.apy.toFixed(2)}% APY` : ''}
      </p>
    </CardContent>
  );
  if (!onSelect) return <Card>{body}</Card>;
  return (
    <button
      type="button"
      onClick={() => onSelect(account.id)}
      aria-pressed={selected}
      className="text-left"
    >
      <Card
        className={selected ? 'border-accent ring-2 ring-accent/30' : 'hover:border-border-strong'}
      >
        {body}
      </Card>
    </button>
  );
}
