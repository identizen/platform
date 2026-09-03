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
import { recentlyReadOverBluetooth, stopBleAdvertising } from '../ble/advertiser';
import { setBleReadHandler, syncBleAdvertising } from '../ble/controller';
import { challengeStore, type PendingChallenge } from '../challenges/store';
import { drainInboxOnce, handleIncomingChallenge, syncPushToken } from '../push';
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
    // Tokens rotate and the preferred kind can change between builds (raw APNs -> Expo relay).
    void syncPushToken();
  }, []);

  useEffect(() => {
    const open = (id: string, via: PendingChallenge['via']) => {
      // A challenge that lands right after a computer read our id came in over Bluetooth.
      const tagged = via !== 'push' && recentlyReadOverBluetooth() ? 'bluetooth' : via;
      void handleIncomingChallenge(id, tagged).then(() => {
        if (challengeStore.find(id))
          routerRef.current.push({ pathname: '/approve/[id]', params: { id } });
      });
    };
    const stopPush = listenForPushes((id) => open(id, 'push'));
    const stopPoll = startInboxPolling((id) => open(id, 'poll'));
    setBleReadHandler(() => void drainInboxOnce((id) => open(id, 'bluetooth')));
    void syncBleAdvertising();
    return () => {
      stopPush();
      stopPoll();
      setBleReadHandler(null);
      stopBleAdvertising();
    };
  }, []);

  return { ready: fontsLoaded && identity !== null, identity };
}
