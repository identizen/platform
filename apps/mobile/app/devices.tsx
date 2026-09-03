import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { useDevices } from '../src/state/lists';
import { ListScreen } from '../src/screens/ListScreen';

export default function Devices() {
  const router = useRouter();
  const list = useDevices();
  return (
    <ListScreen
      heading="Devices"
      intro="Every phone holding this identity. Revoking a device ends its sessions everywhere and removes its paired browsers."
      items={list.items}
      loading={list.loading}
      error={list.error}
      emptyText="No devices."
      revokeLabel="Revoke"
      onRevoke={async (id) => {
        await api.revokeDevice(id);
        list.refresh();
      }}
      onRefresh={list.refresh}
      onBack={() => router.back()}
    />
  );
}
