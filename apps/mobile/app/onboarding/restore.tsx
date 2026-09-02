import { useRouter } from 'expo-router';
import { restoreIdentity } from '../../src/identity/identity';
import { RestoreScreen } from '../../src/screens/RestoreScreen';

export default function Restore() {
  const router = useRouter();
  return (
    <RestoreScreen
      onRestore={async (mnemonic) => {
        await restoreIdentity(mnemonic);
        router.replace('/home');
      }}
      onBack={() => router.back()}
    />
  );
}
