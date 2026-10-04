# RescueNet Binary Wire Protocol Specification (v1)

This document specifies the exact byte-level binary wire protocol, serialization rules (Little-Endian), cryptographic signature preimages, and golden test vectors for RescueNet.

---

## 1. General Framing & Endianness

All multi-byte numeric values (integers, floats, counters) are serialized in **Little-Endian** byte order.

---

## 2. Common Packet Header (21 Bytes)

Every over-the-air packet begins with an identical 21-byte common header. Mutable routing fields (`ttl`, `hop`) are explicitly excluded from cryptographic signature verification.

| Offset | Field       | Type  | Size | Description                                                                                            |
| ------ | ----------- | ----- | ---- | ------------------------------------------------------------------------------------------------------ |
| `0x00` | `version`   | uint8 | 1 B  | Protocol version (`0x01`).                                                                             |
| `0x01` | `type`      | uint8 | 1 B  | Packet Type opcode (see table below).                                                                  |
| `0x02` | `flags`     | uint8 | 1 B  | Bitmask: bit0 `has_ext`, bit1 `encrypted`, bit2 `from_rescuer`, bit3 `test_drill`, bit4 `sms_profile`. |
| `0x03` | `ttl`       | uint8 | 1 B  | Time-To-Live (mutable; decremented each hop, dropped when 0).                                          |
| `0x04` | `hop`       | uint8 | 1 B  | Hop count (mutable; incremented each hop, max 10).                                                     |
| `0x05` | `packet_id` | bytes | 8 B  | 64-bit random identifier or first 8 bytes of BLAKE2b hash.                                             |
| `0x0D` | `origin_fp` | bytes | 8 B  | First 8 bytes of BLAKE2b hash of the author's Ed25519 public key.                                      |

### Packet Type Opcodes

- `0x01`: `SOS` (Primary emergency beacon)
- `0x02`: `CHAT` (Peer-to-peer survivor message)
- `0x03`: `ACK` (Official rescuer acknowledgment)
- `0x04`: `DEADMAN` (Keepalive & battery safety countdown)
- `0x05`: `LOCATION` (Compact periodic live location update)
- `0x06`: `CLUSTER_SUMMARY` (Aggregated spatial cluster state)
- `0x07`: `HELLO` (Public key & supported services exchange)
- `0x08`: `CHAT_RECEIPT` (Delivery/read acknowledgment for chats)

---

## 3. SOS Packet Body (Type 0x01) — 120 Bytes

Appended directly to the 21-byte header, giving a base SOS packet size of **141 bytes** (well under the 180-byte BLE Extended Advertising budget).

| Offset      | Field         | Type   | Size | Description                                                                                                                    |
| ----------- | ------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `0x15` (21) | `timestamp`   | uint32 | 4 B  | Unix timestamp in seconds (Little-Endian).                                                                                     |
| `0x19` (25) | `latitude`    | int32  | 4 B  | $\text{Degrees} \times 10^7$ (resolution $\approx 1.1\text{ cm}$).                                                             |
| `0x1D` (29) | `longitude`   | int32  | 4 B  | $\text{Degrees} \times 10^7$ (resolution $\approx 1.1\text{ cm}$).                                                             |
| `0x21` (33) | `accuracy_m`  | uint16 | 2 B  | Horizontal accuracy radius in meters ($0 - 65,535\text{ m}$).                                                                  |
| `0x23` (35) | `status`      | uint8  | 1 B  | Triage status: `0`: Safe, `1`: Injured, `2`: Trapped, `3`: Critical.                                                           |
| `0x24` (36) | `people`      | uint8  | 1 B  | Count of stranded victims ($1 - 255$).                                                                                         |
| `0x25` (37) | `needs`       | uint8  | 1 B  | Bitmask: bit0 Medical, bit1 Water, bit2 Food, bit3 Shelter, bit4 Evacuation, bit5 Medicine, bit6 Child/Elderly, bit7 Mobility. |
| `0x26` (38) | `battery_pct` | uint8  | 1 B  | Battery level percentage ($0 - 100$).                                                                                          |
| `0x27` (39) | `seq`         | uint16 | 2 B  | Per-device sequence counter (replay prevention).                                                                               |
| `0x29` (41) | `nonce`       | uint32 | 4 B  | Cryptographic random salt for collision resistance.                                                                            |
| `0x2D` (45) | `pubkey`      | bytes  | 32 B | Author's Ed25519 Public Key.                                                                                                   |
| `0x4D` (77) | `signature`   | bytes  | 64 B | Detached Ed25519 signature over the signing preimage.                                                                          |

### Cryptographic Preimage Construction

The 64-byte Ed25519 signature is computed over:
$$\text{Preimage} = \text{version (1B)} \parallel \text{type (1B)} \parallel (\text{flags} \ \& \ \text{0x1F}) \parallel \text{packet\_id (8B)} \parallel \text{origin\_fp (8B)} \parallel \text{body}_{0x15..0x4C}\text{ (56B)} \parallel \text{extensions (if any)}$$

---

## 4. Optional Extension TLVs (Flag bit0 = 1)

When `flags & 0x01` is set, arbitrary TLVs are appended after the 64-byte signature:

| TLV Type | Name              | Size       | Value Payload                                                     |
| -------- | ----------------- | ---------- | ----------------------------------------------------------------- |
| `0x01`   | `ALTITUDE_METERS` | 2 B        | int16 altitude in meters (for vertical floor separation).         |
| `0x02`   | `SHORT_NOTE`      | $\le 24$ B | UTF-8 encoded plain text triage message.                          |
| `0x03`   | `WIFI_BSSID`      | 6 B        | 48-bit MAC address of strongest detected AP (indoor positioning). |

---

## 5. SMS Fallback Profile

### 5.1. Compact Binary Base64URL ("RN1 <base64url>")

- **Binary Payload**: 41 bytes core telemetry + 8 bytes HMAC tag = 49 bytes.
- **Base64URL Length**: 66 characters.
- **Total SMS String**: `RN1 <66_chars_base64url>` = **70 characters** (well below single-SMS 160-char ceiling).
- **Authentication**: Keyed by per-device secret exchanged during agency registration. Unregistered devices transmit 8 zero bytes in the tag and are flagged as `lowTrust = true`.

### 5.2. Human-Readable Fallback

Used for manual dispatch over voice, printed logs, or standard phone SMS:
`RN SOS 18.5204,73.8567 +-20m P4 CRIT MED,WTR`

---

## 6. Golden Test Vectors

### Golden Vector 1: Signed SOS Beacon

- **Input Parameters**:
  - `timestamp`: `1700000000` (`2023-11-14T22:13:20Z`)
  - `latitude`: `18.5204303` (Pune, Maharashtra, India) $\to \text{int32: } 185204303 = \text{0x0B09FE4F}$
  - `longitude`: `73.8567437` $\to \text{int32: } 738567437 = \text{0x2C05A50D}$
  - `accuracy_m`: `12`
  - `status`: `2` (`TRAPPED`)
  - `people`: `4`
  - `needs`: `0x03` (`MEDICAL | WATER`)
  - `battery_pct`: `78`%
  - `sequenceNumber`: `1`
  - `nonce`: `0x12345678`
  - `ttl`: `10`, `hop`: `0`
- **Output Size**: 141 bytes (0 extensions).
- **Packet Hex**:

```hex
0101000a0021d94636a27987d9666ed91c1366781700f153654ffe090b0da5052c0c000204034e010078563412446a290c1d8796eaa30bdd59842645df7ddf4167086601c6e62af477f3f3a4de9d05cd91064566559837a6e5df9ece243bf0a29ffd9ad362874b29a64b02752aec994d09ce3ecc2d02a1448a82c742923e7d87ec86f742753193b03139e36e01
```

### Golden Vector 2: Compact SMS Fallback (Unregistered)

- **Input Parameters**:
  - `origin_fp`: `0101010101010101`
  - `timestamp`: `1700000000`
  - `latitude`: `18.5204`
  - `longitude`: `73.8567`
  - `accuracy`: `20`m
  - `status`: `CRITICAL` (3)
  - `people`: `4`
  - `needs`: `0x03` (`MEDICAL | WATER`)
  - `battery`: `85`%
  - `seq`: `1`, `nonce`: `123456`, `altitude`: `10`m
  - `hmac`: 8 zero bytes
- **Output String**:

```text
RN1 AQEBAQEBAQEBAPFTZSD9CQtYowUsFAADBANVAQBA4gEACgAAAAAAAAAAAAAAAAAAAA
```

- **String Length**: 69 characters.

---

## 7. Bluetooth Low Energy (BLE) GATT Architecture & UUIDs

RescueNet uses a custom BLE GATT profile for point-to-point store-and-forward mesh synchronization. 

### 7.1. 128-Bit Characteristic UUIDs

| UUID | Name | Properties | Description |
| ---- | ---- | ---------- | ----------- |
| `13370001-7331-4321-8765-426573637565` | **RescueNet Mesh Service** | Primary Service | Primary mesh synchronization service. Advertised in BLE beacons. |
| `13370002-7331-4321-8765-426573637565` | **SUMMARY** | `READ`, `NOTIFY` | Compact summary vector of packets held by this node (Bloom filter or packet_id prefix array). |
| `13370003-7331-4321-8765-426573637565` | **REQUEST** | `WRITE` | List of requested `packet_id`s that the central node needs from the peripheral. |
| `13370004-7331-4321-8765-426573637565` | **PACKET_TX** | `NOTIFY`, `INDICATE` | Binary fragments pushed to the connected peer using fragmentation codec. |
| `13370005-7331-4321-8765-426573637565` | **PACKET_RX** | `WRITE_NO_RESP` | Binary fragments received from the connected peer. |
| `13370006-7331-4321-8765-426573637565` | **CONTROL** | `READ`, `WRITE` | Telemetry & flow control: protocol version, role, battery, negotiated MTU, capabilities, backpressure. |

### 7.2. GATT Control Characteristic Format (12 Bytes)
- `version` (1B): Protocol version (`0x01`).
- `role` (1B): `0x00` Survivor, `0x01` Rescuer, `0x02` Gateway.
- `battery_pct` (1B): $0 - 100$.
- `flags` (1B): bit0 `has_sos`, bit1 `low_battery`, bit2 `beacon_only`, bit3 `backpressure`.
- `mtu` (2B): Negotiated MTU (Little-Endian uint16, default 247).
- `phy` (1B): `0x01` 1M, `0x02` 2M, `0x03` Coded PHY (S=8 / S=2).
- `time_offset_s` (4B): int32 offset relative to UTC seconds.
- `reserved` (1B): Padding.

### 7.3. Service Data in Legacy Advertisement (7 Bytes)
When advertising in legacy BLE (31-byte limit), the Service Data payload for `13370001-...` is formatted as:
`[version: 1B] [role: 1B] [flags: 1B] [origin_fp_prefix: 4B]`
- Total advertising packet: Flags (3B) + 128-bit UUID (18B) + Service Data (9B) = **30 Bytes** (fits in 31-byte legacy PDU).
- On devices supporting BLE 5.0 Extended Advertising, auxiliary advertisement packets are used up to 254 bytes.

