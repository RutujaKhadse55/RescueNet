package org.rescuenet.app.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

@SuppressLint("MissingPermission")
class RescueBleModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val tag = "RescueBleModule"
    private val handler = Handler(Looper.getMainLooper())

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bleAdvertiser: BluetoothLeAdvertiser? = null
    private var bleScanner: BluetoothLeScanner? = null

    private var gattServerManager: GattServerManager? = null
    private var gattClientManager: GattClientManager? = null

    private var isAdvertising = false
    private var isScanning = false
    private var currentOriginFpPrefix = "00000000"

    private var scanCallback: ScanCallback? = null
    private var advertiseCallback: AdvertiseCallback? = null

    // Duty cycling handler: 5s on, 25s off
    private var dutyCycleRunnable: Runnable? = null

    override fun getName(): String = "RescueBle"

    init {
        val bm = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bm?.adapter

        gattServerManager = GattServerManager(
            reactContext,
            onFragmentReceived = { address, bytes ->
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                sendEvent("packetFragmentReceived", Arguments.createMap().apply {
                    putString("deviceId", address)
                    putString("fragment", base64)
                })
            },
            onRequestReceived = { address, reqBytes ->
                Log.d(tag, "Client $address requested packet ids: ${reqBytes.size} bytes")
            }
        )

        gattClientManager = GattClientManager(
            reactContext,
            currentOriginFpPrefix,
            onFragmentReceived = { address, bytes ->
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                sendEvent("packetFragmentReceived", Arguments.createMap().apply {
                    putString("deviceId", address)
                    putString("fragment", base64)
                })
            },
            onSyncComplete = { address, success ->
                sendEvent("syncCompleted", Arguments.createMap().apply {
                    putString("deviceId", address)
                    putBoolean("success", success)
                })
            }
        )
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun startAdvertising(
        mode: String,
        role: String,
        flagsMap: ReadableMap,
        originFpPrefix: String,
        promise: Promise
    ) {
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter!!.isEnabled) {
                promise.reject("BT_DISABLED", "Bluetooth adapter is disabled")
                return
            }

            this.currentOriginFpPrefix = originFpPrefix
            bleAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
            if (bleAdvertiser == null) {
                promise.reject("NO_ADVERTISER", "Device does not support BLE Peripheral advertising")
                return
            }

            // Start GATT Server
            gattServerManager?.startServer()

            // Prepare Service Data (7 bytes: version 1B, role 1B, flags 1B, fp prefix 4B)
            val versionByte: Byte = RescueBleConstants.PROTOCOL_VERSION
            val roleByte: Byte = when (role) {
                "rescuer" -> 0x01
                "gateway" -> 0x02
                else -> 0x00 // survivor
            }

            var flagByte: Byte = 0
            if (flagsMap.getBoolean("hasSos")) flagByte = (flagByte.toInt() or 0x01).toByte()
            if (flagsMap.getBoolean("lowBattery")) flagByte = (flagByte.toInt() or 0x02).toByte()
            if (flagsMap.getBoolean("beaconOnly")) flagByte = (flagByte.toInt() or 0x04).toByte()

            val fpBytes = hexStringToByteArray(originFpPrefix).copyOf(4)

            val serviceDataBytes = byteArrayOf(versionByte, roleByte, flagByte) + fpBytes

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(
                    when (mode) {
                        "LOW_LATENCY" -> AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
                        "BALANCED" -> AdvertiseSettings.ADVERTISE_MODE_BALANCED
                        else -> AdvertiseSettings.ADVERTISE_MODE_LOW_POWER
                    }
                )
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(true)
                .build()

            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(ParcelUuid(RescueBleConstants.SERVICE_UUID))
                .addServiceData(ParcelUuid(RescueBleConstants.SERVICE_UUID), serviceDataBytes)
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    isAdvertising = true
                    Log.i(tag, "BLE Advertising started successfully (role: $role, flags: $flagByte)")
                    promise.resolve(true)
                }

                override fun onStartFailure(errorCode: Int) {
                    isAdvertising = false
                    Log.e(tag, "BLE Advertising failed with error: $errorCode")
                    promise.reject("ADV_FAIL", "Advertising failed: error $errorCode")
                }
            }

            bleAdvertiser?.startAdvertising(settings, data, advertiseCallback)
        } catch (e: Exception) {
            promise.reject("ADV_EXCEPTION", e.message)
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            if (advertiseCallback != null) {
                bleAdvertiser?.stopAdvertising(advertiseCallback)
                advertiseCallback = null
            }
            gattServerManager?.stopServer()
            isAdvertising = false
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_ADV_FAIL", e.message)
        }
    }

    @ReactMethod
    fun startScanning(mode: String, promise: Promise) {
        try {
            bleScanner = bluetoothAdapter?.bluetoothLeScanner
            if (bleScanner == null) {
                promise.reject("NO_SCANNER", "Bluetooth scanner not available")
                return
            }

            val scanFilter = ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(RescueBleConstants.SERVICE_UUID))
                .build()

            val scanMode = when (mode) {
                "LOW_LATENCY" -> ScanSettings.SCAN_MODE_LOW_LATENCY
                "BALANCED" -> ScanSettings.SCAN_MODE_BALANCED
                else -> ScanSettings.SCAN_MODE_LOW_POWER
            }

            val scanSettings = ScanSettings.Builder()
                .setScanMode(scanMode)
                .build()

            scanCallback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult?) {
                    result ?: return
                    handleScanResult(result)
                }

                override fun onBatchScanResults(results: MutableList<ScanResult>?) {
                    results?.forEach { handleScanResult(it) }
                }

                override fun onScanFailed(errorCode: Int) {
                    Log.e(tag, "BLE Scan failed: $errorCode")
                }
            }

            bleScanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)
            isScanning = true
            startDutyCycling()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCAN_FAIL", e.message)
        }
    }

    private fun handleScanResult(result: ScanResult) {
        val record = result.scanRecord ?: return
        val serviceData = record.getServiceData(ParcelUuid(RescueBleConstants.SERVICE_UUID)) ?: return

        if (serviceData.size >= 7) {
            val version = serviceData[0].toInt() and 0xFF
            val roleCode = serviceData[1].toInt() and 0xFF
            val flags = serviceData[2].toInt() and 0xFF
            val fpPrefixBytes = serviceData.copyOfRange(3, 7)
            val fpPrefixHex = bytesToHex(fpPrefixBytes)

            val roleStr = when (roleCode) {
                1 -> "rescuer"
                2 -> "gateway"
                else -> "survivor"
            }

            val map = Arguments.createMap().apply {
                putString("deviceId", result.device.address)
                putString("name", result.device.name ?: "Node")
                putInt("rssi", result.rssi)
                putString("originFpPrefix", fpPrefixHex)
                putInt("protocolVersion", version)
                putString("role", roleStr)
                putMap("flags", Arguments.createMap().apply {
                    putBoolean("hasSos", (flags and 0x01) != 0)
                    putBoolean("lowBattery", (flags and 0x02) != 0)
                    putBoolean("beaconOnly", (flags and 0x04) != 0)
                })
                putDouble("lastSeen", System.currentTimeMillis().toDouble())
            }

            sendEvent("neighborDiscovered", map)

            // Auto-initiate GATT connection if tie-break passes
            gattClientManager?.connectToNeighbor(result.device, fpPrefixHex)
        }
    }

    private fun startDutyCycling() {
        dutyCycleRunnable = object : Runnable {
            override fun run() {
                // Adaptive 5s on / 25s off duty cycling
                if (isScanning && scanCallback != null) {
                    // Temporarily pause
                    bleScanner?.stopScan(scanCallback)
                    handler.postDelayed({
                        if (isScanning && scanCallback != null) {
                            val scanFilter = ScanFilter.Builder()
                                .setServiceUuid(ParcelUuid(RescueBleConstants.SERVICE_UUID))
                                .build()
                            val scanSettings = ScanSettings.Builder()
                                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                                .build()
                            bleScanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)
                        }
                    }, 5000L) // 5s scan window
                }
                handler.postDelayed(this, 30_000L) // repeat every 30s
            }
        }
        handler.postDelayed(dutyCycleRunnable!!, 30_000L)
    }

    @ReactMethod
    fun stopScanning(promise: Promise) {
        try {
            if (scanCallback != null) {
                bleScanner?.stopScan(scanCallback)
                scanCallback = null
            }
            dutyCycleRunnable?.let { handler.removeCallbacks(it) }
            isScanning = false
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_SCAN_FAIL", e.message)
        }
    }

    @ReactMethod
    fun sendFragment(deviceId: String, fragmentBytesBase64: String, promise: Promise) {
        val bytes = Base64.decode(fragmentBytesBase64, Base64.DEFAULT)
        val success = gattClientManager?.sendFragment(deviceId, bytes) ?: false
        promise.resolve(success)
    }

    @ReactMethod
    fun enableBluetooth(promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.reject("NO_BT", "Bluetooth not supported")
            return
        }

        if (bluetoothAdapter!!.isEnabled) {
            promise.resolve(true)
            return
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S) {
            // Android 12 and lower: can call enable() directly
            val enabled = bluetoothAdapter!!.enable()
            promise.resolve(enabled)
        } else {
            // Android 13+ (API 33+): OS requires ACTION_REQUEST_ENABLE prompt
            val enableIntent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(enableIntent)
            promise.resolve(false) // Requires user interaction in system dialog
        }
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        promise.resolve(bluetoothAdapter?.isEnabled ?: false)
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        val lm = reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val gpsEnabled = lm?.isProviderEnabled(LocationManager.GPS_PROVIDER) ?: false
        val networkEnabled = lm?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ?: false
        promise.resolve(gpsEnabled || networkEnabled)
    }

    @ReactMethod
    fun getExchangeStats(promise: Promise) {
        val map = Arguments.createMap().apply {
            putInt("bytesSent", 0)
            putInt("bytesReceived", 0)
            putInt("mtu", gattClientManager?.negotiatedMtu ?: 23)
            putString("phy", gattClientManager?.negotiatedPhy ?: "1M")
            putInt("gatt133Errors", gattClientManager?.gatt133ErrorsTotal ?: 0)
            putInt("connectAttempts", 0)
            putInt("successfulExchanges", 0)
            putInt("activeConnections", gattClientManager?.activeConnectionsCount ?: 0)
        }
        promise.resolve(map)
    }

    private fun hexStringToByteArray(s: String): ByteArray {
        val len = s.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(s[i], 16) shl 4) + Character.digit(s[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val hexChars = "0123456789abcdef"
        val result = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val i = b.toInt() and 0xFF
            result.append(hexChars[i shr 4])
            result.append(hexChars[i and 0x0F])
        }
        return result.toString()
    }
}
