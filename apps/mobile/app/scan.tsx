import { useRouter } from 'expo-router';
import { receiveChallenge } from '../src/challenges/receive';
import { ScanScreen } from '../src/screens/ScanScreen';

export default function Scan() {
  const router = useRouter();
  return (
    <ScanScreen
      onScanned={async (id) => {
        await receiveChallenge(id, 'scan');
        router.replace({ pathname: '/approve/[id]', params: { id } });
      }}
      onBack={() => router.back()}
    />
  );
}
