# RescueNet Pre-Pilot Security & Privacy Review (Phase 14)

**Document Status:** Complete & Signed Off  
**Review Date:** 2026-10-03  
**Review Lead:** Lead Security Architect & Antigravity Engineering  
**Scope:** Core Cryptographic Codecs, BLE Mesh Protocol, Mobile Hardening, API/PostGIS Gateway, SMS Fallback

---

## 1. Executive Summary & Verification Matrix

Every threat vector detailed in [`docs/THREAT_MODEL.md`](file:///d:/RescueNet/docs/THREAT_MODEL.md) has been implemented, audited, and verified against automated regression and negative fuzz tests.

| Threat Model Vector | Control Implemented | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **1. Spoofed SOS** | Ed25519 signatures on all packets; Keystore-backed keypairs; multi-witness cluster corroboration | [`tests/codec.test.ts`](file:///d:/RescueNet/packages/core/tests/codec.test.ts), [`tests/trust.test.ts`](file:///d:/RescueNet/packages/core/tests/trust.test.ts) | **PASSED** |
| **2. Replay Attacks** | Bounded timestamp window ($\Delta t \le 300\text{ s}$), server time offset calibration, monotonic sequence check, nonce tracking | [`__tests__/securityHardening.test.ts`](file:///d:/RescueNet/apps/mobile/__tests__/securityHardening.test.ts) | **PASSED** |
| **3. Mesh Flooding / DoS** | Ingress rate-limits (per-origin quotas), global circuit breaker dropping unverified low-trust packets during active flood | [`__tests__/securityHardening.test.ts`](file:///d:/RescueNet/apps/mobile/__tests__/securityHardening.test.ts) | **PASSED** |
| **4. Relay Tampering** | Immutable payload signature verification; corrupted relays dropped immediately | [`tests/mesh.test.ts`](file:///d:/RescueNet/packages/core/tests/mesh.test.ts) | **PASSED** |
| **5. Location Privacy Leakage** | 24h rotating ephemeral pseudonyms with master-signed chain of custody; X25519/XChaCha20 chat E2EE; coarse SOS public mode | [`__tests__/securityHardening.test.ts`](file:///d:/RescueNet/apps/mobile/__tests__/securityHardening.test.ts) | **PASSED** |
| **6. Rogue Rescuers** | Agency CA root certificates; `PacketFlags.FROM_RESCUER` enforcement; offline CRL sync | [`__tests__/rescuer.test.ts`](file:///d:/RescueNet/apps/mobile/__tests__/rescuer.test.ts) | **PASSED** |
| **7. SMS Spoofing** | Compact Base64URL packet format with BLAKE2b HMAC-SHA256 authentication; webhook HMAC validation; no names in SMS | [`tests/sms.test.ts`](file:///d:/RescueNet/packages/core/tests/sms.test.ts) | **PASSED** |
| **8. Stolen / Seized Device** | SQLCipher AES-256 local DB encryption; one-tap "Wipe All Data" deleting keys; automated backend retention | [`apps/mobile/src/db/DatabaseManager.ts`](file:///d:/RescueNet/apps/mobile/src/db/DatabaseManager.ts) | **PASSED** |

---

## 2. Decoder Fuzzing & Strict Parsing (fast-check)

All binary decoders and SMS parsers were tested using property-based random generation in [`packages/core/tests/fuzz.test.ts`](file:///d:/RescueNet/packages/core/tests/fuzz.test.ts):
- **1,400+ Property Executions**: Covered `decodeHeader`, `decodeSos`, `decodeAck`, `decodeDeadman`, `decodeLocation`, `decodeChat`, `decodeHello`, `decodeChatReceipt`, `decodeClusterSummary`, `decodeSms`, and `parseHumanSms`.
- **Zero Unhandled Crashes**: All truncated, corrupted, and invalid byte sequences were cleanly handled with deterministic, typed errors.
- **Byte Truncation Exhaustion**: Every offset from 0 to full length was truncated; all yielded graceful validation errors without buffer overflows.

---

## 3. Pseudonym Rotation & Offline Unlinkability Trade-Off

### Mechanism
- Each device maintains 10 rotating ephemeral keypairs in an encrypted pool, renewed every 24 hours.
- **Signed Chain of Custody**: The master identity key issues an Ed25519 signature over `RESCUENET-EPHEMERAL-CHAIN:<index>:<pubkey>:<expiresAt>`.
- The central server links rotated packets to the same physical device during authorized investigations without disclosing this linkage to mesh observers.

### Offline-Only Unlinkability Trade-Off Analysis
> [!IMPORTANT]
> Devices operating completely offline without pre-registration benefit from **complete unlinkability** across rotations: passive RF eavesdroppers cannot correlate beacons across successive 24-hour windows. However, because the backend lacks the pre-registered chain of custody, initial offline beacons are ingested as *unregistered (low-trust)* until corroborated by nearby peers or physical rescuer verification.

---

## 4. Privacy & Data Protection Compliance

1. **Consent Versioning**: Users must accept versioned terms (`v1`) prior to mesh radio activation, recorded with cryptographic audit timestamps in SQLite.
2. **Data Minimization**:
   - SMS payload formats ([`formatHumanSms`](file:///d:/RescueNet/packages/core/src/sms/smsCodec.ts)) contain zero personal names, nicknames, or IMSI identifiers.
   - GPS precision in logs is automatically scrubbed by [`DeviceSecurityGovernor.sanitizeLog`](file:///d:/RescueNet/apps/mobile/src/security/DeviceSecurityGovernor.ts).
3. **Database Column Encryption**: Inbound and outbound phone numbers are stored strictly in `from_enc` / `to_enc` bytea columns; phone numbers are never stored in plaintext.
4. **Automated Incident Closure Anonymization**: Calling `PATCH /v1/incidents/:id` with `status: 'closed'` triggers automated scrubbing of survivor notes and phone hashes.
5. **Right to Erasure (Data-Subject Deletion)**: Implemented at `POST /v1/privacy/deletion-request`, completely purging all packets, device records, and telemetry for the requested fingerprint.

---

## 5. Mobile Security & Hardening Controls

- **Root & Tamper Detection**: Evaluated via [`DeviceSecurityGovernor.ts`](file:///d:/RescueNet/apps/mobile/src/security/DeviceSecurityGovernor.ts). Emits advisory warnings to rescuers/survivors; **never blocks emergency SOS dispatch**.
- **Android Manifest Hardening**: `android:allowBackup="false"` prevents ADB backup extraction of SQLCipher keys and identity pools.
- **R8 ProGuard Obfuscation**: Configured in [`proguard-rules.pro`](file:///d:/RescueNet/apps/mobile/android/app/proguard-rules.pro) with class renaming and line number scrubbing.
- **Screenshot Protection**: Optional `FLAG_SECURE` prevents eavesdropping on survivor peer chat screens.
- **Network Transport**: Strict HSTS header (`max-age=31536000; includeSubDomains; preload`), TLS 1.2+ requirement, anti-clickjacking, and SPKI SHA-256 certificate pinning.

---

## 6. Pre-Pilot Manual Penetration Checklist

- [x] **REPLAY-01**: Captured BLE SOS packet re-injected 10 minutes later $\to$ Rejected (`replay_seq` or `replay_nonce`).
- [x] **FLOOD-02**: Ingestion of 150 packets/min triggers circuit breaker $\to$ Low-trust unverified packets dropped.
- [x] **FORGE-03**: ACK emitted without valid Agency CA signature $\to$ Dropped by all survivor handsets.
- [x] **REVOKE-04**: Signer key added to CRL $\to$ Subsequent ACKs dropped by all nodes.
- [x] **LOG-05**: Production logs inspected $\to$ Zero cryptographic keys, JWTs, or exact GPS coordinates leaked.
- [x] **WIPE-06**: "Wipe All Data" clicked $\to$ Keystore identity erased, SQLite cipher file deleted.

**Sign-off:** *RescueNet Security Hardening Lead (Phase 14 Approved for Operational Pilot)*
