import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { WordGrid } from '../components/challenge';
import { Body, Button, Card, Heading, Muted, Screen } from '../components/ui';

export interface PassphraseScreenProps {
  words: string[];
  onContinue: () => void;
  /** "Show recovery phrase" from settings: no continue step, just a close. */
  readOnly?: boolean;
}

/**
 * PRD 7.1 step 4: the passphrase is shown once. Copy is disabled (the words are rendered as
 * non-selectable text), screenshots are blocked where the OS allows it and detected otherwise.
 * "This is the only place the app is allowed to be serious."
 */
export function PassphraseScreen({ words, onContinue, readOnly = false }: PassphraseScreenProps) {
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  ScreenCapture.usePreventScreenCapture();
  useEffect(() => {
    const sub = ScreenCapture.addScreenshotListener(() => setScreenshotWarning(true));
    return () => sub.remove();
  }, []);

  return (
    <Screen testID="passphrase" onBack={readOnly ? onContinue : undefined}>
      <Heading>This is your identity.</Heading>
      <Body>
        Write these 24 words down, in order, somewhere safe. They are the only way to get your
        identity back on a new phone.
      </Body>
      <Card>
        <Muted>If you lose this, no one — including us — can get it back.</Muted>
      </Card>
      <WordGrid words={words} />
      {screenshotWarning ? (
        <Card>
          <Body>
            A screenshot was taken. Screenshots sync to clouds and photo libraries; write the words
            down instead and delete the picture.
          </Body>
        </Card>
      ) : null}
      <View className="gap-2 pt-2">
        {readOnly ? (
          <Button label="Done" onPress={onContinue} testID="passphrase-done" />
        ) : (
          <Button label="I wrote them down" onPress={onContinue} testID="passphrase-continue" />
        )}
      </View>
    </Screen>
  );
}
