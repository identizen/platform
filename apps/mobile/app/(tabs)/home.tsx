import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { challengeStore, useActivity, usePendingChallenges } from '../../src/challenges/store';
import { getSummary, register, type IdentitySummary } from '../../src/identity/identity';
import { obtainPushToken, syncPushToken } from '../../src/push';
import { useBleStatus } from '../../src/ble/advertiser';
import { syncBleAdvertising } from '../../src/ble/controller';
import { HomeScreen } from '../../src/screens/HomeScreen';

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
  const bluetooth = useBleStatus();

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
      await syncBleAdvertising();
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
      bluetooth={bluetooth}
      onRegister={() => void doRegister()}
      onOpenChallenge={(id) => router.push({ pathname: '/approve/[id]', params: { id } })}
      onScan={() => router.push('/scan')}
      onRefresh={reload}
    />
  );
}
