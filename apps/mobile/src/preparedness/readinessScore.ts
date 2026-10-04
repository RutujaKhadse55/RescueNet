export interface ReadinessItem {
  id: string;
  name: string;
  description: string;
  points: number;
  achieved: boolean;
  category: 'hardware' | 'network' | 'permissions' | 'config';
}

export interface ReadinessEvaluation {
  score: number; // 0 - 100
  tier: 'Critical' | 'Moderate' | 'High' | 'Disaster Ready';
  items: ReadinessItem[];
  missingCount: number;
}

export interface ReadinessInputs {
  permissionsGrantedPercentage: number; // 0 - 100
  batteryOptimizationExempt: boolean;
  bluetoothEnabled: boolean;
  locationEnabled: boolean;
  bleAdvertisingSupported: boolean;
  codedPhySupported: boolean;
  smsAvailable: boolean; // SIM present
  identityRegistered: boolean;
  mapPackDownloaded: boolean;
  controlRoomNumbersSynced: boolean;
  emergencyContactsSet: boolean;
}

export function calculateReadinessScore(inputs: ReadinessInputs): ReadinessEvaluation {
  const permPoints = Math.round((inputs.permissionsGrantedPercentage / 100) * 20);

  const items: ReadinessItem[] = [
    {
      id: 'permissions',
      name: 'Emergency Permissions',
      description: 'Bluetooth, Location, SMS, and Foreground Service permissions',
      points: 20,
      achieved: inputs.permissionsGrantedPercentage >= 90,
      category: 'permissions',
    },
    {
      id: 'battery_exempt',
      name: 'Battery Optimization Exemption',
      description: 'System won\'t terminate background mesh relays during outages',
      points: 10,
      achieved: inputs.batteryOptimizationExempt,
      category: 'config',
    },
    {
      id: 'bluetooth_on',
      name: 'Bluetooth Radio Active',
      description: 'Bluetooth adapter turned ON and broadcasting',
      points: 10,
      achieved: inputs.bluetoothEnabled,
      category: 'hardware',
    },
    {
      id: 'location_on',
      name: 'GPS Location Active',
      description: 'High-accuracy GPS hardware active for rescue coordinates',
      points: 10,
      achieved: inputs.locationEnabled,
      category: 'hardware',
    },
    {
      id: 'ble_advertising',
      name: 'BLE Advertising Supported',
      description: 'Phone chip supports multiple & extended BLE advertisements',
      points: 10,
      achieved: inputs.bleAdvertisingSupported,
      category: 'hardware',
    },
    {
      id: 'coded_phy',
      name: 'BLE Long-Range (Coded PHY)',
      description: 'Supports extended 500m+ emergency mesh hops',
      points: 5,
      achieved: inputs.codedPhySupported,
      category: 'hardware',
    },
    {
      id: 'sms_available',
      name: 'Cellular SIM Present',
      description: 'SIM card installed for 70-char SMS emergency fallback',
      points: 5,
      achieved: inputs.smsAvailable,
      category: 'network',
    },
    {
      id: 'identity_registered',
      name: 'Identity & Keypair Pre-Registered',
      description: 'Ed25519 root identity and rotating pseudonyms created',
      points: 10,
      achieved: inputs.identityRegistered,
      category: 'config',
    },
    {
      id: 'map_pack_downloaded',
      name: 'Offline Disaster Map Pack',
      description: 'Regional MBTiles / PMTiles vector map stored on phone',
      points: 10,
      achieved: inputs.mapPackDownloaded,
      category: 'config',
    },
    {
      id: 'control_room_synced',
      name: 'Control Room Numbers Synced',
      description: 'NDRF / SDRF official disaster SMS gateway numbers cached',
      points: 5,
      achieved: inputs.controlRoomNumbersSynced,
      category: 'network',
    },
    {
      id: 'emergency_contacts',
      name: 'Emergency Contacts Configured',
      description: 'Family or local disaster response contacts configured',
      points: 5,
      achieved: inputs.emergencyContactsSet,
      category: 'config',
    },
  ];

  let rawScore = 0;
  rawScore += permPoints;
  if (inputs.batteryOptimizationExempt) rawScore += 10;
  if (inputs.bluetoothEnabled) rawScore += 10;
  if (inputs.locationEnabled) rawScore += 10;
  if (inputs.bleAdvertisingSupported) rawScore += 10;
  if (inputs.codedPhySupported) rawScore += 5;
  if (inputs.smsAvailable) rawScore += 5;
  if (inputs.identityRegistered) rawScore += 10;
  if (inputs.mapPackDownloaded) rawScore += 10;
  if (inputs.controlRoomNumbersSynced) rawScore += 5;
  if (inputs.emergencyContactsSet) rawScore += 5;

  const score = Math.min(100, Math.max(0, rawScore));

  let tier: ReadinessEvaluation['tier'] = 'Critical';
  if (score >= 90) {
    tier = 'Disaster Ready';
  } else if (score >= 70) {
    tier = 'High';
  } else if (score >= 40) {
    tier = 'Moderate';
  }

  const missingCount = items.filter((i) => !i.achieved).length;

  return {
    score,
    tier,
    items,
    missingCount,
  };
}
