import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { getMnemonic } from '../src/identity/identity';
import { PassphraseScreen } from '../src/screens/PassphraseScreen';

/** "Show recovery phrase" from settings; the biometric gate runs before navigating here. */
export default function Phrase() {
  const router = useRouter();
  const [words, setWords] = useState<string[] | null>(null);
  useEffect(() => {
    void getMnemonic().then((m) => setWords(m ? m.split(' ') : []));
  }, []);
  if (!words) return null;
  return <PassphraseScreen words={words} readOnly onContinue={() => router.back()} />;
}
