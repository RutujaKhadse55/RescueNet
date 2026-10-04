# RescueNet Degraded-Mode Operational Runbook (Phase 16)
## Operating Without Internet in the Tactical Control Room

**Audience:** Incident Commander, Radio Communications Officer, Technical Support Specialists  
**Applicability:** Total wide-area cellular, fiber, and terrestrial Internet failure at Emergency Operations Centre (EOC).

---

## 1. Operating Mode Overview

When wide-area internet goes dark, RescueNet falls back through a 3-tier survivability hierarchy:

```
[Tier 1: Internet Operational]  ──> Fiber / 5G / Broadband (Normal REST + WebSockets)
             │
             ▼
[Tier 2: Satellite Backhaul]   ──> Starlink / Inmarsat BGAN / VSAT Portable Terminal
             │
             ▼
[Tier 3: Total Blackout Mode]  ──> Local Standalone Stack + Hardware GSM Modem + BLE Gateway Mesh
```

In Tier 3, **all communications remain 100% operational locally**:
- Inbound survivor SOS SMS messages arrive via physical GSM USB modem connected to EOC server.
- Outbound acknowledgments (ACKs) and broadcast warnings transmit via GSM modem.
- Rescuers standing within Wi-Fi/Ethernet range of the command post sync directly via local LAN IP (`http://192.168.1.100:3000`).
- Tactical dashboard runs locally off SQLite or on-prem PostGIS Docker stack.

---

## 2. Step-by-Step Degraded Deployment Protocol

### Step 1: Boot Up Standalone Control-Room Server
Connect the ruggedised command post laptop or mini-PC to the battery power station.

```bash
cd /opt/RescueNet/infra
docker compose -f docker-compose.prod.yml up -d
```
All core services (`db`, `pgbouncer`, `api`, `dashboard`, `proxy`) spin up on the local private network `192.168.1.0/24`.

### Step 2: Connect Hardware GSM Modem
1. Insert active BSNL / Airtel SIM card into USB dongle (e.g. Huawei E3372, SIM7600 4G LTE HAT).
2. Connect to USB port. Verify serial port binding:
   ```bash
   dmesg | grep ttyUSB
   # Expected: ttyUSB0 (data), ttyUSB1, ttyUSB2 (AT command interface)
   ```
3. Launch the RescueNet GSM bridge service:
   ```bash
   python3 scripts/gsm_modem_bridge.py --port /dev/ttyUSB2 --api http://localhost:3000/v1/sms/webhook
   ```
4. Verify modem registration:
   ```bash
   # Response:
   # [GSM Bridge] Modem initialized: AT+CPIN? READY
   # [GSM Bridge] Signal quality: +CSQ: 24,99 (~ -65 dBm)
   # [GSM Bridge] Polling inbound SMS messages every 3 seconds...
   ```

### Step 3: Connect Satellite Backhaul (If Available)
If a satellite terminal (Starlink Mini / Inmarsat BGAN) is deployed:
1. Point satellite antenna towards designated orbital azimuth.
2. Connect satellite terminal Ethernet cable to WAN port of the local command post router.
3. API auto-detects route restoration and flushes batched incident synchronizations to state/national disaster cloud:
   ```bash
   curl http://localhost:3000/health
   # Returns: {"status":"ok","uplink":"satellite_operational"}
   ```

### Step 4: Dispatcher Access
Operators connect laptops, rugged tablets, and phones to the local Wi-Fi SSID `RESCUENET_EOC`:
- Open browser: `https://192.168.1.100` (or `https://rescuenet.local`)
- Accept self-signed certificate warning.
- Log in with dispatcher credentials.
- All real-time clusters, homing beacons, and SMS triage updates appear dynamically.

---

## 3. Physical Gateway Drone / Vehicle Sweep Protocol
To extract stranded survivors from deep valleys without cellular or satellite coverage:
1. Mount a dedicated RescueNet gateway handset on a recon vehicle or tethered drone.
2. Vehicle sweeps perimeter roads and high ridgelines at 20–30 km/h.
3. Handset pulls multi-hop clusters from isolated survivor meshes over BLE Coded PHY (up to 100 m range).
4. Upon return to EOC perimeter, gateway phone connects to EOC Wi-Fi and dumps all buffered survivor packets directly to `/v1/uplink`.
