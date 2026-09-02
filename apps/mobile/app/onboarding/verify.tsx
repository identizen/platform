import { Redirect, useRouter } from 'expo-router';
import { onboardingState } from '../../src/app/onboardingState';
import { VerifyWordsScreen } from '../../src/screens/VerifyWordsScreen';

export default function Verify() {
  const router = useRouter();
  const words = onboardingState.get();
  if (!words) return <Redirect href="/onboarding" />;
  return (
    <VerifyWordsScreen
      words={words}
      onVerified={() => {
        onboardingState.clear();
        router.replace('/home');
      }}
      onBack={() => router.back()}
    />
  );
}
