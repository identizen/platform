/**
 * Push delivery. The payload is only `{ challenge_id }` (PROTOCOL.md section 7); the phone fetches
 * the signed challenge itself. When notifications are unavailable (Expo Go, simulator, denied
 * permission) the install registers `push_token: 'poll'` and drains its inbox on an interval.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { readDevice, writeDevice } from '../identity/store';
import { receiveChallenge } from '../challenges/receive';
import type { PendingChallenge } from '../challenges/store';

export interface PushRegistration {
  platform: 'apns' | 'fcm' | 'web';
  token: string;
}

/** Ask for permission and read the raw device token (APNs on iOS, FCM on Android). */
export async function obtainPushToken(): Promise<PushRegistration> {
  try {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return { platform: 'web', token: 'poll' };
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== 'string' || token.data.length === 0)
      return { platform: 'web', token: 'poll' };
    return { platform: Platform.OS === 'ios' ? 'apns' : 'fcm', token: token.data };
  } catch {
    return { platform: 'web', token: 'poll' };
  }
}

/** Re-sync the token with the index after registration (tokens rotate; permissions change). */
export async function syncPushToken(): Promise<void> {
  const device = await readDevice();
  if (!device?.deviceId) return;
  const reg = await obtainPushToken();
  const mode = reg.token === 'poll' ? 'poll' : reg.platform === 'web' ? 'poll' : reg.platform;
  if (device.pushMode === mode && mode !== 'apns' && mode !== 'fcm') return;
  await api.updatePushToken(device.deviceId, reg.token, reg.platform);
  await writeDevice({ ...device, pushMode: mode });
}

type Unsubscribe = () => void;

/** Foreground and tap handlers: both lead to the approve screen through `onChallenge`. */
export function listenForPushes(onChallenge: (challengeId: string) => void): Unsubscribe {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
  const pick = (data: unknown): string | null => {
    const id = (data as { challenge_id?: unknown } | null)?.challenge_id;
    return typeof id === 'string' ? id : null;
  };
  const a = Notifications.addNotificationReceivedListener((n) => {
    const id = pick(n.request.content.data);
    if (id) onChallenge(id);
  });
  const b = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = pick(r.notification.request.content.data);
    if (id) onChallenge(id);
  });
  return () => {
    a.remove();
    b.remove();
  };
}

/**
 * Drain the inbox once, right now. Used when a nearby computer reads our Bluetooth id: the index is
 * about to enqueue a challenge, so we do not wait for the next poll tick. No-op for APNs/FCM installs.
 */
export async function drainInboxOnce(onChallenge: (challengeId: string) => void): Promise<void> {
  try {
    const device = await readDevice();
    if (device?.deviceId && device.pushMode === 'poll') {
      for (const id of await api.inbox(device.deviceId)) onChallenge(id);
    }
  } catch {
    /* offline; the regular poll will catch up */
  }
}

/** Inbox polling for installs without push. Returns a stop function. */
export function startInboxPolling(
  onChallenge: (challengeId: string) => void,
  intervalMs = 2000,
): Unsubscribe {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const device = await readDevice();
      if (device?.deviceId && device.pushMode === 'poll') {
        for (const id of await api.inbox(device.deviceId)) onChallenge(id);
      }
    } catch {
      /* offline; try again */
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  timer = setTimeout(() => void tick(), 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Default handler: fetch + verify; the store makes it visible to the UI. */
export async function handleIncomingChallenge(
  challengeId: string,
  via: PendingChallenge['via'],
): Promise<void> {
  try {
    await receiveChallenge(challengeId, via);
  } catch (err) {
    console.warn('challenge rejected', err);
  }
}
