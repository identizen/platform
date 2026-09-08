import { useState } from 'react';
import { View } from 'react-native';
import { biometricName } from '../biometrics';
import { Seal, Wordmark } from '../components/brand';
import {
  AdvancedIndexField,
  DEFAULT_INDEX_URL,
  validateIndexInput,
} from '../components/indexField';
import { Body, Button, Heading, Muted, Screen } from '../components/ui';

export interface OnboardingScreenProps {
  /** Create the seed and point it at `indexUrl` (the public index unless changed under Advanced). */
  onCreate: (indexUrl: string) => void;
  onRestore: () => void;
  busy?: boolean;
}

/** PRD 7.1 step 2: "Create your identity." One button. Restore for a new phone (7.5). */
export function OnboardingScreen({ onCreate, onRestore, busy = false }: OnboardingScreenProps) {
  const [indexUrl, setIndexUrl] = useState(DEFAULT_INDEX_URL);
  const [indexError, setIndexError] = useState<string | null>(null);
  const create = () => {
    const checked = validateIndexInput(indexUrl);
    if ('error' in checked) return setIndexError(checked.error);
    setIndexError(null);
    onCreate(checked.url);
  };
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
        <AdvancedIndexField
          value={indexUrl}
          onChange={setIndexUrl}
          error={indexError}
          disabled={busy}
        />
        <Button
          label="Create your identity"
          size="lg"
          onPress={create}
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
