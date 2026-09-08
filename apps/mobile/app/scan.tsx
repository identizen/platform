import { useRouter } from 'expo-router';
import { receiveChallenge } from '../src/challenges/receive';
import { ScanScreen } from '../src/screens/ScanScreen';

export default function Scan() {
  const router = useRouter();
  return (
    <ScanScreen
      onScanned={async (id, indexUrl) => {
        // A code that names its index is fetched there; otherwise every registered index is asked.
        await receiveChallenge(id, 'scan', indexUrl ?? null);
        router.replace({ pathname: '/approve/[id]', params: { id } });
      }}
      onEnrollmentLink={(link) =>
        router.replace({ pathname: '/enroll', params: { index: link.index, token: link.token } })
      }
      onBack={() => router.back()}
    />
  );
}
