/**
 * RescueNet Discrete-Event Simulator Engine (Phase 15)
 *
 * Runs full network simulation across multi-node topologies,
 * computes 30-seed Monte Carlo statistics, and delivers empirical comparisons.
 */

import {
  SimNode,
  SimPacket,
  ScenarioConfig,
  SimulationStrategy,
  RunMetrics,
  AggregatedMetrics,
} from './models/types';
import { RadioPropagationModel } from './models/radio';
import { MobilityEngine } from './models/mobility';
import { BatteryModel } from './models/battery';
import { StrategyExecutor } from './strategies';

export class SimulationRunner {
  /**
   * Deterministic Linear Congruential Generator (LCG) for reproducible pseudo-random numbers
   */
  private createRng(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Runs a single Monte Carlo seed for a given strategy and scenario.
   */
  public runSingleSeed(
    strategy: SimulationStrategy,
    scenario: ScenarioConfig,
    seed: number
  ): RunMetrics {
    const rng = this.createRng(seed);
    const radio = new RadioPropagationModel(
      scenario.pathLossExponent,
      scenario.shadowingStdDevDb,
      scenario.obstacles
    );
    const mobility = new MobilityEngine(rng);
    const battery = new BatteryModel();
    const strategyExec = new StrategyExecutor(battery);

    // 1. Initialize nodes
    const nodes: SimNode[] = [];
    const gatewayCount = scenario.gatewayCount;
    const rescuerCount = Math.max(2, Math.round(scenario.nodeCount * scenario.rescuerRatio));
    const carrierCount = Math.round(scenario.nodeCount * scenario.carrierRatio);

    for (let i = 0; i < scenario.nodeCount; i++) {
      let role: SimNode['role'] = 'survivor';
      if (i < gatewayCount) {
        role = 'gateway';
      } else if (i < gatewayCount + rescuerCount) {
        role = 'rescuer';
      } else if (i < gatewayCount + rescuerCount + carrierCount) {
        role = 'carrier';
      }

      nodes.push({
        id: `n_${i.toString().padStart(4, '0')}`,
        role,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        waypointX: 0,
        waypointY: 0,
        pauseTimeLeft: 0,
        batteryPercent: 85 + rng() * 15, // 85% to 100% initial charge
        isAlive: true,
        isInSurvivalMode: false,
        packetsGenerated: 0,
        packetsTransmitted: 0,
        packetsReceived: 0,
        bytesTransmitted: 0,
        numericId: i,
        seenPacketIds: new Set<string>(),
        buffer: [],
      });
    }

    mobility.initializePositions(nodes, scenario);

    // 2. Generate initial SOS packets from survivors
    const generatedPackets: SimPacket[] = [];
    nodes.forEach((node) => {
      if (node.role === 'survivor') {
        const pkt: SimPacket = {
          packetId: `sos_${node.id}`,
          originNodeId: node.id,
          originX: node.x,
          originY: node.y,
          createdAtSec: Math.floor(rng() * 30), // Staggered over first 30 seconds
          priority: 80 + Math.floor(rng() * 20),
          sizeBytes: 180, // Binary SOS packet budget
          isClusterSummary: false,
          survivorCount: 1,
        };
        generatedPackets.push(pkt);
        node.packetsGenerated++;
        node.seenPacketIds.add(pkt.packetId);
        node.buffer.push({
          packet: pkt,
          sprayTokens: 8,
          ttlHops: 5,
          hopCount: 0,
        });
      }
    });

    // In RescueNet Full: Cluster adjacent survivors spatially (DBSCAN 40m epsilon)
    if (strategy === 'rescuenet_full') {
      this.applySpatialClustering(nodes);
    }

    // 3. Track metrics
    const deliveredPacketIds = new Set<string>();
    const latenciesSec: number[] = [];
    let totalTransmissions = 0;
    let totalBytesSent = 0;
    let duplicateDeliveries = 0;
    let deliveredSurvivorsCount = 0;
    let timeToFirstCluster = -1;
    const activeContacts = new Map<number, number>();

    // 4. Main time-stepping loop
    const dt = scenario.timeStepSec;
    const steps = Math.floor(scenario.durationSec / dt);

    for (let step = 0; step < steps; step++) {
      const nowSec = step * dt;

      // Advance mobility
      mobility.stepMobility(nodes, scenario, dt);

      // Advance battery discharge
      battery.stepBattery(nodes, dt);

      // Spatial grid partitioning for fast neighbor lookup
      const cellSize = 80; // 80m cell
      const gridCols = Math.ceil(scenario.areaWidthM / cellSize) + 1;
      const grid = new Map<number, SimNode[]>();

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        if (!n.isAlive) continue;
        const cx = Math.max(0, Math.floor(n.x / cellSize));
        const cy = Math.max(0, Math.floor(n.y / cellSize));
        const key = cy * gridCols + cx;
        const list = grid.get(key);
        if (list) {
          list.push(n);
        } else {
          grid.set(key, [n]);
        }
      }

      const neighborOffsets: [number, number][] = [
        [0, 0], // within cell
        [1, 0], // east
        [-1, 1], // southwest
        [0, 1], // south
        [1, 1], // southeast
      ];

      for (const [key, cellNodes] of grid.entries()) {
        const cx = key % gridCols;
        const cy = Math.floor(key / gridCols);

        for (let i = 0; i < cellNodes.length; i++) {
          const nodeA = cellNodes[i]!;

          for (const [ox, oy] of neighborOffsets) {
            const ncx = cx + ox;
            const ncy = cy + oy;
            const neighborKey = ncy * gridCols + ncx;
            const neighborCell = grid.get(neighborKey);
            if (!neighborCell) continue;

            const startIndex = ox === 0 && oy === 0 ? i + 1 : 0;
            for (let j = startIndex; j < neighborCell.length; j++) {
              const nodeB = neighborCell[j]!;

              const dx = Math.abs(nodeA.x - nodeB.x);
              const dy = Math.abs(nodeA.y - nodeB.y);
              if (dx > 70 || dy > 70) continue;

              // Radio propagation check
              const link = radio.computeRssi(nodeA.x, nodeA.y, nodeB.x, nodeB.y, (rng() - 0.5) * 2);
              if (!link.isConnected) continue;

              // Contact encounter session debounce (30s cooldown between redundant peer syncs)
              const pairKey =
                nodeA.numericId < nodeB.numericId
                  ? nodeA.numericId * 100000 + nodeB.numericId
                  : nodeB.numericId * 100000 + nodeA.numericId;
              const lastSync = activeContacts.get(pairKey) ?? -999;
              if (nowSec - lastSync < 30) continue;
              activeContacts.set(pairKey, nowSec);

              // Exchange packets in both directions
              if (nodeA.buffer.length > 0) {
                const res = strategyExec.executeExchange(strategy, nodeA, nodeB, nowSec);
                totalTransmissions += res.transmissions;
                totalBytesSent += res.bytesSent;

                for (const d of res.gatewayDeliveries) {
                  if (deliveredPacketIds.has(d.packet.packetId)) {
                    duplicateDeliveries++;
                  } else {
                    deliveredPacketIds.add(d.packet.packetId);
                    deliveredSurvivorsCount += d.packet.survivorCount || 1;
                    const lat = Math.max(1, nowSec - d.packet.createdAtSec);
                    latenciesSec.push(lat);
                    if (timeToFirstCluster < 0) {
                      timeToFirstCluster = nowSec;
                    }
                  }
                }
              }

              if (nodeB.buffer.length > 0) {
                const res = strategyExec.executeExchange(strategy, nodeB, nodeA, nowSec);
                totalTransmissions += res.transmissions;
                totalBytesSent += res.bytesSent;

                for (const d of res.gatewayDeliveries) {
                  if (deliveredPacketIds.has(d.packet.packetId)) {
                    duplicateDeliveries++;
                  } else {
                    deliveredPacketIds.add(d.packet.packetId);
                    deliveredSurvivorsCount += d.packet.survivorCount || 1;
                    const lat = Math.max(1, nowSec - d.packet.createdAtSec);
                    latenciesSec.push(lat);
                    if (timeToFirstCluster < 0) {
                      timeToFirstCluster = nowSec;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 5. Compute summary statistics
    latenciesSec.sort((a, b) => a - b);
    const medianLatency = latenciesSec.length > 0 ? latenciesSec[Math.floor(latenciesSec.length * 0.5)]! : 0;
    const p95Latency = latenciesSec.length > 0 ? latenciesSec[Math.floor(latenciesSec.length * 0.95)]! : 0;

    let totalBatteryDrain = 0;
    let livingNodeCount = 0;
    nodes.forEach((n) => {
      if (n.role !== 'gateway') {
        livingNodeCount++;
        totalBatteryDrain += 100 - n.batteryPercent;
      }
    });

    const totalSurvivors = nodes.filter((n) => n.role === 'survivor').length;
    const deliveryRate = totalSurvivors > 0
      ? Math.min(100, (deliveredSurvivorsCount / totalSurvivors) * 100)
      : 0;

    return {
      strategy,
      seed,
      totalGenerated: totalSurvivors,
      deliveredToGateway: deliveredSurvivorsCount,
      deliveryRatePercent: Math.round(deliveryRate * 10) / 10,
      deliveryLatencyMedianSec: medianLatency,
      deliveryLatencyP95Sec: p95Latency,
      totalTransmissions,
      totalBytesSentMb: Math.round((totalBytesSent / (1024 * 1024)) * 100) / 100,
      avgBatteryDrainPercent: Math.round((totalBatteryDrain / (livingNodeCount || 1)) * 10) / 10,
      duplicateDeliveriesAtGateway: duplicateDeliveries,
      timeToFirstClusterSec: timeToFirstCluster > 0 ? timeToFirstCluster : scenario.durationSec,
    };
  }

  /**
   * Applies spatial clustering (DBSCAN 40m epsilon) to consolidate adjacent survivor records
   */
  private applySpatialClustering(nodes: SimNode[]): void {
    const EPS_METERS = 40;
    const survivors = nodes.filter((n) => n.role === 'survivor' && n.buffer.length > 0);

    const visited = new Set<string>();
    const clusters: SimNode[][] = [];

    for (const survivor of survivors) {
      if (visited.has(survivor.id)) continue;
      visited.add(survivor.id);

      const cluster: SimNode[] = [survivor];
      for (const other of survivors) {
        if (other.id === survivor.id) continue;
        const dist = Math.sqrt(
          (survivor.x - other.x) * (survivor.x - other.x) +
          (survivor.y - other.y) * (survivor.y - other.y)
        );
        if (dist <= EPS_METERS) {
          visited.add(other.id);
          cluster.push(other);
        }
      }
      clusters.push(cluster);
    }

    // In each cluster with >= 2 members, consolidate into a single CLUSTER_SUMMARY packet
    for (const cluster of clusters) {
      if (cluster.length >= 2) {
        const lead = cluster[0]!;
        const totalPeople = cluster.length;
        const summaryPacket: SimPacket = {
          packetId: `cl_${lead.id}_${cluster.length}`,
          originNodeId: lead.id,
          originX: lead.x,
          originY: lead.y,
          createdAtSec: lead.buffer[0]?.packet.createdAtSec || 0,
          priority: 95, // High priority for multi-person clusters
          sizeBytes: 120, // Compact cluster summary
          isClusterSummary: true,
          survivorCount: totalPeople,
        };

        // Lead holds cluster summary; others defer individual packets to save radio volume
        lead.seenPacketIds = new Set([summaryPacket.packetId]);
        lead.buffer = [
          {
            packet: summaryPacket,
            sprayTokens: 16, // Multi-token spray for cluster discovery
            ttlHops: 6,
            hopCount: 0,
          },
        ];

        for (let i = 1; i < cluster.length; i++) {
          cluster[i]!.buffer = []; // Suppress individual redundant flood
          cluster[i]!.seenPacketIds.clear();
        }
      }
    }
  }

  /**
   * Executes 30 seeds and calculates Mean and 95% Confidence Intervals
   */
  public runBatch(
    strategy: SimulationStrategy,
    scenario: ScenarioConfig,
    numSeeds: number = 30
  ): { runs: RunMetrics[]; summary: AggregatedMetrics } {
    const runs: RunMetrics[] = [];

    for (let seed = 1; seed <= numSeeds; seed++) {
      const run = this.runSingleSeed(strategy, scenario, seed);
      runs.push(run);
    }

    const calcMeanCi = (values: number[]) => {
      const n = values.length;
      if (n === 0) return { mean: 0, ci95: 0 };
      const mean = values.reduce((acc, v) => acc + v, 0) / n;
      const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (n - 1 || 1);
      const stdDev = Math.sqrt(variance);
      const ci95 = 1.96 * (stdDev / Math.sqrt(n));
      return {
        mean: Math.round(mean * 100) / 100,
        ci95: Math.round(ci95 * 100) / 100,
      };
    };

    const summary: AggregatedMetrics = {
      strategy,
      runs: numSeeds,
      deliveryRate: calcMeanCi(runs.map((r) => r.deliveryRatePercent)),
      latencyMedian: calcMeanCi(runs.map((r) => r.deliveryLatencyMedianSec)),
      latencyP95: calcMeanCi(runs.map((r) => r.deliveryLatencyP95Sec)),
      transmissions: calcMeanCi(runs.map((r) => r.totalTransmissions)),
      bytesSentMb: calcMeanCi(runs.map((r) => r.totalBytesSentMb)),
      batteryDrainPercent: calcMeanCi(runs.map((r) => r.avgBatteryDrainPercent)),
      duplicateDeliveries: calcMeanCi(runs.map((r) => r.duplicateDeliveriesAtGateway)),
      timeToFirstCluster: calcMeanCi(runs.map((r) => r.timeToFirstClusterSec)),
    };

    return { runs, summary };
  }
}
