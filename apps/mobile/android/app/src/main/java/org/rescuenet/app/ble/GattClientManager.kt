package org.rescuenet.app.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.lang.reflect.Method
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class GattClientManager(
    private val context: Context,
    private val localOriginFpPrefix: String, // 8 hex chars (4 bytes)
    private val onFragmentReceived: (deviceAddress: String, fragmentBytes: ByteArray) -> Unit,
    private val onSyncComplete: (deviceAddress: String, success: Boolean) -> Unit
) {
    private val tag = "GattClientManager"
    private val handler = Handler(Looper.getMainLooper())

    private val activeConnections = ConcurrentHashMap<String, BluetoothGatt>()
    private val lastConnectionTime = ConcurrentHashMap<String, Long>()
    private val gatt133RetryCount = ConcurrentHashMap<String, Int>()

    var activeConnectionsCount: Int = 0
        get() = activeConnections.size
        private set

    var gatt133ErrorsTotal: Int = 0
        private set

    var negotiatedMtu: Int = 23
        private set

    var negotiatedPhy: String = "1M"
        private set

    /**
     * Determines whether this device should initiate connection based on deterministic tie-break:
     * Lower fingerprint prefix initiates to prevent simultaneous bidirectional connections.
     */
    fun shouldInitiateConnection(peerFpPrefix: String): Boolean {
        return localOriginFpPrefix.compareTo(peerFpPrefix, ignoreCase = true) < 0
    }

    /**
     * Initiates GATT connection if allowed by backoff and connection limit
     */
    fun connectToNeighbor(device: BluetoothDevice, peerFpPrefix: String) {
        val address = device.address
        val now = System.currentTimeMillis()

        // 1. Check max concurrent connections
        if (activeConnections.size >= RescueBleConstants.MAX_CONCURRENT_CONNECTIONS) {
            Log.d(tag, "Max concurrent connections reached (${RescueBleConstants.MAX_CONCURRENT_CONNECTIONS}). Skipping $address")
            return
        }

        // 2. Check 60-second backoff with jitter
        val lastTime = lastConnectionTime[address] ?: 0L
        val jitterMs = (Math.random() * 5000).toLong()
        if (now - lastTime < (RescueBleConstants.CONNECTION_BACKOFF_MS + jitterMs)) {
            Log.d(tag, "Connection to $address backed off. Remaining: ${(RescueBleConstants.CONNECTION_BACKOFF_MS + jitterMs - (now - lastTime)) / 1000}s")
            return
        }

        // 3. Tie-break check
        if (!shouldInitiateConnection(peerFpPrefix)) {
            Log.d(tag, "Tie-break: local FP ($localOriginFpPrefix) > peer FP ($peerFpPrefix). Waiting for peer to connect.")
            return
        }

        lastConnectionTime[address] = now
        performConnect(device)
    }

    private fun performConnect(device: BluetoothDevice) {
        val address = device.address
        Log.i(tag, "Connecting to GATT client: $address")

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (status == 133) {
                    gatt133ErrorsTotal++
                    Log.w(tag, "Encountered GATT Error 133 on $address. Running recovery.")
                    handleGatt133(gatt, device)
                    return
                }

                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    activeConnections[address] = gatt
                    gatt133RetryCount.remove(address)
                    Log.i(tag, "GATT connected to $address. Requesting MTU 247...")

                    // Request higher MTU
                    gatt.requestMtu(RescueBleConstants.DEFAULT_REQUESTED_MTU)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.i(tag, "GATT disconnected from $address")
                    activeConnections.remove(address)
                    gatt.close()
                    onSyncComplete(address, false)
                }
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                negotiatedMtu = mtu
                Log.d(tag, "MTU changed to $mtu, status: $status. Requesting PHY...")

                // Request 2M or Coded PHY on API 26+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    gatt.setPreferredPhy(
                        BluetoothDevice.PHY_LE_2M_MASK or BluetoothDevice.PHY_LE_CODED_MASK,
                        BluetoothDevice.PHY_LE_2M_MASK or BluetoothDevice.PHY_LE_CODED_MASK,
                        BluetoothDevice.PHY_OPTION_NO_PREFERRED
                    )
                }

                // Discover services
                gatt.discoverServices()
            }

            override fun onPhyUpdate(gatt: BluetoothGatt, txPhy: Int, rxPhy: Int, status: Int) {
                negotiatedPhy = when (txPhy) {
                    BluetoothDevice.PHY_LE_2M -> "2M"
                    BluetoothDevice.PHY_LE_CODED -> "CODED"
                    else -> "1M"
                }
                Log.d(tag, "Negotiated PHY: $negotiatedPhy for $address")
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Log.i(tag, "GATT services discovered for $address. Reading peer SUMMARY...")
                    readSummary(gatt)
                }
            }

            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == RescueBleConstants.CHAR_SUMMARY_UUID) {
                    val summaryData = characteristic.value ?: byteArrayOf()
                    Log.d(tag, "Received SUMMARY (${summaryData.size} bytes) from $address")
                    onSyncComplete(address, true)
                }
            }

            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic
            ) {
                if (characteristic.uuid == RescueBleConstants.CHAR_PACKET_TX_UUID) {
                    val fragment = characteristic.value ?: byteArrayOf()
                    onFragmentReceived(address, fragment)
                }
            }
        }

        val gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, callback)
        }
        activeConnections[address] = gatt
    }

    private fun readSummary(gatt: BluetoothGatt) {
        val service = gatt.getService(RescueBleConstants.SERVICE_UUID)
        val summaryChar = service?.getCharacteristic(RescueBleConstants.CHAR_SUMMARY_UUID)
        if (summaryChar != null) {
            gatt.readCharacteristic(summaryChar)
        }
    }

    fun sendFragment(deviceAddress: String, fragmentBytes: ByteArray): Boolean {
        val gatt = activeConnections[deviceAddress] ?: return false
        val service = gatt.getService(RescueBleConstants.SERVICE_UUID) ?: return false
        val rxChar = service.getCharacteristic(RescueBleConstants.CHAR_PACKET_RX_UUID) ?: return false

        rxChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        rxChar.value = fragmentBytes
        return gatt.writeCharacteristic(rxChar)
    }

    /**
     * Recovery for GATT Error 133:
     * 1. Close current connection.
     * 2. Clear internal device cache via reflection.
     * 3. Retry connection after delayed interval (max 2 retries).
     */
    private fun handleGatt133(gatt: BluetoothGatt, device: BluetoothDevice) {
        val address = device.address
        try {
            refreshGattCache(gatt)
            gatt.disconnect()
            gatt.close()
        } catch (e: Exception) {
            Log.e(tag, "Error closing gatt on 133: ${e.message}")
        }
        activeConnections.remove(address)

        val retries = gatt133RetryCount[address] ?: 0
        if (retries < 2) {
            gatt133RetryCount[address] = retries + 1
            handler.postDelayed({
                Log.i(tag, "Executing delayed GATT 133 retry ($retries/2) for $address")
                performConnect(device)
            }, 1500L)
        } else {
            Log.w(tag, "GATT 133 retry limit exceeded for $address. Discarding.")
            gatt133RetryCount.remove(address)
        }
    }

    private fun refreshGattCache(gatt: BluetoothGatt): Boolean {
        return try {
            val refreshMethod: Method = gatt.javaClass.getMethod("refresh")
            refreshMethod.invoke(gatt) as Boolean
        } catch (e: Exception) {
            false
        }
    }

    fun disconnectAll() {
        for ((_, gatt) in activeConnections) {
            try {
                gatt.disconnect()
                gatt.close()
            } catch (_: Exception) {}
        }
        activeConnections.clear()
    }
}
