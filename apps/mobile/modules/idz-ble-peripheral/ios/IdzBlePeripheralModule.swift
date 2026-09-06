import CoreBluetooth
import ExpoModulesCore

// PROTOCOL.md §6.3: the phone advertises this service; the browser (Chromium Web Bluetooth)
// connects and reads the 16-byte rotating identifier from the characteristic, then POSTs it to
// /discover/ble. Only the index can map the identifier back to a device.
private let kServiceUUID = CBUUID(string: "F1D0E1A2-1D2E-4B0C-9C0D-1D3E2F4A5B6C")
private let kCharacteristicUUID = CBUUID(string: "F1D0E1A2-1D2E-4B0C-9C0D-1D3E2F4A5B6D")
private let kLocalName = "Identizen"

/// Owns the CBPeripheralManager. All calls happen on the main queue.
final class BlePeripheralAdvertiser: NSObject, CBPeripheralManagerDelegate {
  private var manager: CBPeripheralManager?
  private var characteristic: CBMutableCharacteristic?
  private var rotatingId = Data()
  private var wantAdvertising = false
  private var serviceAdded = false
  private var lastError: String?

  /// Module hook: (event name, payload).
  var emit: ((String, [String: Any?]) -> Void)?

  // MARK: Commands

  func start(rotatingId id: Data) {
    rotatingId = id
    wantAdvertising = true
    lastError = nil
    if manager == nil {
      manager = CBPeripheralManager(
        delegate: self,
        queue: nil,
        options: [CBPeripheralManagerOptionShowPowerAlertKey: true]
      )
      // Advertising begins in peripheralManagerDidUpdateState once the radio reports poweredOn.
    } else {
      reconcile()
    }
    emitState()
  }

  func update(rotatingId id: Data) {
    // The characteristic is dynamic (created with a nil value), so the next read returns the new id.
    rotatingId = id
  }

  func stop() {
    wantAdvertising = false
    if let m = manager, m.isAdvertising { m.stopAdvertising() }
    emitState()
  }

  func snapshot() -> [String: Any?] {
    var body: [String: Any?] = [
      "state": stateName(manager?.state ?? .unknown),
      "authorization": authorizationName(),
      "advertising": manager?.isAdvertising ?? false,
    ]
    if let e = lastError { body["error"] = e }
    return body
  }

  // MARK: Reconcile desired vs actual

  private func reconcile() {
    guard let m = manager, m.state == .poweredOn else { return }
    if !serviceAdded {
      let c = CBMutableCharacteristic(
        type: kCharacteristicUUID,
        properties: [.read],
        value: nil, // dynamic: answered in didReceiveRead so rotation needs no re-add
        permissions: [.readable]
      )
      characteristic = c
      let service = CBMutableService(type: kServiceUUID, primary: true)
      service.characteristics = [c]
      m.removeAllServices()
      m.add(service) // advertising starts in didAdd
      serviceAdded = true
      return
    }
    if wantAdvertising && !m.isAdvertising {
      m.startAdvertising([
        CBAdvertisementDataServiceUUIDsKey: [kServiceUUID],
        CBAdvertisementDataLocalNameKey: kLocalName,
      ])
    } else if !wantAdvertising && m.isAdvertising {
      m.stopAdvertising()
    }
  }

  // MARK: CBPeripheralManagerDelegate

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state != .poweredOn {
      // Services are dropped when the radio goes down; re-add on the way back up.
      serviceAdded = false
    }
    reconcile()
    emitState()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error = error {
      lastError = "service: \(error.localizedDescription)"
      serviceAdded = false
      emitState()
      return
    }
    reconcile()
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    lastError = error.map { "advertising: \($0.localizedDescription)" }
    emitState()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard request.characteristic.uuid == kCharacteristicUUID else {
      peripheral.respond(to: request, withResult: .attributeNotFound)
      return
    }
    guard request.offset <= rotatingId.count else {
      peripheral.respond(to: request, withResult: .invalidOffset)
      return
    }
    request.value = rotatingId.subdata(in: request.offset..<rotatingId.count)
    peripheral.respond(to: request, withResult: .success)
    emit?("onRead", [
      "central": request.central.identifier.uuidString,
      "at": Date().timeIntervalSince1970 * 1000,
    ])
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    // Nothing is writable; reject the batch.
    if let first = requests.first {
      peripheral.respond(to: first, withResult: .writeNotPermitted)
    }
  }

  // MARK: Helpers

  private func emitState() {
    emit?("onStateChange", snapshot())
  }

  private func stateName(_ s: CBManagerState) -> String {
    switch s {
    case .unknown: return "unknown"
    case .resetting: return "resetting"
    case .unsupported: return "unsupported"
    case .unauthorized: return "unauthorized"
    case .poweredOff: return "poweredOff"
    case .poweredOn: return "poweredOn"
    @unknown default: return "unknown"
    }
  }

  private func authorizationName() -> String {
    switch CBManager.authorization {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .allowedAlways: return "allowedAlways"
    @unknown default: return "notDetermined"
    }
  }
}

enum IdzBleError: Error, LocalizedError {
  case badHex(String)
  case badLength(Int)

  var errorDescription: String? {
    switch self {
    case .badHex(let s): return "rotating id is not hex: \(s)"
    case .badLength(let n): return "rotating id must be 16 bytes, got \(n)"
    }
  }
}

private func dataFromHex(_ hex: String) throws -> Data {
  var data = Data(capacity: hex.count / 2)
  var index = hex.startIndex
  while index < hex.endIndex {
    guard let next = hex.index(index, offsetBy: 2, limitedBy: hex.endIndex),
          let byte = UInt8(hex[index..<next], radix: 16) else {
      throw IdzBleError.badHex(hex)
    }
    data.append(byte)
    index = next
  }
  guard data.count == 16 else { throw IdzBleError.badLength(data.count) }
  return data
}

public class IdzBlePeripheralModule: Module {
  private let advertiser = BlePeripheralAdvertiser()

  public func definition() -> ModuleDefinition {
    Name("IdzBlePeripheral")

    Events("onStateChange", "onRead")

    OnCreate {
      self.advertiser.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    Function("isSupported") { () -> Bool in
      true
    }

    Function("getState") { () -> [String: Any?] in
      self.advertiser.snapshot()
    }

    /// Start advertising with the current 16-byte rotating id (hex). Idempotent.
    AsyncFunction("start") { (rotatingIdHex: String) in
      let id = try dataFromHex(rotatingIdHex)
      self.advertiser.start(rotatingId: id)
    }.runOnQueue(.main)

    /// Swap the rotating id at a window boundary without restarting the radio.
    AsyncFunction("update") { (rotatingIdHex: String) in
      let id = try dataFromHex(rotatingIdHex)
      self.advertiser.update(rotatingId: id)
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.advertiser.stop()
    }.runOnQueue(.main)
  }
}
