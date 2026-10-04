# RescueNet Google Play Console Compliance Declarations (Phase 16)
## Regulatory Submissions, Permissions Justifications & Privacy Disclosures

**Application Name:** RescueNet: Emergency Offline Mesh & Disaster Triage  
**Package ID:** `org.rescuenet.app` (Play Flavor) / `org.rescuenet.app.sideload` (Government/NGO Sideload Flavor)  
**Target API Level:** Android 14+ (API Level 34–35)

---

## 1. Foreground Service (FGS) Type Declarations (Android 14+, API 34)

Google Play policy requires explicit justification and user-visible notification mechanics for every declared `foregroundServiceType`.

### A. `FOREGROUND_SERVICE_CONNECTED_DEVICE`
* **Manifest Entry:**
  ```xml
  <service android:name=".mesh.RescueMeshService"
      android:foregroundServiceType="connectedDevice|location|dataSync"
      android:exported="false" />
  ```
* **Use Case Description:**
  RescueNet establishes and maintains continuous Bluetooth Low Energy (BLE) peripheral GATT server and central client connections with adjacent survivor and responder handsets to form a decentralized ad-hoc mesh.
* **User-Facing Notification:**
  Title: *"RescueNet Mesh Active"*  
  Body: *"Continuously scanning for nearby survivors and relaying emergency beacons."*  
  Persistent notification displays active mesh peer count and battery preservation status.
* **Why FGS is Indispensable:**
  Disasters frequently disrupt all cellular towers and power grids. If the mesh process is terminated when the screen turns off, the user is disconnected from multi-hop relaying and cannot receive life-saving rescue confirmations or broadcast SOS beacons.

### B. `FOREGROUND_SERVICE_LOCATION`
* **Use Case Description:**
  Acquires GNSS/GPS coordinates when a survivor triggers an emergency SOS or when a rescuer navigates to victims via homing mode.
* **User-Facing Notification:**
  Title: *"Emergency SOS Active — Location Broadcasting"*  
  Body: *"Transmitting encrypted GPS coordinates over BLE mesh to first responders."*
* **Why FGS is Indispensable:**
  Trapped survivors under collapsed structures or in flood zones frequently have their phones locked or in low-power pocket states. Continuous location updates ensure rescuers receive current coordinates as survivors move or are transported.

### C. `FOREGROUND_SERVICE_DATA_SYNC`
* **Use Case Description:**
  Executes delay-tolerant store-and-forward bundle transfers between encountering handsets (Spray-and-Wait DTN protocol).
* **User-Facing Notification:**
  Included in the unified persistent notification during active contact sessions.

---

## 2. Background Location Access Declaration (`ACCESS_BACKGROUND_LOCATION`)

* **Prominent In-App Disclosure Requirement:**
  RescueNet displays a full-screen dedicated disclosure dialog prior to requesting `ACCESS_BACKGROUND_LOCATION`:
  > *"RescueNet requires background location access to broadcast your exact emergency coordinates to nearby rescuers even when your phone is locked or your screen is turned off. Your location is never tracked in the cloud without an explicit emergency SOS trigger."*
* **Declaration Justification Video Script:**
  1. Open RescueNet on Android 14.
  2. Demonstrate user entering 'ARMED' preparedness mode.
  3. Show the prominent disclosure explaining why background GPS is vital for trapped victim extraction.
  4. Lock the device (screen turned off).
  5. Second device scans and successfully discovers the survivor's emergency beacon with accurate GPS coordinates.

---

## 3. SMS Permissions Declaration (`SEND_SMS` / `RECEIVE_SMS`)

* **Flavor Separation Strategy:**
  - **`play` flavor:** Strictly excludes `SEND_SMS` and `RECEIVE_SMS` permissions. Direct cellular uplink and BLE mesh are utilized; optional SMS relies on Android's native SMS Intent or SMS Retriever API.
  - **`sideload` flavor:** Includes `SEND_SMS` and `RECEIVE_SMS` for government disaster management agencies (NDRF/SDRF), emergency personnel, and APK distribution through state portals.
* **Play Policy Exemption Category (If submitted on Enterprise Play):**
  - **Selected Category:** *Emergency and Disaster Alerting Systems / Public Safety*.
  - **Justification Text:**
    *"RescueNet is a life-critical disaster response application engineered for wide-area cellular infrastructure collapse. When all IP connectivity fails, the application autonomously formats and transmits compact Base64URL emergency beacons via SMS to emergency dispatch gateways. Without autonomous background SMS dispatch, trapped victims unable to interact with SMS dialogs cannot be rescued."*

---

## 4. Privacy & Data Minimization Declarations

* **No User Accounts Required:** Application functions 100% offline without mandatory email, phone number, or social login.
* **Ephemeral Pseudonyms:** Signing keys and BLE MAC addresses rotate every 24 hours to prevent tracking.
* **Zero PII over Mesh:** Survivor names are never broadcast over the air.
* **Local Wipe:** Settings screen includes a cryptographic one-tap "Wipe All Data & Keys" button.
