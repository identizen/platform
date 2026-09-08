import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { challengeStore, useActivity, usePendingChallenges } from '../../src/challenges/store';
import { checkPendingEnrollment } from '../../src/enrollment/machine';
import { getSummary, register, type IdentitySummary } from '../../src/identity/identity';
import { setActiveIndex } from '../../src/identity/indexes';
import { EMPTY_ENROLLMENT, readEnrollment, type EnrollmentState } from '../../src/identity/store';
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
  indexes: [],
};

export default function Home() {
  const router = useRouter();
  const [summary, setSummary] = useState<IdentitySummary>(EMPTY);
  const [enrollment, setEnrollment] = useState<EnrollmentState>(EMPTY_ENROLLMENT);
  const [registering, setRegistering] = useState(false);
  const [switching, setSwitching] = useState(false);
  const pending = usePendingChallenges();
  const activity = useActivity();
  const bluetooth = useBleStatus();

  const reload = useCallback(() => {
    challengeStore.pruneExpired();
    void getSummary().then(setSummary);
    void readEnrollment().then(async (state) => {
      setEnrollment(state);
      // An approval decided while the app was away: one status check settles it.
      if (state.pending && (await checkPendingEnrollment(state.pending)) !== 'waiting')
        setEnrollment(await readEnrollment());
    });
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

  // Switching the active index re-points Home, the lists (they refetch on focus) and Bluetooth.
  const selectIndex = async (indexUrl: string) => {
    setSwitching(true);
    try {
      await setActiveIndex(indexUrl);
      await syncBleAdvertising();
      reload();
    } catch (err) {
      console.warn('switching index failed', err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <HomeScreen
      idz={summary.idz}
      handle={summary.handle}
      indexUrl={summary.indexUrl}
      registered={summary.registered}
      indexes={summary.indexes}
      switchingIndex={switching}
      pending={pending}
      activity={activity}
      registering={registering}
      bluetooth={bluetooth}
      managedBy={enrollment.managedBy}
      pendingEnrollment={enrollment.pending}
      onCheckEnrollment={() => {
        const p = enrollment.pending;
        if (p) router.push({ pathname: '/enroll', params: { index: p.indexUrl, token: p.token } });
      }}
      onSelectIndex={(indexUrl) => void selectIndex(indexUrl)}
      onRegister={() => void doRegister()}
      onOpenChallenge={(id) => router.push({ pathname: '/approve/[id]', params: { id } })}
      onScan={() => router.push('/scan')}
      onRefresh={reload}
    />
  );
}
