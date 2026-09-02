import { PageHeader } from '@/components/shared/page-header';
import { useSession } from '@/features/auth';
import { SessionList } from '../components/session-list';
import { useRevokeSession, useSessions } from '../hooks/use-sessions';

/** Container: `/sessions`. */
export function SessionsRoute() {
  const me = useSession();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  return (
    <>
      <PageHeader
        title="Sessions"
        description="Where you are signed in right now. Ending a session logs that site out within seconds."
      />
      <p role="status" aria-live="polite" className="mb-3 text-sm text-fg-muted">
        {revoke.isSuccess ? 'Session ended.' : revoke.isError ? revoke.error.message : ''}
      </p>
      {sessions.isPending ? (
        <p className="text-sm text-fg-muted">Loading sessions…</p>
      ) : sessions.isError ? (
        <p className="text-sm text-danger-soft-fg">{sessions.error.message}</p>
      ) : (
        <SessionList
          sessions={sessions.data.sessions}
          currentSid={me?.claims.sid ?? null}
          busyId={revoke.isPending ? revoke.variables : null}
          onRevoke={(sid) => revoke.mutate(sid)}
        />
      )}
    </>
  );
}
