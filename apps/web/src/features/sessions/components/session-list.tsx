import { Card, CardContent } from '@identizen/ui';
import { Shield } from 'lucide-react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { EmptyState } from '@/components/shared/empty-state';
import { relativeTime, shortId } from '@/lib/format';
import type { Session } from '../api/sessions';

export interface SessionListProps {
  sessions: Session[];
  /** The dashboard's own session id, marked so the user knows revoking it signs them out. */
  currentSid: string | null;
  busyId: string | null;
  onRevoke: (sid: string) => void;
}

/** Presentational list of live sessions. */
export function SessionList({ sessions, currentSid, busyId, onRevoke }: SessionListProps) {
  if (sessions.length === 0) {
    return <EmptyState title="No live sessions">Sites you sign in to will appear here.</EmptyState>;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Sessions">
      {sessions.map((s) => (
        <li key={s.sid}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Shield aria-hidden="true" className="size-5 text-fg-muted" />
                <div>
                  <p className="font-medium">
                    <code>{s.client_id}</code>
                    {s.sid === currentSid ? (
                      <span className="ml-2 text-xs text-accent-soft-fg">this dashboard</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    Signed in {relativeTime(s.created_at)} · expires {relativeTime(s.expires_at)} ·
                    device <code>{shortId(s.device_id, 12)}</code>
                  </p>
                </div>
              </div>
              <ConfirmButton
                label="Sign out"
                confirmLabel="End session"
                busy={busyId === s.sid}
                ariaLabel={`End session ${shortId(s.sid, 8)}`}
                onConfirm={() => onRevoke(s.sid)}
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
