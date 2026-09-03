import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@identizen/ui';
import { formatUsd } from '@/lib/money';
import { AccountCard } from '../components/account-card';
import { TransactionList } from '../components/transaction-list';
import { ACCOUNTS, accountById, totalBalance, transactionsFor } from '../data/accounts';

export interface OverviewRouteProps {
  /** Greeting name: "@handle" or a short sub. */
  who: string;
  /** How the current session authenticated, for the small "signed in with" line. */
  amr: string[];
}

/** /app: balances, a selected account's activity, and the two money-moving actions. */
export function OverviewRoute({ who, amr }: OverviewRouteProps) {
  const [selected, setSelected] = useState(ACCOUNTS[0]?.id ?? '');
  const account = accountById(selected);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-fg-muted">Good to see you, {who}</p>
          <p
            className="tnum font-display text-4xl font-semibold tracking-tight"
            data-testid="total"
          >
            {formatUsd(totalBalance())}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Across {ACCOUNTS.length} accounts · signed in with {amr.join(' + ') || 'your phone'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/app/transfer">Move money</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/wire">Send a wire</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNTS.map((a) => (
          <AccountCard key={a.id} account={a} selected={a.id === selected} onSelect={setSelected} />
        ))}
      </div>

      {account ? (
        <Card>
          <CardHeader>
            <CardTitle>{account.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionList transactions={transactionsFor(account.id)} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
