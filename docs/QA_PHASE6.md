# RescueNet QA & Field Test Checklist: Phase 6 (Offline SOS & Location Acquisition)

## Test Environment Requirements
- **Location Setting**: Indoors, underground basement/parking, and open field.
- **Physical Devices**: Two Android devices running RescueNet with airplane mode engaged and Bluetooth enabled.

---

## 1. Activation Triggers & False-Trigger Guard
- [ ] **1.5s Press-and-Hold**:
  - Touch and hold SOS button on Home screen.
  - Haptic feedback pulses during hold.
  - Releasing prior to 1.5s cancels without broadcasting.
  - Holding past 1.5s enters 5-second cancelable countdown window.
- [ ] **5-Second False-Trigger Guard**:
  - Countdown visibly displays `5, 4, 3, 2, 1...` with prominent `Cancel SOS` button.
  - Tapping `Cancel SOS` reverts to `IDLE` state with zero mesh packets dispatched.
  - Allowing timer to elapse commits and broadcasts signed SOS packet.
- [ ] **Instant 1-Tap Bypass**:
  - Tapping `"⚡ INSTANT 1-TAP BROADCAST"` bypasses countdown and broadcasts in $< 2$ taps and $< 3$ seconds.
- [ ] **Hardware Sequence Trigger**:
  - Tapping power button 5 times or pressing volume keys in configured sequence launches emergency flow from background service.

---

## 2. Optional Details Sheet (10s Auto-Send)
- [ ] Modal displays:
  - Triage Condition: Critical (Red), Trapped (Orange), Injured (Yellow), Safe (Green).
  - People counter (+ / - stepper).
  - Needs checklist: Medical, Food/Water, Search/Rescue, Warmth/Shelter.
  - Short note (up to 24 characters limit enforced).
  - Emergency contact name.
- [ ] **10-Second Auto-Send**:
  - Countdown badge ticks down from 10s.
  - If user takes no action, modal submits whatever is currently selected at 0s.
  - Tapping `"Skip & Send"` immediately broadcasts.

---

## 3. Disaster Location Acquisition & Rubble Fallbacks
- [ ] **Open Sky GPS Fix**:
  - Fix acquired within 30 seconds with accuracy $< 10$ meters.
- [ ] **GPS Loss / Indoor Debris Fallback**:
  - Turn off GPS satellite reception (or enter underground concrete basement).
  - Request emergency SOS.
  - System falls back immediately to last known good cached fix.
  - Effective accuracy radius inflates by $0.5\text{ m/s} \times \Delta t_{\text{seconds}}$.
  - UI displays: `"Accuracy: ±Xm (Age-inflated GPS fallback)"`.
- [ ] **Barometric Floor Separation**:
  - Device pressure sensor (e.g. 950.4 hPa) estimates relative elevation change from baseline.
  - UI displays estimated floor separation (e.g., `"Approx Floor 2"`).
- [ ] **Manual Pin Override**:
  - User can tap map to override pin and add a free-text location note (e.g. `"Basement B2 near elevator shaft"`).

---

## 4. Packet Creation & Adaptive Rebroadcast
- [ ] **Ed25519 Signing**:
  - Packet type `0x01` (SOS), TTL `10`, hop `0`, Spray-and-Wait copies $L = 6$.
  - Packet verifiable offline with sender's public key.
- [ ] **Sequence Counter**:
  - Repeated SOS updates increment `sequenceNumber` strictly monotonically.
- [ ] **Movement-Adaptive Rebroadcast**:
  - Stationary ($< \text{accuracy radius}$ movement): Rebroadcast throttled to 10 minutes.
  - Moving ($> \text{accuracy radius}$ displacement): Rebroadcast triggers every 2 minutes.

---

## 5. SOS Status Screen & "I Am Safe Now" Flow
- [ ] Plain-language milestone progress updates in real time:
  1. `Saved on this phone` (Packet ID signed)
  2. `Shared with X nearby phones` (Increments on BLE delivery)
  3. `Reached a connected phone` (Gateway node relay flag)
  4. `Control room received your SOS` (Control room ingest ACK)
  5. `Help is on the way (ETA 25 min)` (Rescuer dispatch ACK)
- [ ] **"I Am Safe Now" Resolution**:
  - Tapping `"🛡️ I Am Safe Now"` prompts confirmation modal.
  - Generates signed `SAFE` (0x00 status) packet and broadcasts to mesh.
  - Resolves emergency state and resumes normal mesh relay.

---

## 6. Dead-Man's Beacon & Survival Mode
- [ ] **Survival Mode ($\le 20\%$ Battery)**:
  - Phone battery drops to 20% or user enables manual toggle in Settings.
  - Background scans stretch to `LOW_POWER` duty cycle.
  - Non-essential UI animations dim.
  - Relays SOS packets only.
- [ ] **Dead-Man's Beacon ($\le 5\%$ Battery)**:
  - Battery reaches 5%:
  - Device creates and sends **exactly one** `DEADMAN` packet (type `0x04`) with last position, status, people count, and battery %.
  - Radio locks immediately into `BEACON_ONLY` advertising mode.
  - Scanning drops to minimum power.
  - Clear user alert explains dead-man state and battery preservation steps.
