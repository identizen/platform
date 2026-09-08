import { useRouter } from 'expo-router';
import { restoreIdentity } from '../../src/identity/identity';
import { DEFAULT_SETTINGS } from '../../src/identity/store';
import { RestoreScreen } from '../../src/screens/RestoreScreen';

export default function Restore() {
  const router = useRouter();
  return (
    <RestoreScreen
      onRestore={async (mnemonic, indexUrl) => {
        await restoreIdentity(mnemonic, { ...DEFAULT_SETTINGS, activeIndexUrl: indexUrl });
        router.replace('/home');
      }}
      onBack={() => router.back()}
    />
  );
}
