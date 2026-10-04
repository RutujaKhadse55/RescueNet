export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'not_requested';

export type PermissionCategory = 'bluetooth' | 'location' | 'alerts' | 'sms' | 'battery';

export interface AndroidPermissionDef {
  key: string;
  name: string;
  category: PermissionCategory;
  rationale: string;
  androidString: string;
  critical: boolean;
}

export const ANDROID_PERMISSIONS: AndroidPermissionDef[] = [
  // 1. Bluetooth Mesh
  {
    key: 'BLUETOOTH_SCAN',
    name: 'Bluetooth Mesh Scanner',
    category: 'bluetooth',
    rationale: 'Scans for nearby survivor packets and rescuer relays without internet.',
    androidString: 'android.permission.BLUETOOTH_SCAN',
    critical: true,
  },
  {
    key: 'BLUETOOTH_ADVERTISE',
    name: 'Bluetooth Beacon Broadcast',
    category: 'bluetooth',
    rationale: 'Broadcasts your signed SOS beacon and cluster telemetry to surrounding phones.',
    androidString: 'android.permission.BLUETOOTH_ADVERTISE',
    critical: true,
  },
  {
    key: 'BLUETOOTH_CONNECT',
    name: 'Bluetooth Mesh Relaying',
    category: 'bluetooth',
    rationale: 'Connects briefly to neighboring nodes to transfer multi-hop flood packets.',
    androidString: 'android.permission.BLUETOOTH_CONNECT',
    critical: true,
  },

  // 2. Location
  {
    key: 'ACCESS_FINE_LOCATION',
    name: 'High-Precision GPS',
    category: 'location',
    rationale:
      'Embeds latitude/longitude in SOS packets so search helicopters and rescue boats pinpoint your location.',
    androidString: 'android.permission.ACCESS_FINE_LOCATION',
    critical: true,
  },
  {
    key: 'ACCESS_BACKGROUND_LOCATION',
    name: 'Background Mesh Location',
    category: 'location',
    rationale:
      'Required by Android to maintain BLE packet discovery while your phone screen is locked.',
    androidString: 'android.permission.ACCESS_BACKGROUND_LOCATION',
    critical: false,
  },

  // 3. Alerts & Foreground Services
  {
    key: 'POST_NOTIFICATIONS',
    name: 'Emergency Notifications',
    category: 'alerts',
    rationale:
      'Sounds immediate high-priority alerts when evacuation orders or rescue acks arrive.',
    androidString: 'android.permission.POST_NOTIFICATIONS',
    critical: true,
  },
  {
    key: 'USE_FULL_SCREEN_INTENT',
    name: 'Full Screen Emergency Wakeup',
    category: 'alerts',
    rationale:
      'Wakes device screen during critical disaster alerts even when locked or in Do Not Disturb.',
    androidString: 'android.permission.USE_FULL_SCREEN_INTENT',
    critical: false,
  },
  {
    key: 'FOREGROUND_SERVICE_CONNECTED_DEVICE',
    name: 'Mesh Radio Service',
    category: 'alerts',
    rationale: 'Keeps BLE mesh relay active in background without being killed by Android OS.',
    androidString: 'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
    critical: true,
  },
  {
    key: 'FOREGROUND_SERVICE_LOCATION',
    name: 'Disaster GPS Service',
    category: 'alerts',
    rationale: 'Maintains fresh location fix when cellular towers are down.',
    androidString: 'android.permission.FOREGROUND_SERVICE_LOCATION',
    critical: false,
  },
  {
    key: 'RECEIVE_BOOT_COMPLETED',
    name: 'Auto-Restart on Phone Reboot',
    category: 'alerts',
    rationale:
      'Automatically re-arms the emergency mesh beacon if phone battery dies and restarts.',
    androidString: 'android.permission.RECEIVE_BOOT_COMPLETED',
    critical: false,
  },

  // 4. SMS Fallback
  {
    key: 'SEND_SMS',
    name: 'SMS Outbox Fallback',
    category: 'sms',
    rationale:
      'Transmits compact 70-char encoded packets directly to control room when mesh is out of range.',
    androidString: 'android.permission.SEND_SMS',
    critical: false,
  },
  {
    key: 'RECEIVE_SMS',
    name: 'SMS Acknowledgment Ingest',
    category: 'sms',
    rationale: 'Receives signed control-room rescue acks and injects them back into the BLE mesh.',
    androidString: 'android.permission.RECEIVE_SMS',
    critical: false,
  },

  // 5. Battery Optimization Exemption
  {
    key: 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    name: 'Ignore Battery Optimizations',
    category: 'battery',
    rationale:
      'Crucial for survival: prevents Android OEM aggressive killers from stopping the mesh lifeline.',
    androidString: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    critical: true,
  },
];
