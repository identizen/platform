import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { useSessions } from '../src/state/lists';
import { ListScreen } from '../src/screens/ListScreen';

export default function Sessions() {
  const router = useRouter();
  const list = useSessions();
  return (
    <ListScreen
      heading="Sessions"
      intro="Sites you are signed in to. Signing out here logs you out there within seconds."
      items={list.items}
      loading={list.loading}
      error={list.error}
      emptyText="No live sessions."
      revokeLabel="Sign out"
      onRevoke={async (sid) => {
        await api.revokeSession(sid);
        list.refresh();
      }}
      onRefresh={list.refresh}
      onBack={() => router.back()}
    />
  );
}
