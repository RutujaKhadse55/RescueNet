/**
 * RescueNet Simulation Types & Parameter Definitions (Phase 15)
 */

export type SimulationStrategy =
  | 'plain_flooding'
  | 'epidemic_ttl'
  | 'spray_and_wait'
  | 'rescuenet_full';

export type NodeRole = 'survivor' | 'carrier' | 'rescuer' | 'gateway';

export interface SimNode {
  id: string;
  role: NodeRole;
  x: number;
  y: number;
  vx: number;
  vy: number;
  waypointX: number;
  waypointY: number;
  pauseTimeLeft: number;
  batteryPercent: number; // 0.0 to 100.0
  isAlive: boolean;
  isInSurvivalMode: boolean;
  packetsGenerated: number;
  packetsTransmitted: number;
  packetsReceived: number;
  bytesTransmitted: number;
  numericId: number;
  seenPacketIds: Set<string>;
  // Local queue of packets waiting for contact
  buffer: SimPacketCopy[];
}

export interface SimPacket {
  packetId: string;
  originNodeId: string;
  originX: number;
  originY: number;
  createdAtSec: number;
  priority: number;
  sizeBytes: number;
  isClusterSummary: boolean;
  survivorCount: number;
}

export interface SimPacketCopy {
  packet: SimPacket;
  sprayTokens: number;
  ttlHops: number;
  hopCount: number;
}

export interface Obstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  attenuationDb: number;
}

export interface ScenarioConfig {
  name: string;
  nodeCount: number;
  areaWidthM: number;
  areaHeightM: number;
  durationSec: number;
  timeStepSec: number;
  survivorRatio: number;
  carrierRatio: number;
  rescuerRatio: number;
  gatewayCount: number;
  defaultBleRangeM: number;
  pathLossExponent: number; // e.g. 2.4 open, 3.6 urban
  shadowingStdDevDb: number;
  obstacles: Obstacle[];
  failureRatePerHour: number;
}

export interface RunMetrics {
  strategy: SimulationStrategy;
  seed: number;
  totalGenerated: number;
  deliveredToGateway: number;
  deliveryRatePercent: number;
  deliveryLatencyMedianSec: number;
  deliveryLatencyP95Sec: number;
  totalTransmissions: number;
  totalBytesSentMb: number;
  avgBatteryDrainPercent: number;
  duplicateDeliveriesAtGateway: number;
  timeToFirstClusterSec: number;
}

export interface AggregatedMetrics {
  strategy: SimulationStrategy;
  runs: number;
  deliveryRate: { mean: number; ci95: number };
  latencyMedian: { mean: number; ci95: number };
  latencyP95: { mean: number; ci95: number };
  transmissions: { mean: number; ci95: number };
  bytesSentMb: { mean: number; ci95: number };
  batteryDrainPercent: { mean: number; ci95: number };
  duplicateDeliveries: { mean: number; ci95: number };
  timeToFirstCluster: { mean: number; ci95: number };
}
