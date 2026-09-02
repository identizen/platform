import { Card, CardContent } from '@identizen/ui';
import { LaptopMinimal } from 'lucide-react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { relativeTime, shortId } from '@/lib/format';
import type { Pairing } from '../api/pairings';

export interface PairingListProps {
  pairings: Pairing[];
  busyId: string | null;
  onRevoke: (id: string) => void;
}

/** Presentational list of paired browsers. */
export function PairingList({ pairings, busyId, onRevoke }: PairingListProps) {
  if (pairings.length === 0) {
    return (
      <EmptyState title="No paired browsers">
        A browser is paired after your first QR or Bluetooth login there. Later logins push straight
        to your phone.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Paired browsers">
      {pairings.map((p) => (
        <li key={p.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <LaptopMinimal aria-hidden="true" className="size-5 text-fg-muted" />
                <div>
                  <p className="font-medium">{p.label ?? 'Browser'}</p>
                  <p className="text-xs text-fg-muted">
                    Last used {relativeTime(p.last_used_at)} · paired {relativeTime(p.created_at)} ·
                    device <code>{shortId(p.device_id, 12)}</code>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.status} />
                {p.status === 'active' ? (
                  <ConfirmButton
                    label="Unpair"
                    confirmLabel="Unpair browser"
                    busy={busyId === p.id}
                    ariaLabel={`Unpair ${p.label ?? 'browser'}`}
                    onConfirm={() => onRevoke(p.id)}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
