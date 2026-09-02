import { View } from 'react-native';
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
      <View className="flex-1 justify-center gap-3">
        <Heading>Your phone is your identity.</Heading>
        <Body>No password. No email. No Google or Microsoft account. One tap, Face ID, in.</Body>
        <Muted>
          Your identity is a key that never leaves this phone. Sites only ever see a per-site
          identifier.
        </Muted>
      </View>
      <View className="gap-3">
        <Button
          label="Create your identity"
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
