import { PageHeader } from '@/components/shared/page-header';
import { ActivityList } from '../components/activity-list';
import { useAudit } from '../hooks/use-audit';

/** Container: `/activity`. */
export function ActivityRoute() {
  const audit = useAudit();
  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything that happened to your identity, newest first."
      />
      {audit.isPending ? (
        <p className="text-sm text-fg-muted">Loading activity…</p>
      ) : audit.isError ? (
        <p className="text-sm text-danger-soft-fg">{audit.error.message}</p>
      ) : (
        <ActivityList events={audit.data.events} />
      )}
    </>
  );
}
