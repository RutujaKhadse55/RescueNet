# @rescuenet/core

Pure TypeScript shared library for RescueNet. Zero platform dependencies (no `react-native`, no browser DOM, no Node-only modules). Cryptography is mediated via the `ICrypto` interface, allowing `libsodium-wrappers` in Node/Dashboard environments and `react-native-libsodium` on mobile devices.

## Public API & Modules

### 1. Cryptography (`crypto/`)

- `ICrypto`: Interface exposing Ed25519 signing/verification, BLAKE2b variable-length generic hashing, keyed HMAC/crypto_auth, and secure random byte generation.
- `SodiumCrypto`: Production-grade `libsodium-wrappers` implementation with asynchronous initialization and singleton accessor.

### 2. Binary Wire Codec (`codec/`)

- `encodeSos`, `decodeSos`, `createAndSignSos`, `verifySosPacket`: Little-endian binary packet codec. A standard SOS packet is 141 bytes, and under 180 bytes with all optional TLVs (Altitude, Short Note, Wi-Fi BSSID).
- `encodeAck`, `decodeAck`: Official rescuer acknowledgments with agency authentication.
- `encodeDeadman`, `decodeDeadman`: Periodic survivor keepalive countdowns.
- `encodeLocation`, `decodeLocation`: Compact live location beacons referencing origin fingerprint without transmitting redundant 32-byte public keys.
- `encodeChat`, `decodeChat`: Encrypted direct peer communication packets.
- `encodeHello`, `decodeHello`: Ad-hoc identity and capabilities discovery.
- `encodeChatReceipt`, `decodeChatReceipt`: Delivery and read receipts.
- `fragmentPacket`, `reassembleFragments`, `GattReassemblySession`: GATT fragmentation with CRC-16-CCITT integrity verification, sequence ordering, and session timeout eviction.

### 3. SMS Fallback Profile (`sms/`)

- `encodeSms`, `decodeSms`: Compact binary payload encoded into standard Base64URL string (`"RN1 <base64url>"`, ~70 characters, well under the 160-character SMS limit).
- `formatHumanSms`, `parseHumanSms`: Plain-text emergency SMS fallback format (`"RN SOS 18.5204,73.8567 +-20m P4 CRIT MED,WTR"`).

### 4. Triage Priority Scoring (`priority/`)

- `calculatePriorityScore`: Composite formula ranking clusters and individual beacons:
  $$\text{Priority} = 0.35 \times \text{Severity} + 0.25 \times \text{Count} + 0.15 \times \text{Staleness} + 0.15 \times \text{Needs} - 0.10 \times \text{Uncertainty}$$
  Provides full breakdown of components and actionable flags (`large_group`, `possibly_failing`, `low_trust`).

### 5. Spatial Clustering (`clustering/`)

- `haversineDistanceMeters`: Great-circle geographic distance calculation.
- `IncrementalClusterer`: Real-time on-device spatial clustering ($\epsilon = 40\text{m}$) with accuracy-weighted centroids and altitude floor separation (> 3m).
- `dbscanClustering`: Deterministic batch DBSCAN engine.
- `mergeClusters`, `splitCluster`: Commutative and idempotent cluster lifecycle operations.

### 6. Mesh Synchronization Logic (`mesh/`)

- `MeshStore`, `InMemoryMeshStore`: State storage for queued mesh packets.
- `SummaryVector`, `diffSummaryVectors`: Set reconciliation and airtime optimization.
- `selectToSend`: Priority-driven packet transmission queue adhering to `SOS > ACK > DEADMAN > CLUSTER_SUMMARY > LOCATION > CHAT > RECEIPT`.
- Spray-and-Wait copy counting ($L = 6$) with epidemic fast-path for critical SOS in the first 3 hops.
- `MeshRateLimiter`: Per-origin rate limiting (max 6 SOS/hour, 60 location/hour).
- `ReplayFilter`: Duplicate sequence and nonce rejection.
- `evaluateRelayPolicy`: Battery-aware policy returning `RELAY_FULL`, `RELAY_SOS_ONLY`, or `SLEEP`.

### 7. Trust Scoring Engine (`trust/`)

- `evaluateTrust`: Corroborates reports via multi-witness device counts, GPS consistency, and registration history without ever silently discarding alerts.

## Failure Modes & Edge Cases

- **Packet Truncation**: Decoding buffers smaller than `HEADER_SIZE` (21 bytes) or `SOS_MIN_PACKET_SIZE` (141 bytes) throws explicit errors.
- **Bit-Flip / Tampering**: Altering any byte in the header or body causes signature verification to fail immediately.
- **Replay Attacks**: Duplicate sequence numbers or previously recorded nonces from the same origin are detected and dropped.
- **Clock Drift**: The trust-scoring engine flags temporal anomalies if origin timestamps diverge significantly from mesh clock consensus.
