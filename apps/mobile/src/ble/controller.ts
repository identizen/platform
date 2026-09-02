/**
 * Decides whether the phone should be advertising right now (registered + setting on) and keeps the
 * advertiser in that state. Called at boot, after registration, and when the setting changes.
 */
import { readDevice, readSettings } from '../identity/store';
import { startBleAdvertising, stopBleAdvertising } from './advertiser';

let onCentralRead: ((at: number) => void) | null = null;

/** useBootstrap installs the handler that drains the inbox when a computer reads our id. */
export function setBleReadHandler(handler: ((at: number) => void) | null): void {
  onCentralRead = handler;
}

/** Reconcile the advertiser with the stored device and settings. Safe to call often. */
export async function syncBleAdvertising(): Promise<void> {
  const [device, settings] = await Promise.all([readDevice(), readSettings()]);
  const shouldRun = Boolean(device?.deviceId) && settings.bluetoothEnabled;
  if (!shouldRun || !device) {
    stopBleAdvertising();
    return;
  }
  await startBleAdvertising({
    bleKeyHex: device.bleKeyHex,
    onCentralRead: (at) => onCentralRead?.(at),
  });
}
