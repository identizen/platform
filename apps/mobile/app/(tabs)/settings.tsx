import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { api } from '../../src/api/client';
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

const EMPTY: IdentitySummary = {
  idz: null,
  deviceId: null,
  handle: null,
  indexUrl: '',
  registered: false,
};

export default function SettingsRoute() {
  const router = useRouter();
  const theme = useTheme();
  const [summary, setSummary] = useState<IdentitySummary>(EMPTY);
  const [settings, setSettings] = useState<Settings | null>(null);
  const ble = useBleStatus();

  useEffect(() => {
    void getSummary().then(setSummary);
    void readSettings().then(setSettings);
  }, []);
  if (!settings) return null;

  return (
    <SettingsScreen
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
