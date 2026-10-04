# RescueNet Government, SDRF/NDRF & NGO Distribution Guide (Phase 16)
## Enterprise & Public Sector Deployment Protocols

**Target Deployments:** State Disaster Management Authorities (SDMA), National Disaster Response Force (NDRF), State Disaster Response Forces (SDRF), Indian Red Cross Society, and District Collectors.

---

## 1. Distribution Tracks Overview

RescueNet supports three primary deployment vectors to ensure rapid field readiness:

| Vector | Audience | Key Privileges | Update Mechanism |
| :--- | :--- | :--- | :--- |
| **A. Signed APK Sideload** | Responders, volunteers, field crews | Direct SMS fallback, unconstrained BLE | Self-updating via APK or local server |
| **B. Enterprise MDM / EMM** | NDRF battalions, district response teams | Forced install, auto-granted runtime permissions | Microsoft Intune, VMware Workspace ONE |
| **C. OEM System Image** | Mass citizen distribution | Pre-installed survival app, system service | Android system OTA updates |

---

## 2. Track A: Signed APK Sideload & Local QR Code Distribution

In disaster operations centers cut off from Google Play:
1. **Generating the Release APK:**
   ```bash
   cd apps/mobile/android
   ./gradlew assembleSideloadRelease
   # Output: app/build/outputs/apk/sideload/release/app-sideload-release.apk
   ```
2. **Signing with Agency Key:**
   ```bash
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
     -keystore /secure/agency-release.keystore \
     app-sideload-release-unsigned.apk agency_alias
   zipalign -v 4 app-sideload-release-unsigned.apk RescueNet-Responder-Signed.apk
   ```
3. **Local Wi-Fi / Hotspot QR Distribution:**
   Command center sets up a captive portal hotspot:
   - When responders connect, they scan a QR code pointing to `http://192.168.1.1/download/RescueNet.apk`.
   - Download takes < 15 seconds over local Wi-Fi without internet.

---

## 3. Track B: Mobile Device Management (MDM / EMM)

For government-issued handsets (e.g. Samsung Galaxy XCover, Pixel, or ruggedized handhelds):

1. **Knox Mobile Enrollment (KME) / Zero-Touch Enrollment:**
   - Configure MDM policy to silently install `org.rescuenet.app.sideload`.
2. **Auto-Granted Runtime Permissions (Policy JSON):**
   ```json
   {
     "permission_policies": [
       { "permission": "android.permission.ACCESS_FINE_LOCATION", "policy": "grant" },
       { "permission": "android.permission.ACCESS_BACKGROUND_LOCATION", "policy": "grant" },
       { "permission": "android.permission.BLUETOOTH_SCAN", "policy": "grant" },
       { "permission": "android.permission.BLUETOOTH_ADVERTISE", "policy": "grant" },
       { "permission": "android.permission.BLUETOOTH_CONNECT", "policy": "grant" },
       { "permission": "android.permission.SEND_SMS", "policy": "grant" },
       { "permission": "android.permission.RECEIVE_SMS", "policy": "grant" }
     ],
     "battery_optimizations": {
       "disable_for_package": "org.rescuenet.app.sideload"
     }
   }
   ```
3. **Agency Credential Pre-Provisioning:**
   - Agency administrator pushes the agency CA public key and responder credentials directly via Managed App Configuration (`AppConfig`), avoiding manual QR code scanning in the field.

---

## 4. Track C: OEM Pre-Installation on Disaster-Prone Region Handsets

For district or state-level emergency preparedness initiatives:
1. Include `RescueNet.apk` in `/system/priv-app/RescueNet/` during ROM compilation.
2. Place permissions XML in `/etc/permissions/privapp-permissions-rescuenet.xml`:
   ```xml
   <permissions>
       <privapp-permissions package="org.rescuenet.app">
           <permission name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
           <permission name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
       </privapp-permissions>
   </permissions>
   ```
3. Handset arrives factory-ready with life-saving mesh active on first boot.
