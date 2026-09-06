package com.identizen.bleperipheral

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/*
 * PROTOCOL.md §6.3, Android twin of ios/IdzBlePeripheralModule.swift. The phone advertises the
 * service and serves the 16-byte rotating identifier from one read-only characteristic; Chromium
 * connects, reads it, and POSTs it to /discover/ble. The JS contract (function names, state and
 * authorization strings, event payloads) is identical to the Swift module so src/ble/advertiser.ts
 * needs no platform branches.
 */
private val SERVICE_UUID: UUID = UUID.fromString("F1D0E1A2-1D2E-4B0C-9C0D-1D3E2F4A5B6C")
private val CHARACTERISTIC_UUID: UUID = UUID.fromString("F1D0E1A2-1D2E-4B0C-9C0D-1D3E2F4A5B6D")

class BadRotatingIdException(message: String) : CodedException("ERR_BAD_ROTATING_ID", message, null)

class IdzBlePeripheralModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "no React context", null)

  private val manager: BluetoothManager?
    get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
  private val adapter: BluetoothAdapter?
    get() = manager?.adapter

  @Volatile private var rotatingId: ByteArray = ByteArray(0)
  @Volatile private var wantAdvertising = false
  @Volatile private var advertising = false
  @Volatile private var lastError: String? = null
  private var gattServer: BluetoothGattServer? = null
  private var serviceAdded = false
  private var advertiser: BluetoothLeAdvertiser? = null
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("IdzBlePeripheral")

    Events("onStateChange", "onRead")

    OnCreate {
      receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          val state = intent?.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR) ?: return
          if (state != BluetoothAdapter.STATE_ON) {
            // The stack drops services when the radio goes down; re-add on the way back up.
            serviceAdded = false
            advertising = false
          }
          reconcile()
          emitState()
        }
      }
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
    }

    OnDestroy {
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
      stopAdvertising()
      runCatching { gattServer?.close() }
      gattServer = null
      serviceAdded = false
    }

    Function("isSupported") {
      val a = adapter
      a != null && context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) &&
        a.isMultipleAdvertisementSupported
    }

    Function("getState") { snapshot() }

    // Start advertising with the current 16-byte rotating id (hex). Idempotent.
    AsyncFunction("start") { rotatingIdHex: String ->
      rotatingId = parseHex(rotatingIdHex)
      wantAdvertising = true
      lastError = null
      reconcile()
      emitState()
    }

    // Swap the rotating id at a window boundary; the characteristic is answered dynamically.
    AsyncFunction("update") { rotatingIdHex: String ->
      rotatingId = parseHex(rotatingIdHex)
    }

    AsyncFunction("stop") {
      wantAdvertising = false
      stopAdvertising()
      emitState()
    }
  }

  // MARK: Reconcile desired vs actual

  @Synchronized
  private fun reconcile() {
    val a = adapter ?: return
    if (a.state != BluetoothAdapter.STATE_ON) return
    if (!hasPermissions()) {
      lastError = "permission"
      return
    }
    try {
      if (gattServer == null) {
        gattServer = manager?.openGattServer(context, gattCallback)
        serviceAdded = false
      }
      val server = gattServer ?: return
      if (!serviceAdded) {
        val characteristic = BluetoothGattCharacteristic(
          CHARACTERISTIC_UUID,
          BluetoothGattCharacteristic.PROPERTY_READ,
          BluetoothGattCharacteristic.PERMISSION_READ,
        )
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(characteristic)
        server.clearServices()
        // Advertising starts in onServiceAdded so the service is live before a central connects.
        server.addService(service)
        serviceAdded = true
        return
      }
      if (wantAdvertising && !advertising) startAdvertising()
      else if (!wantAdvertising && advertising) stopAdvertising()
    } catch (e: SecurityException) {
      lastError = "permission: ${e.message}"
    }
  }

  private fun startAdvertising() {
    val a = adapter ?: return
    val adv = a.bluetoothLeAdvertiser ?: run {
      lastError = "advertising: not supported"
      return
    }
    advertiser = adv
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    // Service UUID only: the browser filters on it, and the device name is not ours to change.
    val data = AdvertiseData.Builder()
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .setIncludeDeviceName(false)
      .setIncludeTxPowerLevel(false)
      .build()
    try {
      adv.startAdvertising(settings, data, advertiseCallback)
    } catch (e: SecurityException) {
      lastError = "permission: ${e.message}"
      emitState()
    }
  }

  private fun stopAdvertising() {
    try {
      advertiser?.stopAdvertising(advertiseCallback)
    } catch (_: SecurityException) {
      // Nothing to do: without the permission we were never advertising.
    }
    advertising = false
  }

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
      advertising = true
      lastError = null
      emitState()
    }

    override fun onStartFailure(errorCode: Int) {
      advertising = false
      lastError = "advertising: " + when (errorCode) {
        ADVERTISE_FAILED_ALREADY_STARTED -> "already started"
        ADVERTISE_FAILED_DATA_TOO_LARGE -> "data too large"
        ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "unsupported"
        ADVERTISE_FAILED_INTERNAL_ERROR -> "internal error"
        ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "too many advertisers"
        else -> "error $errorCode"
      }
      emitState()
    }
  }

  private val gattCallback = object : BluetoothGattServerCallback() {
    override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        lastError = "service: status $status"
        serviceAdded = false
        emitState()
        return
      }
      reconcile()
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic,
    ) {
      val server = gattServer ?: return
      try {
        if (characteristic.uuid != CHARACTERISTIC_UUID) {
          server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
          return
        }
        val id = rotatingId
        if (offset > id.size) {
          server.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
          return
        }
        server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, id.copyOfRange(offset, id.size))
        sendEvent(
          "onRead",
          mapOf(
            // The MAC is randomised by the central and only meaningful per session, like the iOS identifier.
            "central" to device.address,
            "at" to System.currentTimeMillis().toDouble(),
          ),
        )
      } catch (e: SecurityException) {
        lastError = "permission: ${e.message}"
        emitState()
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?,
    ) {
      // Nothing is writable.
      if (responseNeeded) {
        try {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, 0, null)
        } catch (_: SecurityException) {
        }
      }
    }
  }

  // MARK: State

  private fun snapshot(): Map<String, Any?> {
    val body = mutableMapOf<String, Any?>(
      "state" to stateName(),
      "authorization" to authorizationName(),
      "advertising" to advertising,
    )
    lastError?.let { body["error"] = it }
    return body
  }

  private fun emitState() {
    sendEvent("onStateChange", snapshot())
  }

  private fun stateName(): String {
    val a = adapter ?: return "unsupported"
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) return "unsupported"
    if (!hasPermissions()) return "unauthorized"
    return when (a.state) {
      BluetoothAdapter.STATE_ON -> "poweredOn"
      BluetoothAdapter.STATE_TURNING_ON, BluetoothAdapter.STATE_TURNING_OFF -> "resetting"
      BluetoothAdapter.STATE_OFF -> "poweredOff"
      else -> "unknown"
    }
  }

  private fun authorizationName(): String = if (hasPermissions()) "allowedAlways" else "denied"

  private fun hasPermissions(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val granted = { p: String -> ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED }
    return granted(Manifest.permission.BLUETOOTH_ADVERTISE) && granted(Manifest.permission.BLUETOOTH_CONNECT)
  }

  private fun parseHex(hex: String): ByteArray {
    if (hex.length % 2 != 0 || !hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
      throw BadRotatingIdException("rotating id is not hex: $hex")
    }
    val bytes = ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
    if (bytes.size != 16) throw BadRotatingIdException("rotating id must be 16 bytes, got ${bytes.size}")
    return bytes
  }
}
