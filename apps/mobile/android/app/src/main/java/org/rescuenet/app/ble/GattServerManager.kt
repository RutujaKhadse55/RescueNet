package org.rescuenet.app.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.util.Log

@SuppressLint("MissingPermission")
class GattServerManager(
    private val context: Context,
    private val onFragmentReceived: (deviceAddress: String, fragmentBytes: ByteArray) -> Unit,
    private val onRequestReceived: (deviceAddress: String, requestedIds: ByteArray) -> Unit
) {
    private val tag = "GattServerManager"
    private var bluetoothManager: BluetoothManager? =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private var gattServer: BluetoothGattServer? = null

    private var summaryCharacteristic: BluetoothGattCharacteristic? = null
    private var controlCharacteristic: BluetoothGattCharacteristic? = null

    private var localSummaryBytes: ByteArray = byteArrayOf()
    private var localControlBytes: ByteArray = byteArrayOf(RescueBleConstants.PROTOCOL_VERSION, 0x00, 100, 0x00)

    fun startServer(): Boolean {
        if (gattServer != null) return true

        val serverCallback = object : BluetoothGattServerCallback() {
            override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                Log.d(tag, "GATT Server ConnectionState: ${device.address} status: $status new: $newState")
            }

            override fun onCharacteristicReadRequest(
                device: BluetoothDevice,
                requestId: Int,
                offset: Int,
                characteristic: BluetoothGattCharacteristic
            ) {
                when (characteristic.uuid) {
                    RescueBleConstants.CHAR_SUMMARY_UUID -> {
                        val slice = if (offset < localSummaryBytes.size) {
                            localSummaryBytes.copyOfRange(offset, localSummaryBytes.size)
                        } else byteArrayOf()
                        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice)
                    }
                    RescueBleConstants.CHAR_CONTROL_UUID -> {
                        val slice = if (offset < localControlBytes.size) {
                            localControlBytes.copyOfRange(offset, localControlBytes.size)
                        } else byteArrayOf()
                        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice)
                    }
                    else -> {
                        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
                    }
                }
            }

            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?
            ) {
                val bytes = value ?: byteArrayOf()
                when (characteristic.uuid) {
                    RescueBleConstants.CHAR_PACKET_RX_UUID -> {
                        onFragmentReceived(device.address, bytes)
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                        }
                    }
                    RescueBleConstants.CHAR_REQUEST_UUID -> {
                        onRequestReceived(device.address, bytes)
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                        }
                    }
                    RescueBleConstants.CHAR_CONTROL_UUID -> {
                        localControlBytes = bytes
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                        }
                    }
                    else -> {
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
                        }
                    }
                }
            }

            override fun onDescriptorWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                descriptor: BluetoothGattDescriptor,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?
            ) {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }

            override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
                Log.d(tag, "GATT Server MTU negotiated to $mtu for ${device.address}")
            }
        }

        val server = bluetoothManager?.openGattServer(context, serverCallback) ?: return false
        val service = BluetoothGattService(
            RescueBleConstants.SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        // 1. SUMMARY (Read, Notify)
        summaryCharacteristic = BluetoothGattCharacteristic(
            RescueBleConstants.CHAR_SUMMARY_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        ).also {
            it.addDescriptor(BluetoothGattDescriptor(RescueBleConstants.CCCD_UUID, BluetoothGattDescriptor.PERMISSION_WRITE))
            service.addCharacteristic(it)
        }

        // 2. REQUEST (Write)
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                RescueBleConstants.CHAR_REQUEST_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )
        )

        // 3. PACKET_TX (Notify, Indicate)
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                RescueBleConstants.CHAR_PACKET_TX_UUID,
                BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE,
                BluetoothGattCharacteristic.PERMISSION_READ
            ).also {
                it.addDescriptor(BluetoothGattDescriptor(RescueBleConstants.CCCD_UUID, BluetoothGattDescriptor.PERMISSION_WRITE))
            }
        )

        // 4. PACKET_RX (Write Without Response)
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                RescueBleConstants.CHAR_PACKET_RX_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )
        )

        // 5. CONTROL (Read, Write)
        controlCharacteristic = BluetoothGattCharacteristic(
            RescueBleConstants.CHAR_CONTROL_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        ).also {
            service.addCharacteristic(it)
        }

        server.addService(service)
        gattServer = server
        Log.i(tag, "RescueNet GATT Server started successfully")
        return true
    }

    fun updateSummary(summaryBytes: ByteArray) {
        this.localSummaryBytes = summaryBytes
    }

    fun stopServer() {
        gattServer?.close()
        gattServer = null
    }
}
