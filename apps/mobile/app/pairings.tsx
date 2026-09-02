import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { usePairings } from '../src/app/lists';
import { ListScreen } from '../src/screens/ListScreen';

export default function Pairings() {
  const router = useRouter();
  const list = usePairings();
  return (
    <ListScreen
      heading="Paired browsers"
      intro="Browsers that push straight to this phone. Unpairing makes them show a QR code next time."
      items={list.items}
      loading={list.loading}
      error={list.error}
      emptyText="No paired browsers yet. Sign in from a desktop to pair it."
      revokeLabel="Unpair"
      onRevoke={async (id) => {
        await api.revokePairing(id);
        list.refresh();
      }}
      onRefresh={list.refresh}
      onBack={() => router.back()}
    />
  );
}
