import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Body, Button, ErrorText, Heading, Screen } from '../components/ui';

export interface VerifyWordsScreenProps {
  words: string[];
  /** Which word indexes (0-based) to ask for; 3 random ones by default. */
  indexes?: number[];
  onVerified: () => void;
  onBack: () => void;
}

/** Choose 3 distinct random positions (partial Fisher-Yates, so any rand() terminates). */
export function pickWordIndexes(
  count: number,
  pick = 3,
  rand: () => number = Math.random,
): number[] {
  const pool = Array.from({ length: count }, (_, i) => i);
  const n = Math.min(pick, count);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (count - i));
    const a = pool[i] ?? 0;
    pool[i] = pool[j] ?? 0;
    pool[j] = a;
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

/** PRD 7.1 step 4: the user must re-enter 3 randomly chosen words to continue. */
export function VerifyWordsScreen({ words, indexes, onVerified, onBack }: VerifyWordsScreenProps) {
  const asked = useMemo(() => indexes ?? pickWordIndexes(words.length), [indexes, words.length]);
  const [entries, setEntries] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    const wrong = asked.filter((i) => (entries[i] ?? '').trim().toLowerCase() !== words[i]);
    if (wrong.length) {
      setError(
        `Word ${wrong.map((i) => i + 1).join(', ')} does not match. Check your notes and try again.`,
      );
      return;
    }
    setError(null);
    onVerified();
  };

  return (
    <Screen testID="verify-words">
      <Heading>Check your notes</Heading>
      <Body>Enter the words at these positions exactly as you wrote them down.</Body>
      <View className="gap-3">
        {asked.map((i) => (
          <View key={i} className="gap-1">
            <Text className="font-sans text-sm text-fg-muted dark:text-fg-muted-dark">
              Word {i + 1}
            </Text>
            <TextInput
              accessibilityLabel={`Word ${i + 1}`}
              testID={`word-${i + 1}`}
              autoCapitalize="none"
              autoCorrect={false}
              className="h-12 rounded-md border border-border bg-surface-0 px-3 font-mono text-base text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
              value={entries[i] ?? ''}
              onChangeText={(t) => setEntries((e) => ({ ...e, [i]: t }))}
            />
          </View>
        ))}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Continue" onPress={check} testID="verify-continue" />
      <Button label="Show the words again" variant="ghost" onPress={onBack} testID="verify-back" />
    </Screen>
  );
}
