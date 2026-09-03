/**
 * Push delivery. The payload is only `{ challenge_id }` (PROTOCOL.md section 7); the phone fetches
 * the signed challenge itself. When notifications are unavailable (Expo Go, simulator, denied
 * permission) the install registers `push_token: 'poll'` and drains its inbox on an interval.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { api } from '../api/client';
import { readDevice, writeDevice } from '../identity/store';
import { receiveChallenge } from '../challenges/receive';
import type { PendingChallenge } from '../challenges/store';

export interface PushRegistration {
  platform: 'apns' | 'fcm' | 'web';
  token: string;
}

const POLL: PushRegistration = { platform: 'web', token: 'poll' };

/** The EAS project id from app.json; Expo push tokens are scoped to it. */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Ask for permission and obtain a push token. Preferred: an Expo push token, which the index
 * relays through Expo's push service (it speaks APNs and FCM for us; see the index's
 * ExpoPushSender). Fallback: the raw APNs / FCM device token, for an index that talks to Apple
 * or Google directly. Either way the platform records where the phone lives.
 */
export async function obtainPushToken(): Promise<PushRegistration> {
  try {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return POLL;
    const platform = Platform.OS === 'ios' ? 'apns' : 'fcm';
    const projectId = easProjectId();
    if (projectId) {
      try {
        const expo = await Notifications.getExpoPushTokenAsync({ projectId });
        if (typeof expo.data === 'string' && expo.data.length > 0)
          return { platform, token: expo.data };
      } catch {
        /* no Expo token (offline, or not an EAS build); fall through to the device token */
      }
    }
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== 'string' || token.data.length === 0) return POLL;
    return { platform, token: token.data };
  } catch {
    return POLL;
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
 * Drain the inbox once, right now. The index queues every challenge aimed at this device in its
 * inbox whatever push platform we registered with, so this is the delivery of record; a push
 * notification only gets us here sooner. Also used when a nearby computer reads our Bluetooth id.
 */
export async function drainInboxOnce(onChallenge: (challengeId: string) => void): Promise<void> {
  try {
    const device = await readDevice();
    if (device?.deviceId) {
      for (const id of await api.inbox(device.deviceId)) onChallenge(id);
    }
  } catch {
    /* offline; the regular poll will catch up */
  }
}

/**
 * Inbox polling for every enrolled install, while the app is in the foreground. Drains at once
 * when the app comes back to the foreground, since that is when a person looks for the request.
 * Returns a stop function.
 */
export function startInboxPolling(
  onChallenge: (challengeId: string) => void,
  intervalMs = 2000,
): Unsubscribe {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    const state = AppState.currentState;
    if (state !== 'background' && state !== 'inactive') await drainInboxOnce(onChallenge);
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && !stopped) void drainInboxOnce(onChallenge);
  });
  timer = setTimeout(() => void tick(), 0);
  return () => {
    stopped = true;
    sub.remove();
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
