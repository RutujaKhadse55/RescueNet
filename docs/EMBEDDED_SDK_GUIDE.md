# RescueNet Embedded Survivor Mesh SDK Integration Guide (Phase 16)
## Integrating Offline SOS & Mesh Capabilities into State Disaster Applications

**Target Apps:** Aapda Mitra, State Disaster Management Authority (SDMA) Citizen Portals, Municipal Emergency Apps, Smart City Resident Applications.

---

## 1. Architecture & Dependency Installation

RescueNet's core mesh and cryptographic components are packaged as modular, headless libraries that can be embedded into any React Native or native Android application:

```bash
# Add RescueNet core dependencies
pnpm add @rescuenet/core
```

For React Native applications:
```json
{
  "dependencies": {
    "@rescuenet/core": "^0.1.0",
    "react-native-ble-manager": "^11.5.0",
    "react-native-geolocation-service": "^5.3.1"
  }
}
```

---

## 2. Quick Integration: The 4-Step Embedding Flow

### Step 1: Initialize Cryptographic Identity & Local Storage
```typescript
import { SodiumCrypto, IdentityService } from '@rescuenet/core';

// Initialize libsodium once during app boot
const crypto = await SodiumCrypto.getInstance();
const identityService = await IdentityService.create(crypto);

// Returns or generates a master Ed25519 identity key
const masterIdentity = await identityService.getMasterIdentity();
console.log(`RescueNet Master Fingerprint: ${masterIdentity.fingerprintHex}`);
```

### Step 2: Triggering an Emergency SOS Broadcast
```typescript
import { createAndSignSos, TriageStatus, NeedsBitmask } from '@rescuenet/core';

// Build and cryptographically sign an SOS packet
const activeKey = await identityService.getActiveSigningKey();
const sosPacket = await createAndSignSos(
  {
    timestamp: Math.floor(Date.now() / 1000),
    latitude: 18.5204,
    longitude: 73.8567,
    accuracyMeters: 10.0,
    status: TriageStatus.TRAPPED,
    peopleCount: 2,
    needsMask: NeedsBitmask.WATER | NeedsBitmask.MEDICAL,
    batteryPercent: 85,
    sequenceNumber: 1,
    keyPair: activeKey,
  },
  crypto
);

// sosPacket is a 180-byte binary payload ready for BLE advertising
```

### Step 3: Advertising over BLE (Zero-Configuration)
```typescript
import { BleManager } from 'react-native-ble-manager';

// Start high-duty BLE advertising with RescueNet Service UUID
BleManager.startAdvertising({
  serviceUUID: '0000FD6F-0000-1000-8000-00805F9B34FB',
  manufacturerData: Array.from(sosPacket.subarray(0, 24)),
  txPowerLevel: 'high',
});
```

### Step 4: Receiving Rescuer Acknowledgments (ACK)
```typescript
import { decodeAck, decodeHeader, PacketType } from '@rescuenet/core';

function onBlePacketDiscovered(rawBytes: Uint8Array) {
  const header = decodeHeader(rawBytes);
  if (header.packetType === PacketType.ACK) {
    const ack = decodeAck(rawBytes);
    if (ack.verified) {
      alert(`Rescue Team Confirmed! ETA: ${ack.etaMinutes} minutes.`);
    }
  }
}
```

---

## 3. Battery Preservation & Background Guarantees
* When the hosting app is backgrounded, RescueNet duty-cycles BLE scans to 2.5% (~0.6 mA).
* If battery drops to $\le 15\%$, the SDK automatically enforces `BEACON_ONLY` survival mode, ensuring the phone stays discoverable for over 60 hours.
