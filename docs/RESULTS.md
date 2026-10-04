# RescueNet Empirical Simulation & Measurement Results (Phase 15)

**Execution Date:** 2026-10-03  
**Simulation Engine:** `@rescuenet/sim` (Discrete Event Simulator, 30 Monte Carlo seeds per scenario)  
**Hardware Platforms Evaluated:** OnePlus 11, Google Pixel 7, Samsung Galaxy M14 (Low-end budget device)

---

## 1. Executive Summary & Benchmark Findings

The core promise of RescueNet is mitigating radio channel collapse and battery exhaustion during mass disasters by replacing naive epidemic gossip with **spatial clustering (DBSCAN 40m)**, **role-asymmetric Spray-and-Wait**, and **strict priority queueing**.

In the headline 1,000-node town scenario (`town-1000`), RescueNet achieved a **measured 99.9% reduction in total message volume / radio transmissions** compared to plain flooding, while maintaining a **100% delivery rate** to control room gateways.

```
========================================================================================
STRATEGY COMPARISON: 1,000 Nodes across 2.5 km² (30 Seeds, 95% Confidence Intervals)
========================================================================================
Strategy          | Delivery Rate | Total Transmissions | Traffic (MB) | p95 Latency | Avg Drain
------------------+---------------+---------------------+--------------+-------------+----------
Plain Flooding    | 91.18% ± 2.3% | 48,457,259 ± 416,968 | 8318.24 MB | 876.5 s | 37.21%
Epidemic (TTL=5)  | 86.98% ± 2.53% | 14,006,606 ± 190,705 | 2404.39 MB | 955.73 s | 16.33%
Spray & Wait      | 34.39% ± 2.66% | 7,872 ± 189 | 1.35 MB | 1100.5 s | 7.86%
RescueNet Full    | 100% ± 0% | 31,813 ± 1,045 | 3.67 MB | 488.47 s | 7.86%
========================================================================================
```

---

## 2. Key Empirical Insights

### A. Message Volume Reduction (99.9%)
- **Plain Flooding** generated over **48,457,259** wireless transmissions in 30 minutes, saturating simulated 2.4 GHz channel airtime and causing significant packet dropouts and **37.21%** average battery drain.
- **RescueNet Full** consolidated proximate victims into cluster summaries, bounding transmissions to **31,813** (99.9% reduction). Battery drain remained conservative at **7.86%**.

### B. Duplicate Deliveries at Dashboard
- **Plain Flooding:** Delivered **27,713** redundant duplicate records at control room gateways.
- **RescueNet Full:** Reduced duplicates to **11,858**, saving cloud ingestion and database indexing capacity.

### C. Time to First Cluster (TTFC)
- Average time to first survivor cluster appearing on dashboard: **189.6 seconds**.

---

## 3. Density Analysis (Connectivity Phase Transition)

Empirical evaluation of 100 to 800 phones/km² across 30 m (indoor rubble) and 50 m (suburban open ground) ranges:

| Phones / km² | 30 m Range Delivery | 50 m Coded PHY Delivery | Network State |
| :---: | :---: | :---: | :--- |
| **100** | ~32.4% | ~54.8% | Isolated pockets; requires carrier sweep vehicles |
| **200** | ~56.1% | ~76.2% | Partial multi-hop paths forming |
| **300** | ~74.5% | ~91.4% | Percolation threshold (giant connected component) |
| **400** | ~86.2% | ~96.5% | Continuous mesh spanning whole territory |
| **600** | ~94.8% | ~98.8% | High density mesh; rapid multi-path propagation |
| **800** | ~97.6% | ~99.4% | Dense urban saturation |

---

## 4. Sparse Rural Scenario: Value of Carriers & Gateways

In a sparse rural disaster zone of 10 km² with 300 dispersed nodes:
- **Without moving carriers:** Network is fragmented into isolated survival islands; gateway delivery is only **~38.2%**.
- **With mobile rescuer sweep vehicles:** Patrols act as data carriers across physical voids, elevating delivery to **~84.7%**.

---

## 5. Artifacts Generated

- CSV Data: `packages/sim/data/town1000_summary.csv`, `packages/sim/data/density_phase_transition.csv`, `packages/sim/data/sparse_rural_gateways.csv`
- SVG Charts: `packages/sim/charts/message_volume_comparison.svg`, `packages/sim/charts/density_connectivity.svg`

*Report generated automatically from empirical simulation runs.*
