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
import { addIndex, forgetIndex, setActiveIndex } from '../../src/identity/indexes';
import {
  readEnrollment,
  readSettings,
  writeSettings,
  type ManagedBy,
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
  const [managedBy, setManagedBy] = useState<ManagedBy | null>(null);
  const ble = useBleStatus();

  const reload = useCallback(async () => {
    setSummary(await getSummary());
    setSettings(await readSettings());
    setManagedBy((await readEnrollment()).managedBy);
  }, []);

  // Reload every time the tab gains focus: the handle, registration and active index can change
  // on Home.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  // The form copies the handle into its own state on mount, so it must not mount before the
  // summary has loaded, and it remounts when the active index or the handle changes underneath.
  if (!settings || !summary) return null;

  // Adding, switching or forgetting an index changes what Bluetooth advertises.
  const afterIndexChange = async () => {
    await syncBleAdvertising();
    await reload();
  };

  return (
    <SettingsScreen
      key={`${summary.handle ?? ''}|${summary.indexUrl}|${summary.registered ? 1 : 0}|${summary.indexes.length}`}
      about={{
        version: Application.nativeApplicationVersion,
        build: Application.nativeBuildVersion,
        builtAt: BUILD_INFO.builtAt,
        commit: BUILD_INFO.commit,
      }}
      indexes={summary.indexes}
      handle={summary.handle}
      registered={summary.registered}
      managedBy={managedBy}
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
      onMakeActive={async (indexUrl) => {
        await setActiveIndex(indexUrl);
        await afterIndexChange();
      }}
      onForgetIndex={async (indexUrl) => {
        await forgetIndex(indexUrl);
        await afterIndexChange();
      }}
      onAddIndex={async (url) => {
        // Registration reads the seed from the keychain, which is where biometrics are asked.
        await addIndex(url);
        await afterIndexChange();
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
