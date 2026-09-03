import { cn } from '@identizen/ui';
import { shortDate } from '@/lib/format';
import { formatUsd } from '@/lib/money';
import type { Transaction } from '../data/accounts';

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0)
    return <p className="py-8 text-center text-sm text-fg-muted">No activity yet.</p>;
  return (
    <ul className="divide-y" aria-label="Transactions">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{t.description}</p>
            <p className="text-xs text-fg-muted">
              {shortDate(t.at)} · {t.category}
            </p>
          </div>
          <p className={cn('tnum shrink-0 font-medium', t.amount > 0 && 'text-success-soft-fg')}>
            {t.amount > 0 ? '+' : ''}
            {formatUsd(t.amount)}
          </p>
        </li>
      ))}
    </ul>
  );
}
