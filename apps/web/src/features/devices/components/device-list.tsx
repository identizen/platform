import { Badge, Card, CardContent } from '@identizen/ui';
import { Bluetooth, Smartphone } from 'lucide-react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { relativeTime, shortId } from '@/lib/format';
import type { Device } from '../types';

export interface DeviceListProps {
  devices: Device[];
  busyId: string | null;
  onRevoke: (id: string) => void;
}

const PLATFORM: Record<string, string> = { apns: 'iPhone', fcm: 'Android', web: 'Web' };

/** Presentational list of enrolled devices. */
export function DeviceList({ devices, busyId, onRevoke }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <EmptyState title="No devices yet">
        Install the Identizen app and create your identity.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Devices">
      {devices.map((d) => (
        <li key={d.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Smartphone aria-hidden="true" className="size-5 text-fg-muted" />
                <div>
                  <p className="font-medium">
                    {PLATFORM[d.push_platform ?? ''] ?? 'Device'}{' '}
                    <code className="text-xs text-fg-muted">{shortId(d.id, 12)}</code>
                  </p>
                  <p className="text-xs text-fg-muted">
                    Last seen {relativeTime(d.last_seen_at)} · enrolled {relativeTime(d.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.current ? <Badge>This device</Badge> : null}
                {d.has_ble ? (
                  <Badge variant="neutral">
                    <Bluetooth aria-hidden="true" className="mr-1 size-3" />
                    Bluetooth
                  </Badge>
                ) : null}
                <StatusBadge status={d.status} />
                {d.status !== 'revoked' ? (
                  <ConfirmButton
                    label="Revoke"
                    confirmLabel="Revoke device"
                    busy={busyId === d.id}
                    ariaLabel={`Revoke device ${shortId(d.id, 12)}`}
                    onConfirm={() => onRevoke(d.id)}
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
