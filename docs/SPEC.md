# RescueNet System Specification

## 1. Executive Summary & Problem Statement

In major natural disasters across India—such as severe floods in Kerala, Assam, and Uttarakhand, landslides in Wayanad, and seismic events in the Himalayan tectonic belt—terrestrial telecommunications infrastructure frequently collapses within hours. Cell towers lose power or backhaul fiber connections, leaving thousands of civilians isolated.

Existing peer-to-peer mesh applications primarily prioritize text communication ("walkie-talkie" or group chat), leading to bandwidth congestion, rapid battery exhaustion, and an inability for official rescue agencies (NDRF, SDRF, Indian Army, Civil Defence) to systematically identify, triage, and reach the most critical survivors.

**RescueNet** reverses this paradigm:

> **Core Principle**: Existing mesh apps help people talk; RescueNet helps rescuers decide where to go first. Chat and peer location sharing are strictly secondary and must never degrade SOS delivery.

RescueNet establishes an ad-hoc, multi-hop Bluetooth Low Energy (BLE) mesh across survivors' smartphones, enabling them to:

1. Broadcast compact, cryptographically signed binary SOS beacons containing high-accuracy GPS coordinates, altitude, battery level, and survivor triage metrics.
2. Relayed store-and-forward packets across disconnected survivor nodes.
3. Automatically group proximal victims using on-device and edge DBSCAN clustering to identify spatial triage hotspots.
4. Bridge packets to the central rescue dashboard as soon as any node reaches an operational cellular, satellite (e.g., Starlink/BGAN), or Wi-Fi gateway.
5. Fall back seamlessly to compact SMS encoded payloads when cellular control channels operate even if mobile packet data is offline.
6. Propagate signed digital Acknowledgments (ACKs) from rescuers back across the mesh to give survivors actionable confirmation and instructions.

---

## 2. User Personas & Operational Roles

| Persona                | Role                                      | Key Objectives                                                                                                            | Constraints & Environment                                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Survivor**           | Civilian in disaster zone                 | Trigger SOS, report casualties/water levels, conserve phone battery, view offline shelter maps, receive rescuer ACKs.     | Power < 20%, panic, wet/damaged device, no internet, physical hazard.             |
| **Rescuer**            | NDRF / SDRF / Volunteer Responder         | Navigate directly to high-priority clusters, triage victims, update status, transmit signed ACKs into the mesh.           | Active tactical mission, rugged devices, time-critical triage pressure.           |
| **Incident Commander** | Operations Room / HQ Lead                 | Monitor macro situational map, allocate rescue boats/helicopters/teams based on DBSCAN cluster scores, track field units. | Central base, high-bandwidth satellite/LTE link, coordinating multiple sectors.   |
| **Gateway Node**       | Mobile field vehicle / Drone / Edge relay | Ingest BLE mesh packets and forward to central API via intermittent satellite or LTE backhaul; broadcast downstream ACKs. | Constant or intermittent backhaul, continuous duty-cycle power (vehicle-powered). |

---

## 3. Operational Modes

RescueNet devices dynamically transition between four specialized operational modes:

### 3.1. Survivor Mode (Default in Emergency)

- **State Behavior**: Minimal UI, high-contrast disaster interface.
- **Mesh Duty Cycle**: Adaptive BLE advertising (every 1.5s - 3s) and scanning (500ms every 5s) to preserve battery under 20%.
- **Packet Priority**: Outbound SOS packets preempt all other queue items.
- **Triage Input**: 1-tap emergency trigger, optional rapid survey (injuries, children/infants, trapped status, rising water level).
- **Secondary Features**: Local peer discovery and peer text chat are bandwidth-throttled and completely paused if SOS queue depth is high or battery is critically low (<15%).

### 3.2. Rescuer Mode

- **State Behavior**: Rescuer-certified credentials verified via Agency CA signature.
- **Scanning Duty Cycle**: Aggressive continuous BLE scanning (100% duty cycle when powered by tactical packs).
- **Cluster Triage View**: Local offline list of detected survivor clusters sorted by composite priority score.
- **Downstream Dispatch**: Capable of authoring and injecting signed `RESCUER_ACK` and evacuation guidance beacons with maximum mesh TTL.

### 3.3. Gateway Mode

- **State Behavior**: Configured on vehicles, drone repeaters, or devices with detected active Internet connectivity (LTE, 5G, Wi-Fi, Satellite).
- **Bridge Pipeline**: Collects all cached mesh packets, performs deduplication, and streams binary batches to the Fastify REST/WebSocket ingest service.
- **Downstream Sync**: Pulls signed rescuer ACKs and agency announcements from the backend and floods them into the local BLE mesh.

### 3.4. Preparedness Mode (Pre-Disaster / Peacetime)

- **State Behavior**: Low-power maintenance mode.
- **Proactive Preparation**: Pre-downloads vector map tiles (MapLibre) for the local administrative district (district/taluka level).
- **Identity & Keys**: Generates Ed25519 node keypair, establishes emergency contact list, verifies agency public certificates.
- **Drill Functionality**: Allows participation in offline simulated mesh drills without generating emergency alerts.

---

## 4. Key Functional Capabilities

### 4.1. Ultra-Compact Binary Protocol (`packages/core`)

- Handcrafted compact binary encoding (no bloated JSON over BLE).
- Header: Version, Packet Type, Packet ID (BLAKE2b hash), Source Pubkey, Hop Count, TTL, Timestamp.
- Payload types: `SOS_BEACON`, `RESCUER_ACK`, `HEARTBEAT`, `PEER_MSG`, `LOCATION_SHARE`, `CLUSTER_SUMMARY`.
- Total advertising packet fits inside BLE extended advertising (or falls back to legacy 31-byte fragmented GATT transfer).

### 4.2. Multi-Hop Store-and-Forward Mesh

- Flooding with bounded hop count ($TTL \le 7$) and sliding-window LRU Bloom filter deduplication.
- Priority queueing: SOS beacons are always transmitted ahead of chat or telemetry packets.
- Offline persistence: Packets stored in local encrypted SQLite database until acknowledged or expired.

### 4.3. On-Device & Edge DBSCAN Spatial Clustering

- Dynamic clustering using Haversine distance ($\epsilon = 75\text{m} - 150\text{m}$) and minimum density ($MinPts = 2$).
- Groups nearby stranded survivors into actionable tactical clusters.
- Prevents rescuer teams from being dispatched to individual duplicate beacons when a single multi-story building or rooftop holds dozens of victims.

### 4.4. Composite Priority Scoring Engine

- Calculates a quantitative triage score $S \in [0, 100]$:
  $$S = w_1 \cdot \text{Severity} + w_2 \cdot \text{Vulnerability} + w_3 \cdot \text{EnvironmentalRisk} + w_4 \cdot \text{TimeDecay}$$
  where:
  - Severity: Trapped, severe hemorrhage, unconsciousness.
  - Vulnerability: Infants, pregnant women, elderly, medical equipment dependence.
  - Environmental Risk: Water rising rate (barometer + report), landslide slope proximity.
  - Time Elapsed: Exponential boost for long-unattended critical calls.

### 4.5. Hybrid SMS Fallback Transport

- When BLE mesh cannot reach a gateway within a configured timeout, but GSM cellular control channels exist (voice/SMS available despite 0 kbps packet data), RescueNet generates a compact Base64/Hex SMS.
- Transmitted to an inbound Agency Virtual Number or SMS Webhook Gateway.

### 4.6. Rescuer Web Dashboard (`apps/dashboard`)

- Real-time tactical GIS map powered by Leaflet and OpenStreetMap tiles.
- PostGIS-driven cluster aggregations, heatmaps, live rescuer tracking, and filterable survivor triage list.
- One-click signed ACK generation and broadcast back to the field.

---

## 5. Success Metrics & Validation Targets

| Metric                            | Target Goal                                                            | Verification Method                                                           |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Time to First Rescuer Contact** | $< 15$ minutes in moderate density mesh ($\ge 10$ nodes/$\text{km}^2$) | Network simulation (`packages/sim`) and field drill testing.                  |
| **SOS Packet Delivery Rate**      | $> 98\%$ in connected components; $> 85\%$ in sparse 5-hop topologies  | Automated simulation runs under varying node density and packet loss.         |
| **Duplicate SOS Reduction**       | $> 90\%$ bandwidth reduction over raw flooding                         | Metric tracking on mesh ingress vs relayed bytes in simulator.                |
| **False-Alarm Rate**              | $< 0.5\%$ of generated alerts                                          | Mandatory 3-second hold confirmation, cancellation window, and trust scoring. |
| **Battery Consumption**           | $< 2.5\%$ battery drain per hour in Survivor Relay mode                | Instrumented Android battery profiler over 12-hour continuous test.           |
| **Cold Storage Boot Time**        | $< 1.2$ seconds to launch SOS screen offline                           | Android App Startup benchmark on budget hardware (e.g. MediaTek Helio G35).   |
