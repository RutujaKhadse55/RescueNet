# RescueNet Field Pilot & Mock Drill Operational Plan (Phase 16)
## Multi-Agency Disaster Simulation with SDRF/NDRF & District Authorities

**Document Status:** Ready for Operational Execution  
**Participating Agencies:** District Disaster Management Authority (DDMA), State Disaster Response Force (SDRF 5th Bn), University Campus Emergency Corps  
**Target Drill Location:** Pune District Disaster Training Grounds & University Engineering Campus (1.8 km²)

---

## 1. Drill Roles & Responsibilities

| Role | Agency / Personnel | Primary Operational Responsibility |
| :--- | :--- | :--- |
| **Drill Commander** | DDMA Additional Collector | Overall drill authorization, safety halts, media liaison |
| **Tactical Dispatcher** | SDRF Control Room Officer | Operates Tactical Web Dashboard; triage cluster prioritization & team dispatch |
| **Rescuer Recon Team** | 4 SDRF Teams (3 personnel each) | Rescuer app in Homing Mode; sweep patrols; physical victim extraction |
| **Survivor Actors** | 60 University Volunteers | Staged in rubble/flood zones with survivor app; simulating trapped injuries |
| **Civilian Carriers** | 30 Roaming Volunteers | Walking campus paths simulating civilian foot traffic acting as data mules |
| **Scientific Data Observers**| 6 Research Observers | Logs ADB timelines, stopwatch TTFC, battery logs, ground truth records |

---

## 2. Disaster Simulation Scenarios

### Scenario A: Urban Earthquake & Multi-Story Structural Collapse
* **Setting:** 3-story concrete training building with rubble piles and basement vaults.
* **Conditions:** Zero cellular signal (simulated via RF jammer or cellular disabled on handsets).
* **Setup:** 20 survivor actors sheltered in void spaces across floors 1, 2, and basement.
* **Objective:** Test BLE penetration through concrete/rebar slabs and evaluate Rescuer Homing Mode (Kalman-filtered signal trends) for pinpointing buried survivors.

### Scenario B: Riverine Flash Flood & Isolated Settlement Island
* **Setting:** Island park surrounded by river channel (250 m water barrier).
* **Conditions:** Terrestrial bridges cut; only boat and drone access possible.
* **Setup:** 25 survivor actors clustered on high ground.
* **Objective:** Test mobile data mules (patrol boat and recon vehicle equipped with gateway phone) bridging the river channel void without direct line-of-sight.

### Scenario C: Hillside Landslide & Road Severance
* **Setting:** Steep hillside path with simulated road blockage.
* **Conditions:** Terrestrial power and telecom fiber lines severed.
* **Setup:** 15 survivor actors distributed along a 1.2 km winding trail.
* **Objective:** Test multi-hop store-and-forward Spray-and-Wait relay across moving hikers and autonomous SMS fallback to the emergency virtual number.

---

## 3. Data Collection Protocols & Metrics

1. **Time to First Rescuer Contact (TTFC):**
   - Stopwatch from initial survivor SOS broadcast to first physical responder contact and transmission of signed `REACHED` packet.
   - **Target SLA:** Median TTFC < 12 minutes in collapse scenario; < 25 minutes in flood island.
2. **Packet Delivery Rate (PDR):**
   - `(Total Unique Clusters Received at Dashboard / Total Ground-Truth Clusters) * 100`
   - **Target SLA:** > 95% delivery rate to control room.
3. **Duplicate SOS Reduction:**
   - Ratio of received transmissions to unique survivors.
   - **Target SLA:** > 90% reduction compared to plain flooding benchmark.
4. **False-Alarm Mitigation Rate:**
   - Number of accidental triggers intercepted during the 5-second countdown guard.
   - **Target SLA:** 100% false-alarm cancellations successfully intercepted.
5. **Battery Cost:**
   - Hourly drain logged across all handsets via `dumpsys batterystats`.
   - **Target SLA:** < 1.8% / hour in active relay; < 0.3% / hour in survival beacon mode.

---

## 4. Ethics, Consent & Participant Safety

* **Informed Consent Protocol:** Every volunteer signs a digital consent form explaining that simulated GPS, battery telemetry, and dummy medical tags are collected strictly for research verification.
* **Real Emergency Bailout:** Any participant experiencing real distress blows a physical whistle or presses the physical red safety button to abort drill participation immediately.
* **Zero PII Exposure:** Handsets operate with randomized ephemeral pseudonyms; no real citizen names or Aadhaar numbers are recorded.

---

## 5. Post-Drill Evaluation Report Template

```markdown
# RescueNet Mock Drill After-Action Report (AAR)

**Drill Date:** [YYYY-MM-DD]  
**Scenario Tested:** [Collapse / Flood / Landslide]  
**Total Participants:** [Survivors: X, Rescuers: Y, Carriers: Z]

### 1. Key Metrics Achieved
- Ground Truth Victims Staged: [ N ]
- Victims Accounted for on Dashboard: [ N ] (Delivery Rate: X%)
- Median Time to First Contact (TTFC): [ MM:SS ]
- Fastest Cluster Extracted: [ MM:SS ]
- Average Handset Battery Drain: [ X% / hr ]
- Total Radio Transmissions Recorded: [ N ]

### 2. Operational Observations & Lessons Learned
- RF Propagation Findings in Rubble: [ Observations ]
- Rescuer Homing Feedback: [ Was signal guidance intuitive? ]
- Battery Restriction / OEM Throttling Issues: [ Xiaomi/Samsung flags ]
- Recommendations for Next Field Exercise: [ Action items ]
```
