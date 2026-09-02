import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { challengeStore, useActivity, usePendingChallenges } from '../src/challenges/store';
import { getSummary, register, type IdentitySummary } from '../src/identity/identity';
import { obtainPushToken, syncPushToken } from '../src/push';
import { HomeScreen } from '../src/screens/HomeScreen';

const EMPTY: IdentitySummary = {
  idz: null,
  deviceId: null,
  handle: null,
  indexUrl: '',
  registered: false,
};

export default function Home() {
  const router = useRouter();
  const [summary, setSummary] = useState<IdentitySummary>(EMPTY);
  const [registering, setRegistering] = useState(false);
  const pending = usePendingChallenges();
  const activity = useActivity();

  const reload = useCallback(() => {
    challengeStore.pruneExpired();
    void getSummary().then(setSummary);
  }, []);
  useFocusEffect(reload);

  const doRegister = async () => {
    setRegistering(true);
    try {
      await register(await obtainPushToken());
      await syncPushToken();
      reload();
    } catch (err) {
      console.warn('registration failed', err);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <HomeScreen
      idz={summary.idz}
      handle={summary.handle}
      indexUrl={summary.indexUrl}
      registered={summary.registered}
      pending={pending}
      activity={activity}
      registering={registering}
      onRegister={() => void doRegister()}
      onOpenChallenge={(id) => router.push({ pathname: '/approve/[id]', params: { id } })}
      onScan={() => router.push('/scan')}
      onDevices={() => router.push('/devices')}
      onPairings={() => router.push('/pairings')}
      onSessions={() => router.push('/sessions')}
      onSettings={() => router.push('/settings')}
    />
  );
}
