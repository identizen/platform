import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import type { ThemePreference } from '../theme/useTheme';
import { Button, Card, ErrorText, Heading, Muted, Screen } from '../components/ui';

const HANDLE_RE = /^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/;

/** Same rule as the index's HandleSchema: 3–32 chars, lower-case, starts/ends alphanumeric. */
export function validateHandle(input: string): string | null {
  const h = input.trim().toLowerCase();
  if (h.length === 0) return null;
  if (h.length < 3 || h.length > 32) return 'A handle is 3 to 32 characters.';
  if (!HANDLE_RE.test(h))
    return 'Use lower-case letters, digits, dots, dashes or underscores; start and end with a letter or digit.';
  return null;
}

export interface SettingsScreenProps {
  indexUrl: string;
  handle: string | null;
  registered: boolean;
  theme: ThemePreference;
  biometricRequired: boolean;
  onSaveHandle: (handle: string | null) => Promise<void>;
  onSaveIndexUrl: (url: string) => Promise<void>;
  onTheme: (t: ThemePreference) => void;
  onBiometricRequired: (v: boolean) => Promise<void>;
  onShowPhrase: () => Promise<void>;
  onForget: () => Promise<void>;
  onBack: () => void;
}

export function SettingsScreen(p: SettingsScreenProps) {
  const [handle, setHandle] = useState(p.handle ?? '');
  const [handleError, setHandleError] = useState<string | null>(null);
  const [indexUrl, setIndexUrl] = useState(p.indexUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const saveHandle = () => {
    const err = validateHandle(handle);
    setHandleError(err);
    if (err) return;
    void run('handle', () => p.onSaveHandle(handle.trim() ? handle.trim().toLowerCase() : null));
  };

  const themes: ThemePreference[] = ['system', 'light', 'dark'];

  return (
    <Screen testID="settings">
      <Heading>Settings</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <Text className="font-medium text-base text-fg dark:text-fg-dark">Handle</Text>
        <Muted>Optional. A site only sees it if you release it. Leave empty for none.</Muted>
        <TextInput
          accessibilityLabel="Handle"
          testID="handle-input"
          autoCapitalize="none"
          autoCorrect={false}
          value={handle}
          onChangeText={setHandle}
          editable={p.registered}
          className="h-12 rounded-md border border-border bg-surface-0 px-3 font-mono text-base text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
        />
        {handleError ? <ErrorText>{handleError}</ErrorText> : null}
        <Button
          label="Save handle"
          variant="secondary"
          onPress={saveHandle}
          busy={busy === 'handle'}
          disabled={!p.registered}
          testID="save-handle"
        />
      </Card>

      <Card>
        <Text className="font-medium text-base text-fg dark:text-fg-dark">Appearance</Text>
        <View className="flex-row gap-2">
          {themes.map((t) => (
            <View key={t} className="flex-1">
              <Button
                label={t}
                variant={p.theme === t ? 'primary' : 'secondary'}
                onPress={() => p.onTheme(t)}
                testID={`theme-${t}`}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-0.5">
            <Text className="font-medium text-base text-fg dark:text-fg-dark">
              Require Face ID / Touch ID
            </Text>
            <Muted>
              Every approval asks for biometrics. Turning this off falls back to the device
              passcode.
            </Muted>
          </View>
          <Switch
            accessibilityLabel="Require biometrics"
            value={p.biometricRequired}
            onValueChange={(v) => void run('bio', () => p.onBiometricRequired(v))}
            testID="biometric-switch"
          />
        </View>
      </Card>

      <Card>
        <Text className="font-medium text-base text-fg dark:text-fg-dark">Index</Text>
        <Muted>
          Where this phone is registered. Changing it before registration points a new identity at
          another index.
        </Muted>
        <TextInput
          accessibilityLabel="Index URL"
          testID="index-url-input"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={indexUrl}
          onChangeText={setIndexUrl}
          editable={!p.registered}
          className="h-12 rounded-md border border-border bg-surface-0 px-3 font-mono text-sm text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
        />
        <Button
          label="Save index"
          variant="secondary"
          onPress={() => void run('index', () => p.onSaveIndexUrl(indexUrl.trim()))}
          busy={busy === 'index'}
          disabled={p.registered}
        />
      </Card>

      <Card>
        <Text className="font-medium text-base text-fg dark:text-fg-dark">Recovery phrase</Text>
        <Muted>Shown after Face ID. Never share it.</Muted>
        <Button
          label="Show recovery phrase"
          variant="secondary"
          onPress={() => void run('phrase', p.onShowPhrase)}
          busy={busy === 'phrase'}
          testID="show-phrase"
        />
      </Card>

      <Card>
        <Text className="font-medium text-base text-danger dark:text-danger-dark">Danger zone</Text>
        <Muted>
          Forgetting removes the identity from this phone. You can restore it from the 24 words.
          Revoke the device from another phone or the dashboard so it can no longer sign.
        </Muted>
        {confirmForget ? (
          <Button
            label="Yes, forget this identity"
            variant="danger"
            onPress={() => void run('forget', p.onForget)}
            busy={busy === 'forget'}
            testID="forget-confirm"
          />
        ) : (
          <Button
            label="Forget identity on this phone"
            variant="secondary"
            onPress={() => setConfirmForget(true)}
            testID="forget"
          />
        )}
      </Card>

      <Button label="Back" variant="ghost" onPress={p.onBack} />
    </Screen>
  );
}
