import { useRouter } from 'expo-router';
import { useState } from 'react';
import { onboardingState } from '../../src/state/onboardingState';
import { createIdentity } from '../../src/identity/identity';
import { DEFAULT_SETTINGS } from '../../src/identity/store';
import { OnboardingScreen } from '../../src/screens/OnboardingScreen';

export default function Onboarding() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async (indexUrl: string) => {
    setBusy(true);
    try {
      onboardingState.set(await createIdentity({ ...DEFAULT_SETTINGS, activeIndexUrl: indexUrl }));
      router.push('/onboarding/passphrase');
    } finally {
      setBusy(false);
    }
  };
  return (
    <OnboardingScreen
      onCreate={(indexUrl) => void create(indexUrl)}
      onRestore={() => router.push('/onboarding/restore')}
      busy={busy}
    />
  );
}
