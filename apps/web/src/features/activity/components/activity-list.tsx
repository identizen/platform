import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { relativeTime, shortId } from '@/lib/format';
import type { AuditEvent } from '../api/audit';

const LABELS: Record<string, string> = {
  'device.enrolled': 'Device enrolled',
  'device.disabled': 'Device disabled',
  'device.enabled': 'Device enabled',
  'device.revoked': 'Device revoked',
  'identity.created': 'Identity created',
  'identity.handle_changed': 'Handle changed',
  'login.challenge_created': 'Sign-in started',
  'login.success': 'Signed in',
  'login.denied': 'Sign-in denied',
  'login.expired': 'Sign-in expired',
  'pairing.created': 'Browser paired',
  'pairing.used': 'Paired browser used',
  'pairing.revoked': 'Browser unpaired',
  'session.created': 'Session started',
  'session.revoked': 'Session ended',
  'verification.created': 'Approval requested',
  'verification.approved': 'Approval granted',
  'verification.denied': 'Approval denied',
  'verification.timeout': 'Approval timed out',
};

export interface ActivityListProps {
  events: AuditEvent[];
}

/** Presentational audit timeline. */
export function ActivityList({ events }: ActivityListProps) {
  if (events.length === 0) {
    return (
      <EmptyState title="Nothing yet">
        Sign-ins, approvals, and changes will show up here.
      </EmptyState>
    );
  }
  return (
    <ol className="divide-y rounded-lg border" aria-label="Activity">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 p-3">
          <Activity aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{LABELS[e.kind] ?? e.kind}</p>
            <p className="truncate text-xs text-fg-muted">
              {e.client_id ? <code>{e.client_id}</code> : null}
              {e.client_id && e.device_id ? ' · ' : ''}
              {e.device_id ? <code>{shortId(e.device_id, 12)}</code> : null}
              {e.detail && typeof e.detail.reason === 'string' ? ` · ${e.detail.reason}` : ''}
            </p>
          </div>
          <time dateTime={e.at} className="shrink-0 text-xs text-fg-muted">
            {relativeTime(e.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
