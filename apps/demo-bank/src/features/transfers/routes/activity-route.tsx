import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { PAYEES, accountById } from '@/features/accounts';
import { longDate, shortId } from '@/lib/format';
import { formatUsd } from '@/lib/money';
import { useTransfers } from '../hooks/use-transfers';
import type { TransferStatus } from '../types';

const TONE: Record<TransferStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  scheduled: 'success',
  sent: 'success',
  needs_approval: 'warning',
  declined: 'danger',
};

const LABEL: Record<TransferStatus, string> = {
  scheduled: 'Scheduled',
  sent: 'Sent',
  needs_approval: 'Awaiting approval',
  declined: 'Declined',
};

/** /app/activity: what was moved this session and which phone approval signed it. */
export function ActivityRoute() {
  const { transfers } = useTransfers();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Transfers from this session. Approved items carry the Identizen challenge that signed
          them, which is what a real ledger would store as the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            Nothing yet. Move money or send a wire to see approvals here.
          </p>
        ) : (
          <ul className="divide-y" aria-label="Transfers">
            {transfers.map((t) => {
              const payee = PAYEES.find((p) => p.id === t.payeeId);
              const from = accountById(t.fromAccountId);
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.kind === 'wire' ? 'Wire' : 'ACH'} to {payee?.name}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {longDate(t.createdAt)} · from {from?.name}
                      {t.memo ? ` · ${t.memo}` : ''}
                    </p>
                    {t.approval ? (
                      <p
                        className="mt-1 font-mono text-[11px] text-fg-muted"
                        data-testid="approval"
                      >
                        signed: &quot;{t.approval.reason}&quot; · challenge{' '}
                        {shortId(t.approval.challengeId, 12)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <p className="tnum font-medium">{formatUsd(-t.amount)}</p>
                    <Badge variant={TONE[t.status]}>{LABEL[t.status]}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
