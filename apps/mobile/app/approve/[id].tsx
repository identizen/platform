import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { authenticate } from '../../src/biometrics';
import { approveChallenge, denyChallenge, receiveChallenge } from '../../src/challenges/receive';
import { challengeStore, usePendingChallenges } from '../../src/challenges/store';
import { ErrorText, Muted, Screen } from '../../src/components/ui';
import { openRedirect } from '../../src/deeplinks';
import { readSettings } from '../../src/identity/store';
import { ApproveScreen, type ApproveOutcome } from '../../src/screens/ApproveScreen';

export default function Approve() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pending = usePendingChallenges();
  const entry = pending.find((p) => p.challenge.id === id);
  const [error, setError] = useState<string | null>(null);

  // Opened from a link before the challenge was fetched: fetch it now.
  useEffect(() => {
    if (entry || !id || challengeStore.find(id)) return;
    receiveChallenge(id, 'link').catch((err: unknown) => setError(String(err)));
  }, [entry, id]);

  if (!entry) {
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
      `Approve sign-in to ${entry.challenge.rp_name}`,
      settings.biometricRequired,
    );
    if (!gate.ok) return 'cancelled';
    const result = await approveChallenge(entry.challenge, gate.amr);
    if (result.status >= 200 && result.status < 300) {
      if (result.redirect) void openRedirect(result.redirect);
      return 'approved';
    }
    return 'failed';
  };

  return (
    <ApproveScreen
      challenge={entry.challenge}
      onApprove={onApprove}
      onDeny={async () => {
        await denyChallenge(entry.challenge);
      }}
      onDone={() => router.replace('/home')}
    />
  );
}
