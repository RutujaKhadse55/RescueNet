# RescueNet Platform Limits & Build Flavors

## Android Platform Restrictions

### SMS Permissions (SEND_SMS / RECEIVE_SMS)

Google Play Store policy **restricts** the `SEND_SMS` and `RECEIVE_SMS` permissions to apps
declared as the **default SMS app**. RescueNet is not a default SMS app, so it operates under
two distinct build flavors:

| Flavor | SMS Capability | Distribution |
|--------|---------------|--------------|
| **`sideload`** | Full silent SMS via `SmsManager.sendTextMessage` and `RECEIVE_SMS` broadcast receiver. Both `SEND_SMS` and `RECEIVE_SMS` are declared in `AndroidManifest.xml`. | APK distributed directly through NDRF/SDRF channels, relief camp kiosks, or QR code installation. |
| **`play`** | SMS only via `Intent.ACTION_SENDTO` (opens the user's default messaging app with a prefilled message). No `SEND_SMS`/`RECEIVE_SMS` declared. | Published on Google Play Store. |

> **Why two flavors?** During an actual disaster, sideloaded APKs reach more survivors faster
> because Play Store download requires internet. Relief workers distribute the sideload APK
> via Bluetooth or shared flash drives.

### Build-flavor switching

```bash
# Sideload build (full SMS)
./gradlew assembleSideloadRelease

# Play Store build (intent-only SMS)
./gradlew assemblePlayRelease
```

`SmsFallbackService` detects the flavor at runtime via `BuildConfig.FLAVOR`:
- `"sideload"` ? calls `ISmsBridge.sendTextMessage()` (native Kotlin SmsManager).
- `"play"`     ? calls `ISmsBridge.openSystemSmsApp()` (fires `ACTION_SENDTO` intent).

### Bluetooth Restrictions (Android 13+ / API 33)

`BluetoothAdapter.enable()` is **deprecated** and **blocked** on Android 13+. The app must use:
- `BluetoothAdapter.ACTION_REQUEST_ENABLE` intent (prompts user) for foreground scenarios.
- `ConnectivityGovernor.recoverBluetooth()` wraps this and re-prompts every 60 s while SOS is active.

### Foreground Service Types (Android 14 / API 34)

All three foreground service types must be declared in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```

The `RescueNetForegroundService` specifies `android:foregroundServiceType="connectedDevice|location|dataSync"`.

### BLE Payload Size

| BLE Version | Max Advertising Payload | RescueNet Approach |
|-------------|------------------------|-------------------|
| BLE 4.0–4.2 | ~20 bytes               | GATT fragmentation via `PACKET_TX/RX` characteristics |
| BLE 5.0+    | ~254 bytes (Extended)   | Extended Advertising for summary vector; GATT for data |

RescueNet requires BLE 5.0+ for optimal operation. BLE 4.x devices fall back to pure
GATT-based fragmentation at ~20-byte MTU but still participate in the mesh.

### Battery Optimization Exemption

The app requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` to keep background scanning alive.
Without this, Doze mode will pause scanning. Users must explicitly grant this in Settings.

### Location Permissions

Fine location (`ACCESS_FINE_LOCATION`) and background location (`ACCESS_BACKGROUND_LOCATION`)
are required for BLE scanning (Android 12+) and GPS coordinate collection.

## iOS Platform Notes (Future)

iOS BLE background scanning is **restricted** to specific use cases using
`CBCentralManagerOptionRestoreIdentifierKey` and ANCS/background modes.
Full BLE mesh on iOS requires CoreBluetooth + background task workarounds.
The `IBleTransport` interface is designed to be implemented for iOS separately.

## Data Retention & Privacy

- Local SQLite is encrypted with SQLCipher; key stored in Android Keystore.
- No plaintext packet payloads leave the device in unencrypted form.
- Direct (E2EE) chat: relay nodes store opaque ciphertext; only recipient decrypts.
- Location packets: 30-minute retention in mesh; not uploaded to server without explicit consent.
- "Delete my data": `DatabaseManager.wipeAllData()` removes all tables and Keystore keys.
