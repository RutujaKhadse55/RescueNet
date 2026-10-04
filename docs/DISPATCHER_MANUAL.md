# RescueNet Tactical Control Room Dispatcher Operator Manual (Phase 16)

**Audience:** Emergency Operations Centre (EOC) Dispatchers, Triage Officers, Incident Commanders  
**Software:** RescueNet Tactical Web Dashboard (`http://localhost:5173` or `https://controlroom.rescuenet.gov.in`)

---

## 1. Tactical Dashboard Overview

The RescueNet Tactical Dashboard gives incident commanders an instant operational picture of clustered survivors, active field rescue teams, and communication gateways:

```
┌────────────────────────────────────────────────────────────────────────┐
│  [RescueNet EOC]  ● ONLINE (LTE + Sat)   Incidents: 3   Rescuers: 12   │
├──────────────────────────────────────┬─────────────────────────────────┤
│                                      │  PRIORITY CLUSTER QUEUE         │
│                                      │                                 │
│                                      │  🔴 #CL-01: 8 Trapped (P: 98)   │
│                                      │     Sector 4 Collapsed School   │
│              LEAFLET                 │     [Assign Team] [Send ACK]    │
│           TACTICAL MAP               │                                 │
│                                      │  🟠 #CL-02: 14 Cut-off (P: 84)  │
│    🔴 CL-01         🚙 Team Alpha     │     Riverbank High Ground       │
│                                      │     [Assign Team] [Send ACK]    │
│            🟠 CL-02                  │                                 │
│                                      │  🟡 #CL-03: 3 Safe (P: 42)      │
│                                      │     Community Shelter North     │
├──────────────────────────────────────┴─────────────────────────────────┤
│  SYSTEM STATUS: 1,000 Nodes Active | Airtime: 4.2% | Gateway: BSNL-SIM │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Dispatcher Workflows

### Workflow A: Evaluating & Acknowledging a New Survivor Cluster
1. **Cluster Notification:** When a new cluster summary arrives from the mesh or SMS gateway, an audible alert sounds, and the cluster appears highlighted in red on the map.
2. **Reviewing Cluster Details:** Click the cluster marker on the map or select it from the sidebar queue. The detail panel shows:
   - Estimated survivor count and triage distribution (e.g. 5 Trapped, 3 Injured).
   - Critical needs bitmask (Medical, Water, Extraction tools).
   - Age of latest packet and reporting BLE device count.
3. **Dispatching Rescuer Acknowledgments (ACK):**
   - Click the **"Dispatch Signed ACK"** button.
   - Enter estimated response time (ETA, e.g. `15` minutes).
   - Click **"Sign & Broadcast ACK"**.
   - The central server signs the acknowledgment using the Agency Private Key and transmits it both via cellular SMS and reverse BLE mesh flooding to the victims' phones.
   - Survivor screens immediately display: *"Help is on the way! Rescuer ETA: 15 mins."*

### Workflow B: Assigning a Field Response Team
1. In the cluster detail sheet, click **"Assign Team"**.
2. Select an available unit (e.g., `SDRF Team 3 (Bravo)`).
3. The cluster is tagged as `ASSIGNED`.
4. Team Bravo's mobile application updates immediately via WebSocket or local relay with coordinates and route homing parameters.

### Workflow C: Managing Abusive or Compromised Keys
If a bad actor floods synthetic SOS beacons or spams false alerts:
1. In the cluster detail inspector, click the **"Inspect Origins"** tab.
2. Review packet telemetry and sensor corroboration score.
3. If confirmed malicious, click **"Ban Origin Key"**.
4. Enter the justification (e.g. `Synthetic spoofed coordinates`).
5. The key is added to `/v1/abuse/banned-keys`. The mesh and API immediately reject all future packets from that key.

### Workflow D: Issuing Emergency Area Broadcasts
To send evacuation or tsunami warnings to all handsets within a geographic zone:
1. Click **"Broadcast Advisory"** on the top toolbar.
2. Draw a bounding polygon or radius circle over the target region.
3. Select alert severity (`CRITICAL`, `WARNING`, `ADVISORY`).
4. Enter warning text (translated automatically into Hindi, Marathi, etc.).
5. Click **"Broadcast to Mesh"**.
