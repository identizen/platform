import { useState } from 'react';
import { TextInput } from 'react-native';
import { BIP39_WORDLIST, mnemonicToSeed } from '@identizen/protocol';
import {
  AdvancedIndexField,
  DEFAULT_INDEX_URL,
  validateIndexInput,
} from '../components/indexField';
import { Body, Button, ErrorText, Heading, Muted, Screen } from '../components/ui';

export interface RestoreScreenProps {
  /** Throws when the phrase is invalid (checksum, length). `indexUrl` is where it registers first. */
  onRestore: (mnemonic: string, indexUrl: string) => Promise<void>;
  onBack: () => void;
}

/** Client-side hints before we hand the phrase to `mnemonicToSeed`. */
export function validatePhrase(input: string): string | null {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 24) return `Enter all 24 words (${words.length} so far).`;
  const unknown = words.filter((w) => !BIP39_WORDLIST.includes(w));
  if (unknown.length) return `Not in the word list: ${unknown.slice(0, 3).join(', ')}.`;
  try {
    mnemonicToSeed(words.join(' '));
  } catch {
    return BAD_PHRASE;
  }
  return null;
}

const BAD_PHRASE = 'That phrase does not check out. Check the order and spelling of every word.';

/** Only a checksum failure is the phrase's fault; anything else is this phone refusing the seed. */
export function restoreErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/mnemonic|checksum/i.test(message)) return BAD_PHRASE;
  return `The phrase is valid but this phone could not save it. ${message}`;
}

/** PRD 7.5: restore on a new phone from the 24 words. */
export function RestoreScreen({ onRestore, onBack }: RestoreScreenProps) {
  const [phrase, setPhrase] = useState('');
  const [indexUrl, setIndexUrl] = useState(DEFAULT_INDEX_URL);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const hint = validatePhrase(phrase);
    if (hint) return setError(hint);
    const checked = validateIndexInput(indexUrl);
    if ('error' in checked) return setIndexError(checked.error);
    setIndexError(null);
    setBusy(true);
    setError(null);
    try {
      await onRestore(phrase.trim().toLowerCase().split(/\s+/).join(' '), checked.url);
    } catch (err) {
      setError(restoreErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="restore" onBack={onBack}>
      <Heading>Restore an identity</Heading>
      <Body>Enter your 24 recovery words, separated by spaces.</Body>
      <TextInput
        accessibilityLabel="Recovery phrase"
        testID="phrase-input"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        className="min-h-[140px] rounded-md border border-border bg-surface-0 p-3 font-mono text-base text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
        value={phrase}
        onChangeText={setPhrase}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Muted>
        The phrase never leaves this phone. Your identity will be identical to the one on your old
        phone. Organization indexes are added again by enrolling, or from Settings.
      </Muted>
      <AdvancedIndexField
        value={indexUrl}
        onChange={setIndexUrl}
        error={indexError}
        disabled={busy}
      />
      <Button label="Restore" onPress={() => void submit()} busy={busy} testID="restore-submit" />
    </Screen>
  );
}
