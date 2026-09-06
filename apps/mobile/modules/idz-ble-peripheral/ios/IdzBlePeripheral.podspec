Pod::Spec.new do |s|
  s.name           = 'IdzBlePeripheral'
  s.version        = '0.1.0'
  s.summary        = 'Identizen BLE peripheral: advertises the rotating identifier (PROTOCOL.md 6.3).'
  s.description    = 'CoreBluetooth peripheral that advertises the Identizen service UUID and answers reads of the 16-byte rotating identifier computed by @identizen/protocol.'
  s.license        = 'Apache-2.0'
  s.author         = 'Identizen'
  s.homepage       = 'https://github.com/identizen/platform'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/identizen/platform.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
