package org.rescuenet.app.ble

import java.util.UUID

object RescueBleConstants {
    // 128-bit UUIDs defined in docs/PROTOCOL.md
    val SERVICE_UUID: UUID = UUID.fromString("13370001-7331-4321-8765-426573637565")
    val CHAR_SUMMARY_UUID: UUID = UUID.fromString("13370002-7331-4321-8765-426573637565")
    val CHAR_REQUEST_UUID: UUID = UUID.fromString("13370003-7331-4321-8765-426573637565")
    val CHAR_PACKET_TX_UUID: UUID = UUID.fromString("13370004-7331-4321-8765-426573637565")
    val CHAR_PACKET_RX_UUID: UUID = UUID.fromString("13370005-7331-4321-8765-426573637565")
    val CHAR_CONTROL_UUID: UUID = UUID.fromString("13370006-7331-4321-8765-426573637565")

    // Standard Client Characteristic Configuration Descriptor
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val DEFAULT_REQUESTED_MTU = 247
    const val MAX_CONCURRENT_CONNECTIONS = 3
    const val CONNECTION_BACKOFF_MS = 60_000L
    const val PROTOCOL_VERSION: Byte = 0x01

    // Notification Channel
    const val NOTIFICATION_CHANNEL_ID = "rescuenet_mesh_channel"
    const val NOTIFICATION_ID = 1337
}
