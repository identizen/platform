import { Redirect, useRouter } from 'expo-router';
import { onboardingState } from '../../src/state/onboardingState';
import { PassphraseScreen } from '../../src/screens/PassphraseScreen';

export default function Passphrase() {
  const router = useRouter();
  const words = onboardingState.get();
  if (!words) return <Redirect href="/onboarding" />;
  return <PassphraseScreen words={words} onContinue={() => router.push('/onboarding/verify')} />;
}
