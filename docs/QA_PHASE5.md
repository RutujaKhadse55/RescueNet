# RescueNet QA & Field Test Checklist: Phase 5 (Native BLE & Mesh Service)

## Test Environment Requirements
- **Physical Test Devices**: At least two Android devices:
  - Primary Central: e.g., Google Pixel (Android 14, API 34)
  - Primary Peripheral: e.g., Samsung Galaxy (One UI / Android 13, API 33)
  - Secondary: Xiaomi / OnePlus (OEM battery aggressive killers, Android 12, API 31/32)
- **RF Tools**: nRF Connect for Mobile, Wireshark with BLE Sniffer (Nordic nRF52840 dongle).
- **Physical Distance**: 10 meters line-of-sight and non-line-of-sight (through walls).

---

## 1. GATT Service Verification
Connect via **nRF Connect** and verify GATT table exposed by `RescueBleModule`:
- [ ] Service `00001337-0000-1000-8000-00805f9b34fb` (RescueNet Mesh) is present.
- [ ] Characteristic `00001337-0001-...` (SUMMARY) readable and supports `NOTIFY`.
- [ ] Characteristic `00001337-0002-...` (REQUEST) supports `WRITE`.
- [ ] Characteristic `00001337-0003-...` (PACKET_TX) supports `NOTIFY` and `INDICATE`.
- [ ] Characteristic `00001337-0004-...` (PACKET_RX) supports `WRITE_NO_RESPONSE`.
- [ ] Characteristic `00001337-0005-...` (CONTROL) supports `READ` and `WRITE`.
- [ ] CONTROL characteristic returns 12-byte payload: version (`1`), role, battery %, negotiated MTU, capabilities bitmask.

---

## 2. Discovery & Advertising Verification
- [ ] **Legacy Advertisements**: Packet carries Service UUID `13370001` and 7-byte Service Data payload:
  - Byte 0: Protocol version (`0x01`)
  - Byte 1: Role (`0x01` Survivor, `0x02` Rescuer, `0x03` Gateway)
  - Byte 2: Flags (Bit 0 `has_sos`, Bit 1 `low_battery`, Bit 2 `beacon_only`)
  - Bytes 3-6: 4-byte rotating `origin_fp` prefix
- [ ] **Extended Advertising**: Devices with BLE 5.0+ enable extended advertising with secondary channel offloading.
- [ ] **Discovery Time**: Screen off on both devices; discovery occurs within $\le 30$ seconds at 10 meters.
- [ ] **Address Rotation**: Bluetooth MAC and fingerprint prefix rotate every 24 hours or on role switch.

---

## 3. High-Throughput Fragmentation & Reassembly (1 KB Blob)
- [ ] Central connects to Peripheral and negotiates MTU 247.
- [ ] Central requests 2M PHY (falls back gracefully to 1M or Coded PHY on long range).
- [ ] A 1,024-byte payload is fragmented into chunks of size $(\text{MTU} - 3)$ with 6-byte header:
  - `transferId` (uint16)
  - `seq` (uint8)
  - `total` (uint8)
  - `crc16` (uint16 CCITT)
- [ ] All fragments transmitted via `PACKET_RX` without response.
- [ ] Receiving phone reassembles payload and verifies CRC16 match.
- [ ] Bidirectional test: Peripheral transmits 1 KB payload to Central via `PACKET_TX` notify; passes CRC16.

---

## 4. Connection Manager & Error Handling (100 Cycles Stress Test)
- [ ] **Concurrency Cap**: Phone connects to at most 3 peers concurrently. 4th peer queued.
- [ ] **Deterministic Tie-Break**: Phone with lower lexicographical fingerprint initiates connection; higher fingerprint waits. No double connection storms.
- [ ] **Per-Neighbor Jittered Back-Off**: Phone does not reconnect to the same peer within 60 seconds unless a new SOS packet arrives.
- [ ] **GATT 133 Recovery**:
  - Simulate forced disconnect by walking out of range.
  - Native layer catches status 133, executes `gatt.refresh()`, closes GATT client, and initiates jittered retry after 1,500 ms.
  - Successfully recovers without native process crash across 100 consecutive cycles.

---

## 5. Foreground Service & OEM Survival Checklist
- [ ] Notification displayed: `"RescueNet is active: X nearby, Y packets queued"` with actions:
  - `Open App`
  - `SOS`
  - `Pause`
- [ ] **Swipe-Away Survival**:
  - Open RescueNet.
  - Swipe away from Android Recent Apps on **Pixel** (Android 14) and **Samsung** (One UI 6).
  - Service remains running in notification drawer (`START_STICKY` + `onTaskRemoved`).
  - BLE scanning and advertising continue uninterrupted with screen turned off for 30 minutes.
- [ ] **Boot Auto-Restart**:
  - Enable `"Run on device boot"` permission.
  - Restart device.
  - `RescueBootReceiver` starts `RescueMeshService` automatically on `BOOT_COMPLETED`.

---

## 6. ConnectivityGovernor & Bluetooth Recovery Flow
- [ ] **Debounced Transitions**:
  - Put phone in Airplane mode: transitions from `ONLINE` to `OFFLINE` after 20-second debounce.
  - Mesh transitions from `IDLE` to `ARMED` and begins BLE advertising/scanning.
- [ ] **Android 12 Bluetooth Enable**:
  - Phone turns off Bluetooth while offline.
  - System silently enables Bluetooth via `BluetoothAdapter.enable()`.
- [ ] **Android 13+ / 14 Bluetooth Recovery**:
  - Phone turns off Bluetooth while offline.
  - App displays full-screen intent / heads-up notification with `"Turn on Bluetooth"` action button.
  - Quick Settings tile `"RescueNet Mesh"` indicates degraded state.
  - User taps action; `ACTION_REQUEST_ENABLE` dialog appears.
  - When user grants, `ACTION_STATE_CHANGED` instantly resumes scanning and advertising.
