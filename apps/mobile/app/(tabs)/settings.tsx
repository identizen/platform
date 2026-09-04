import * as Application from 'expo-application';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { api } from '../../src/api/client';
import { BUILD_INFO } from '../../src/build-info';
import { authenticate } from '../../src/biometrics';
import {
  forgetIdentity,
  getSummary,
  updateLocalHandle,
  type IdentitySummary,
} from '../../src/identity/identity';
import {
  readDevice,
  readSettings,
  writeDevice,
  writeSettings,
  type Settings,
} from '../../src/identity/store';
import { getBleStatus, useBleStatus } from '../../src/ble/advertiser';
import { syncBleAdvertising } from '../../src/ble/controller';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import { useTheme } from '../../src/theme/useTheme';

export default function SettingsRoute() {
  const router = useRouter();
  const theme = useTheme();
  const [summary, setSummary] = useState<IdentitySummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const ble = useBleStatus();

  // Reload every time the tab gains focus: the handle and registration can change on Home.
  useFocusEffect(
    useCallback(() => {
      void getSummary().then(setSummary);
      void readSettings().then(setSettings);
    }, []),
  );
  // The form copies handle and index into its own state on mount, so it must not mount before
  // both have loaded, and it remounts when either changes underneath it.
  if (!settings || !summary) return null;

  return (
    <SettingsScreen
      key={`${summary.handle ?? ''}|${summary.indexUrl}|${summary.registered ? 1 : 0}`}
      about={{
        version: Application.nativeApplicationVersion,
        build: Application.nativeBuildVersion,
        builtAt: BUILD_INFO.builtAt,
        commit: BUILD_INFO.commit,
      }}
      indexUrl={summary.indexUrl}
      handle={summary.handle}
      registered={summary.registered}
      theme={theme.preference}
      biometricRequired={settings.biometricRequired}
      bluetoothEnabled={settings.bluetoothEnabled}
      bluetoothSupported={ble.supported || getBleStatus().supported}
      onBluetoothEnabled={async (v) => {
        const next = { ...settings, bluetoothEnabled: v };
        await writeSettings(next);
        setSettings(next);
        await syncBleAdvertising();
      }}
      onSaveHandle={async (handle) => {
        const r = await api.setHandle(handle);
        await updateLocalHandle(r.handle);
        setSummary(await getSummary());
      }}
      onSaveIndexUrl={async (url) => {
        const next = { ...settings, indexUrl: url.replace(/\/+$/, '') };
        await writeSettings(next);
        const device = await readDevice();
        if (device && !device.deviceId) await writeDevice({ ...device, indexUrl: next.indexUrl });
        setSettings(next);
        setSummary(await getSummary());
      }}
      onTheme={(t) => void theme.setPreference(t)}
      onBiometricRequired={async (v) => {
        const next = { ...settings, biometricRequired: v };
        await writeSettings(next);
        setSettings(next);
      }}
      onShowPhrase={async () => {
        const gate = await authenticate('Show your recovery phrase', true);
        if (gate.ok) router.push('/phrase');
      }}
      onForget={async () => {
        await forgetIdentity();
        router.replace('/onboarding');
      }}
    />
  );
}
