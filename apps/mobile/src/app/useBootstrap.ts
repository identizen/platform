/**
 * Root-level wiring: fonts, theme, activity log, push listeners, inbox polling, and navigation to
 * the approve screen when a challenge arrives. Used once in app/_layout.tsx.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { challengeStore } from '../challenges/store';
import { handleIncomingChallenge } from '../push';
import { listenForPushes, startInboxPolling } from '../push';
import { hasIdentity } from '../identity/identity';
import { useTheme } from '../theme/useTheme';

export function useBootstrap(): { ready: boolean; identity: boolean | null } {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [identity, setIdentity] = useState<boolean | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  useTheme();

  useEffect(() => {
    void challengeStore.load();
    void hasIdentity().then(setIdentity);
  }, []);

  useEffect(() => {
    const open = (id: string, via: 'push' | 'poll') => {
      void handleIncomingChallenge(id, via).then(() => {
        if (challengeStore.find(id))
          routerRef.current.push({ pathname: '/approve/[id]', params: { id } });
      });
    };
    const stopPush = listenForPushes((id) => open(id, 'push'));
    const stopPoll = startInboxPolling((id) => open(id, 'poll'));
    return () => {
      stopPush();
      stopPoll();
    };
  }, []);

  return { ready: fontsLoaded && identity !== null, identity };
}
