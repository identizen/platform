import { useRouter } from 'expo-router';
import { useState } from 'react';
import { onboardingState } from '../../src/state/onboardingState';
import { createIdentity } from '../../src/identity/identity';
import { OnboardingScreen } from '../../src/screens/OnboardingScreen';

export default function Onboarding() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      onboardingState.set(await createIdentity());
      router.push('/onboarding/passphrase');
    } finally {
      setBusy(false);
    }
  };
  return (
    <OnboardingScreen
      onCreate={() => void create()}
      onRestore={() => router.push('/onboarding/restore')}
      busy={busy}
    />
  );
}
