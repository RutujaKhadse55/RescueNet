# Phase 4 Manual QA Checklist: Mobile App Shell, Identity, Local Database, Consent & Preparedness

**Device Scope**: Android 8.0+ (API 26 to 35). High-contrast dark theme, one-hand emergency operation, TalkBack accessibility.
**Target Package**: `org.rescuenet.app` (`apps/mobile`)

---

## 1. Airplane-Mode Launch & Zero-Network Resilience
- [ ] Enable **Airplane Mode** on the Android device (disconnect Wi-Fi, Cellular, Mobile Data).
- [ ] Cold launch RescueNet from the app drawer.
- [ ] **Verification**: App boots in under 1 second without crash, blocking spinner, or network error dialogue.
- [ ] Verify telemetry banner displays: `BLE MESH ACTIVE`, `🔋 Battery %`, and `⚠️ UNREGISTERED (LOW TRUST)`.
- [ ] Confirm background pre-registration gracefully degraded without error.

---

## 2. First-Run Consent Flow
- [ ] Clear app data or run fresh install.
- [ ] Launch app; verify **Consent Modal** automatically overlays the screen.
- [ ] **Step 1 (What is shared)**:
  - [ ] Verify explanations for GPS coordinates, triage urgency, and battery telemetry.
  - [ ] Toggle switches (Share GPS Fix, Share Triage, Share Battery).
- [ ] **Step 2 (Who can see your data)**:
  - [ ] Verify plain-language disclosure: NDRF/SDRF emergency teams & control rooms can see raw location; intermediate relay nodes cannot read or decrypt private messages.
- [ ] **Step 3 (Optional Features)**:
  - [ ] Verify Peer-to-Peer Chat toggle (default: OFF).
  - [ ] Verify Live Location Sharing toggle (default: OFF).
- [ ] **Step 4 (Opt-in Identity & Retention)**:
  - [ ] Verify full name input is marked (Optional).
  - [ ] Verify phone number input is marked (Optional).
  - [ ] Verify "Consent Policy v1.0" badge.
- [ ] Tap **"I Understand & Agree"**.
- [ ] **Verification**: Modal dismisses, consent record saved to local `consent` table with version 1.
- [ ] Kill app and re-launch: Consent modal does NOT appear again.

---

## 3. Navigation & 5 Bottom Tabs
- [ ] Verify 5 tabs in bottom navigation bar: **Home**, **Nearby**, **Chat**, **Map**, **Settings**.
- [ ] Confirm touch target height >= 56dp for all tabs (exceeds 48dp accessibility guideline).
- [ ] Turn on **TalkBack** (Accessibility Service):
  - [ ] Swipe through tabs and confirm TalkBack announces:
    - *"Home tab, double tap to activate"*
    - *"Nearby tab, double tap to activate"*
    - *"Chat tab, double tap to activate"*
    - *"Map tab, double tap to activate"*
    - *"Settings tab, double tap to activate"*
- [ ] Verify active tab has high-contrast indicator bar and colored label.

---

## 4. Emergency Home Screen (< 2 Taps Guarantee)
- [ ] **Triage Urgency Selection**:
  - [ ] Tap **Red (Immediate / Critical)**: Button turns red with high contrast.
  - [ ] Tap **Yellow (Delayed)**: Button turns yellow.
  - [ ] Tap **Green (Minor / Safe)**: Button turns green.
  - [ ] Tap **Black (Expectant / Trapped)**: Button turns gray.
- [ ] **Immediate Needs Checkboxes**:
  - [ ] Toggle Medical Help, Trapped/Debris, Food & Clean Water, Shelter.
  - [ ] Verify active chips illuminate.
- [ ] **GPS Telemetry Card**:
  - [ ] Verify coordinates, accuracy estimate (± 4.2m), and altitude (560m) are rendered.
- [ ] **Emergency SOS Trigger (Hold 3 Seconds)**:
  - [ ] Press and hold giant red **SOS EMERGENCY** button.
  - [ ] Verify animated dark progress fill sweeps across the button from 0% to 100%.
  - [ ] Release after 1 second: hold cancels, button returns to idle state without broadcast.
  - [ ] Hold for full 3 seconds: button turns green with text **"SOS BROADCASTED TO MESH"**.
- [ ] **Instant 1-Tap Emergency Bypass (< 2 Taps Guarantee)**:
  - [ ] Tap **"⚡ INSTANT 1-TAP BROADCAST"**.
  - [ ] Verify immediate broadcast confirmation appears without 3s delay.
- [ ] Check local database: Packet inserted into `packets` table with `is_sos = 1`, `packet_type = 0x01`, `copies_left = 6`.

---

## 5. Identity & Ephemeral Pseudonyms
- [ ] Navigate to **Settings** tab.
- [ ] Inspect **Identity & Pseudonyms** card:
  - [ ] Confirm **Root Origin Fingerprint** displays 16 hex characters (8 bytes, derived via BLAKE2b).
  - [ ] Confirm **Active Ephemeral Pseudonym** displays (1/10).
  - [ ] Confirm expiration date displays 24 hours from creation.
- [ ] Tap **"🔄 Rotate Pseudonym Now"**:
  - [ ] Confirm active pseudonym index advances to 2/10.
  - [ ] Confirm active fingerprint changes to keypair #2 in the pool.
- [ ] Verify Keystore hardware-backed encryption storage.

---

## 6. Local Encrypted Database & LRU Eviction Safety
- [ ] Verify SQLCipher 256-bit encryption key generated and retrieved from Android Keystore.
- [ ] Inspect tables created via migration v1:
  - `packets`, `neighbors`, `clusters`, `cluster_members`, `chat_messages`, `conversations`, `peers`, `outbox_uplink`, `outbox_sms`, `settings`, `consent`, `event_log`.
- [ ] **LRU Eviction Test (50 MB Cap)**:
  - [ ] Insert 1 un-uplinked SOS packet (`is_sos = 1, uplinked_at = NULL`).
  - [ ] Insert 1 uplinked SOS packet (`is_sos = 1, uplinked_at != NULL`).
  - [ ] Insert 5 non-SOS packets (chat, deadman, hello).
  - [ ] Force storage cap overflow.
  - [ ] **Critical Invariant Verification**: Non-SOS packets and uplinked SOS packets are evicted first; the **un-uplinked SOS packet is NEVER evicted**.

---

## 7. Permission Onboarding & OEM Guides
- [ ] In **Settings**, launch **"OEM Battery Optimization Guide"**:
  - [ ] Select **Xiaomi**: Check steps for MIUI/HyperOS Autostart and "No Restrictions".
  - [ ] Select **Oppo / Realme**: Check ColorOS auto-launch and "Don't optimize".
  - [ ] Select **Vivo / iQOO**: Check FuntouchOS High Background Power.
  - [ ] Select **Samsung**: Check One UI "Never sleeping apps".
  - [ ] Select **OnePlus**: Check OxygenOS app lock in recent apps.
- [ ] Launch **Permission Wizard**:
  - [ ] Stage 1: Bluetooth Mesh (`BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`).
  - [ ] Stage 2: Location (`ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`).
  - [ ] Stage 3: Alerts (`POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_*`).
  - [ ] Stage 4: SMS Fallback (`SEND_SMS`, `RECEIVE_SMS`).
  - [ ] Stage 5: Battery Optimization (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
  - [ ] Verify "Open App Settings" button links directly to Android App Info settings screen.

---

## 8. Preparedness Mode & Live Readiness Score
- [ ] In **Settings**, tap **Preparedness Self-Test** badge.
- [ ] Inspect **Readiness Score Circle** (0 to 100):
  - [ ] Verify score dynamically computes based on 11 criteria (Permissions, Battery, BLE, GPS, Coded PHY, SMS, Identity, Map Pack, Control Room Sync, Emergency Contacts).
  - [ ] Verify tier badge: `Critical` (<40), `Moderate` (40-69), `High` (70-89), `Disaster Ready` (90-100).
- [ ] **Monsoon Season Reminder**:
  - [ ] Verify monsoon warning banner displays risk advisory during Indian southwest monsoon window (June - September).
- [ ] **Drill Mode Toggle**:
  - [ ] Turn ON **Drill / Exercise Mode**.
  - [ ] Broadcast an emergency SOS: verify packet carries `test_drill = 1` (flag bit 3 / 0x08).
- [ ] **Simulated BLE Range Test**:
  - [ ] Tap **"Start Range Ping"**.
  - [ ] Verify 5 pings execute with simulated signal jitter.
  - [ ] Verify results card displays: Success Rate (%), Average RSSI (dBm), and Estimated Line-of-Sight Distance (meters).

---

## 9. Offline Map Pack Downloader
- [ ] In **Map** tab, tap **"Download Region Pack"**.
- [ ] Verify Indian disaster regions:
  - Maharashtra (Western Ghats & Mumbai) - ~42.5 MB
  - Kerala (Wayanad, Idukki & Coastal) - ~38.0 MB
  - Uttarakhand & Himachal (Himalayan Flood Belt) - ~47.8 MB
  - Assam & Northeast (Brahmaputra Valley) - ~34.6 MB
  - Odisha & Andhra Pradesh (Cyclone Corridor) - ~40.2 MB
  - Delhi NCR & Yamuna Floodplain - ~28.5 MB
- [ ] **Storage Check**:
  - [ ] Verify disk space check calculates available space vs required file size + 100 MB buffer.
- [ ] Tap **"Download Pack"** on Maharashtra:
  - [ ] Progress bar advances (0% -> 100%).
  - [ ] Tap **Pause**: state switches to Paused.
  - [ ] Tap **Resume**: download resumes from current chunk.
  - [ ] Upon 100%: status changes to "Ready for offline use (PMTiles)".
- [ ] Return to **Map** tab: confirm top badge updates to **"✓ Map Pack Ready"**.
- [ ] Return to **Preparedness**: confirm map pack item gets +10 points towards readiness score.

---

## 10. Role Switching & Full i18n
- [ ] In **Settings**, switch role to **Rescuer**:
  - [ ] Verify **Rescuer Credential Modal** appears.
  - [ ] Input credential token and confirm switch.
- [ ] Switch role to **Gateway**:
  - [ ] Confirm gateway mode activates.
- [ ] Switch role back to **Survivor (Default)**.
- [ ] **Language Switching**:
  - [ ] Switch to **हिन्दी (Hindi)**: Confirm tabs and SOS labels translate to Hindi.
  - [ ] Switch to **मराठी (Marathi)**: Confirm all screens update to Marathi.
  - [ ] Switch to **മലയാളം (Malayalam)**: Confirm all screens update to Malayalam.
  - [ ] Switch to **ಕನ್ನಡ (Kannada)**: Confirm all screens update to Kannada.
  - [ ] Switch back to **English**.

---

## 11. Danger Zone: Wipe All Local Data
- [ ] In **Settings**, scroll to **Danger Zone**.
- [ ] Tap **"Wipe All Local Data"**.
- [ ] Confirm warning modal details irreversible loss of identity keys, SMS secrets, chat, and packets.
- [ ] Tap **"Wipe Everything"**.
- [ ] **Verification**:
  - [ ] All 12 SQLite tables emptied (`DELETE FROM ...`).
  - [ ] Keystore root identity and SQLCipher keys removed.
  - [ ] App resets to fresh un-consented state; Consent Modal immediately re-appears on screen.
