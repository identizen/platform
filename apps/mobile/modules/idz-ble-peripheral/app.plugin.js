/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS */
const { withInfoPlist } = require('@expo/config-plugins');

const USAGE =
  'Identizen lets a nearby computer find this phone over Bluetooth so you can approve a sign-in without scanning a code.';

/**
 * Config plugin for modules/idz-ble-peripheral: Bluetooth usage string and the peripheral
 * background mode, so an in-progress GATT read survives the app going to the background.
 * (iOS moves the service UUID to the overflow area in the background, so Chromium only finds the
 * phone while the app is in the foreground. That is expected.)
 */
module.exports = function withIdzBlePeripheral(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.NSBluetoothAlwaysUsageDescription ??= USAGE;
    const modes = new Set(c.modResults.UIBackgroundModes ?? []);
    modes.add('bluetooth-peripheral');
    c.modResults.UIBackgroundModes = [...modes];
    return c;
  });
};
