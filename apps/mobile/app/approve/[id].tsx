import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { authenticate } from '../../src/biometrics';
import { approveChallenge, denyChallenge, receiveChallenge } from '../../src/challenges/receive';
import { challengeStore } from '../../src/challenges/store';
import { useChallenge } from '../../src/challenges/useChallenge';
import { ErrorText, Muted, Screen } from '../../src/components/ui';
import { readSettings } from '../../src/identity/store';
import { ApproveScreen, type ApproveOutcome } from '../../src/screens/ApproveScreen';

export default function Approve() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Retained after approval or denial removes it from the store, so the result screen stays up.
  const challenge = useChallenge(id);
  const [error, setError] = useState<string | null>(null);

  // Opened from a link before the challenge was fetched: fetch it now.
  useEffect(() => {
    if (challenge || !id || challengeStore.find(id)) return;
    receiveChallenge(id, 'link').catch((err: unknown) => setError(String(err)));
  }, [challenge, id]);

  if (!challenge) {
    return (
      <Screen
        scroll={false}
        testID="approve-loading"
        title="Sign-in request"
        onBack={() => router.replace('/home')}
      >
        <View className="flex-1 items-center justify-center">
          {error ? <ErrorText>{error}</ErrorText> : <Muted>Fetching the request…</Muted>}
        </View>
      </Screen>
    );
  }

  const onApprove = async (): Promise<ApproveOutcome> => {
    const settings = await readSettings();
    const gate = await authenticate(
      `Approve sign-in to ${challenge.rp_name}`,
      settings.biometricRequired,
    );
    if (!gate.ok) return 'cancelled';
    const result = await approveChallenge(challenge, gate.amr);
    // The waiting browser receives the OIDC redirect itself (WebSocket or poll). Opening it here
    // would run the site's callback in a browser that holds none of that tab's sign-in state.
    if (result.status >= 200 && result.status < 300) return 'approved';
    return 'failed';
  };

  return (
    <ApproveScreen
      challenge={challenge}
      onApprove={onApprove}
      onDeny={async () => {
        await denyChallenge(challenge);
      }}
      onDone={() => router.replace('/home')}
    />
  );
}
