import { View } from 'react-native';
import { biometricName } from '../biometrics';
import { Seal, Wordmark } from '../components/brand';
import { Body, Button, Heading, Muted, Screen } from '../components/ui';

export interface OnboardingScreenProps {
  onCreate: () => void;
  onRestore: () => void;
  busy?: boolean;
}

/** PRD 7.1 step 2: "Create your identity." One button. Restore for a new phone (7.5). */
export function OnboardingScreen({ onCreate, onRestore, busy = false }: OnboardingScreenProps) {
  return (
    <Screen scroll={false} testID="onboarding">
      <View className="flex-1 justify-center gap-4">
        <View className="items-start gap-5 pb-2">
          <Seal size={72} />
          <Wordmark height={30} dot={false} />
        </View>
        <Heading>Your phone is your identity.</Heading>
        <Body>{`No password. No email. No Google or Microsoft account. One tap, ${biometricName()}, in.`}</Body>
        <Muted>
          Your identity is a key that never leaves this phone. Sites only ever see a per-site
          identifier.
        </Muted>
      </View>
      <View className="gap-3">
        <Button
          label="Create your identity"
          size="lg"
          onPress={onCreate}
          busy={busy}
          testID="create-identity"
        />
        <Button
          label="Restore an identity"
          variant="secondary"
          onPress={onRestore}
          disabled={busy}
          testID="restore-identity"
        />
      </View>
    </Screen>
  );
}
