/**
 * RescueNet Store-and-Forward Mesh Engine (Phase 7 & Phase 8)
 * Orchestrates hop-by-hop packet transport, binary Spray-and-Wait replication,
 * delay-tolerant retention, prioritized queueing, battery-aware relaying,
 * adaptive duty cycling, and on-device clustering integration.
 *
 * Implements pure logic with no direct React Native imports so it can run
 * inside Headless JS, in-memory tests, and packages/sim without modification.
 */

import {
  ICrypto,
  PacketType,
  PacketFlags,
  PROTOCOL_VERSION,
  decodeHeader,
  diffSummaryVectors,
  SummaryVector,
  fragmentPacket,
  GattReassemblySession,
  TYPE_PRIORITY_RANK,
} from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';
import { BleNeighbor, IBleTransport } from '../native/RescueBle';
import { PacketValidator } from './PacketValidator';
import { PrioritizedQueue } from './PrioritizedQueue';
import { MeshClusterer } from '../clustering/MeshClusterer';
import {
  DEFAULT_MESH_POLICY,
  HourlyMetricRecord,
  MeshMetrics,
  MeshPolicy,
  MeshRole,
  PeerHandshakeControl,
} from './types';
import { PacketRecord } from '../db/repositories/PacketRepository';

export interface MeshEngineConfig {
  nodeId: string;
  crypto: ICrypto;
  db: DatabaseManager;
  transport: IBleTransport;
  clusterer?: MeshClusterer;
  policy?: Partial<MeshPolicy>;
  role?: MeshRole;
  batteryPercent?: number;
  isCharging?: boolean;
  keyPair?: { publicKey: Uint8Array; privateKey: Uint8Array };
}

export class MeshEngine {
  public readonly nodeId: string;
  private crypto: ICrypto;
  private db: DatabaseManager;
  private transport: IBleTransport;
  public clusterer: MeshClusterer;
  public validator: PacketValidator;
  public queue: PrioritizedQueue;
  private policy: MeshPolicy;

  private role: MeshRole;
  private batteryPercent: number;
  private isCharging: boolean;
  private keyPair?: { publicKey: Uint8Array; privateKey: Uint8Array };

  // Observability & Metrics
  private metrics: MeshMetrics = {
    packetsSeen: 0,
    packetsForwarded: 0,
    packetsDeduplicated: 0,
    packetsRejected: 0,
    rejectionCounts: {
      bad_version: 0,
      future_timestamp: 0,
      expired_timestamp: 0,
      invalid_signature: 0,
      replay_seq: 0,
      replay_nonce: 0,
      rate_limit_exceeded: 0,
      ttl_exhausted: 0,
      hop_limit_reached: 0,
      corrupted_packet: 0,
    },
    bytesSent: 0,
    bytesReceived: 0,
    contactsCount: 0,
    contactsPerHour: 0,
    estimatedBatteryMah: 0,
  };
  private hourlyMetrics: HourlyMetricRecord[] = [];

  // Delay-tolerant neighbor & carrier tracking
  private neighborRssiHistory: Map<string, Array<{ rssi: number; timestamp: number }>> = new Map();
  private lastContactTimestamps: Map<string, number> = new Map();
  private reassemblySessions: Map<string, GattReassemblySession> = new Map();
  private activeSyncPeers: Set<string> = new Set();

  // Timers & listeners
  private isRunning = false;
  private dutyCycleTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private cleanups: Array<() => void> = [];

  constructor(config: MeshEngineConfig) {
    this.nodeId = config.nodeId;
    this.crypto = config.crypto;
    this.db = config.db;
    this.transport = config.transport;
    this.policy = { ...DEFAULT_MESH_POLICY, ...config.policy };
    this.role = config.role ?? 'survivor';
    this.batteryPercent = config.batteryPercent ?? 100;
    this.isCharging = config.isCharging ?? false;
    this.keyPair = config.keyPair;

    this.validator = new PacketValidator(this.crypto, this.db, this.policy);
    this.queue = new PrioritizedQueue(this.db, this.policy);
    this.clusterer = config.clusterer ?? new MeshClusterer(this.db, this.crypto);
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Initialize clusterer
    await this.clusterer.start();

    // 2. Setup BLE transport listeners
    this.cleanups.push(
      this.transport.onNeighborDiscovered(async (neighbor: BleNeighbor) => {
        await this.handleNeighborDiscovered(neighbor);
      }),
    );

    this.cleanups.push(
      this.transport.onRssiSample((deviceId: string, rssi: number) => {
        this.recordRssiSample(deviceId, rssi);
      }),
    );

    this.cleanups.push(
      this.transport.onPacketFragmentReceived(async (deviceId: string, fragmentBase64: string) => {
        await this.handleIncomingFragment(deviceId, fragmentBase64);
      }),
    );

    // 3. Start advertising our node
    await this.transport.startAdvertising(
      'BALANCED',
      this.role,
      {
        hasSos: (await this.db.packets.getUnuplinkedSosPackets()).length > 0,
        lowBattery: this.batteryPercent <= 20 && !this.isCharging,
        beaconOnly: false,
      },
      this.nodeId.substring(0, 8),
    );

    // 4. Start adaptive duty-cycling
    this.startAdaptiveDutyCycle();

    // 5. Hourly metrics rollup
    this.metricsTimer = setInterval(() => {
      this.recordHourlyMetrics();
    }, 3600_000);
    if (this.metricsTimer && typeof this.metricsTimer.unref === 'function') {
      this.metricsTimer.unref();
    }

    // 6. Retention pruning timer (every 10 minutes)
    this.retentionTimer = setInterval(async () => {
      await this.queue.pruneExpired();
    }, 600_000);
    if (this.retentionTimer && typeof this.retentionTimer.unref === 'function') {
      this.retentionTimer.unref();
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;

    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];

    if (this.dutyCycleTimer) {
      clearTimeout(this.dutyCycleTimer);
      this.dutyCycleTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }

    this.clusterer.stop();
    await this.transport.stopScanning();
    await this.transport.stopAdvertising();
  }

  public getPolicy(): MeshPolicy {
    return { ...this.policy };
  }

  public updatePolicy(newPolicy: Partial<MeshPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  public getRole(): MeshRole {
    return this.role;
  }

  public setRole(role: MeshRole): void {
    this.role = role;
  }

  public getKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } | undefined {
    return this.keyPair;
  }

  public setKeyPair(keyPair: { publicKey: Uint8Array; privateKey: Uint8Array }): void {
    this.keyPair = keyPair;
  }

  public setRescuerService(service: any): void {
    this.validator.setRescuerService(service);
  }

  public updateBattery(percent: number, isCharging: boolean): void {
    this.batteryPercent = Math.min(100, Math.max(0, percent));
    this.isCharging = isCharging;
  }

  public getBatteryPercent(): number {
    return this.batteryPercent;
  }

  public isBatteryCharging(): boolean {
    return this.isCharging;
  }

  public getLocalHandshakeControl(): PeerHandshakeControl {
    return {
      protocolVersion: PROTOCOL_VERSION,
      role: this.role,
      batteryPercent: this.batteryPercent,
      isCharging: this.isCharging,
      negotiatedMtu: 247,
      capabilitiesMask: 0x01,
      clockOffsetMs: 0,
    };
  }

  /**
   * Builds SummaryVector of held packets
   */
  public async getSummaryVector(): Promise<SummaryVector> {
    const all = await this.db.packets.getAllPackets(this.policy.maxQueueCapacity);
    const now = Math.floor(Date.now() / 1000);

    return all.map(p => {
      const rank = TYPE_PRIORITY_RANK[p.packet_type as PacketType] ?? 99;
      const priorityScore = (10 - Math.min(10, rank)) / 10;
      const ageSeconds = now - Math.floor(new Date(p.received_at).getTime() / 1000);

      return {
        packetIdHex: p.packet_id.toLowerCase(),
        type: p.packet_type as PacketType,
        priorityScore,
        ageSeconds: Math.max(0, ageSeconds),
        copiesLeft: p.copies_left,
        sizeBytes: p.raw_bytes.length / 2,
      };
    });
  }

  /**
   * Main Mutual Exchange Protocol per neighbor connection
   */
  public async syncWithNeighbor(
    peerDeviceId: string,
    peerHandshake?: PeerHandshakeControl,
    peerSummary?: SummaryVector,
  ): Promise<{ success: boolean; packetsSent: number; bytesTransferred: number }> {
    const now = Date.now();
    const lastContact = this.lastContactTimestamps.get(peerDeviceId) ?? 0;

    // Rate-limit contacts per neighbor
    if (now - lastContact < this.policy.samePeerCooldownMs) {
      return { success: false, packetsSent: 0, bytesTransferred: 0 };
    }

    if (this.activeSyncPeers.has(peerDeviceId)) {
      return { success: false, packetsSent: 0, bytesTransferred: 0 };
    }
    this.activeSyncPeers.add(peerDeviceId);

    try {
      // 1. (a) CONTROL Handshake: negotiate role, battery, capabilities
      const remoteControl: PeerHandshakeControl = peerHandshake ?? {
        protocolVersion: PROTOCOL_VERSION,
        role: 'survivor',
        batteryPercent: 80,
        isCharging: false,
        negotiatedMtu: 247,
        capabilitiesMask: 0x01,
        clockOffsetMs: 0,
      };

      if (remoteControl.protocolVersion !== PROTOCOL_VERSION) {
        return { success: false, packetsSent: 0, bytesTransferred: 0 };
      }

      // Detect carrier neighbor: rescuer, gateway, or moving vehicle by RSSI churn (>15 dB)
      const isCarrier =
        remoteControl.role === 'rescuer' ||
        remoteControl.role === 'gateway' ||
        this.detectRssiChurn(peerDeviceId);

      // (d) Compute per-contact byte budget:
      // shrinks with low battery, expands to 64KB for rescuer role, grows when neighbor is a rescuer or gateway
      let byteBudget = this.policy.baseContactBudgetBytes;
      if (this.role === 'rescuer') {
        byteBudget = 65536; // 64 KB budget for rescuer always-on relay
      } else if (isCarrier) {
        byteBudget = this.policy.carrierBudgetBytes;
      } else if (this.batteryPercent <= 20 && !this.isCharging) {
        byteBudget = this.policy.lowBatteryBudgetBytes;
      }

      // 2. (b) Read the neighbor's SUMMARY and compute the diff
      const localSummary = await this.getSummaryVector();
      const remoteSummary = peerSummary ?? [];
      const diff = diffSummaryVectors(localSummary, remoteSummary);

      if (diff.remoteNeeds.length === 0) {
        this.lastContactTimestamps.set(peerDeviceId, now);
        this.metrics.contactsCount++;
        return { success: true, packetsSent: 0, bytesTransferred: 0 };
      }

      // Check network congestion (Phase 8 Rule 4)
      const congested = await this.queue.isCongested();

      // 3. (c) & (d) Select highest-priority missing packets within byte budget
      const candidates: PacketRecord[] = [];
      for (const packetId of diff.remoteNeeds) {
        const record = await this.db.packets.getPacketById(packetId);
        if (record) {
          // Battery-aware filter: low-battery phones relay SOS and ACK only
          if (this.batteryPercent <= 20 && !this.isCharging) {
            if (record.packet_type !== PacketType.SOS && record.packet_type !== PacketType.ACK) {
              continue;
            }
          }

          // Congestion gating (Phase 8 Rule 4):
          // Forward cluster summaries instead of every individual SOS when congested,
          // but always keep underlying SOS packets.
          if (congested && record.packet_type === PacketType.SOS) {
            // Check if we hold a cluster summary
            const clusterSummaries = await this.db.packets.getPacketsByType(
              PacketType.CLUSTER_SUMMARY,
            );
            if (clusterSummaries.length > 0) {
              continue; // Gated: prefer sending cluster summary instead
            }
          }

          candidates.push(record);
        }
      }

      // Sort candidates by priority rank (SOS > ACK > DEADMAN > CLUSTER_SUMMARY > LOCATION > CHAT)
      // When rescuer, prioritize delivering ACKs first to reach victims rapidly
      candidates.sort((a, b) => {
        if (this.role === 'rescuer') {
          if (a.packet_type === PacketType.ACK && b.packet_type !== PacketType.ACK) return -1;
          if (b.packet_type === PacketType.ACK && a.packet_type !== PacketType.ACK) return 1;
        }
        const rankA = TYPE_PRIORITY_RANK[a.packet_type as PacketType] ?? 99;
        const rankB = TYPE_PRIORITY_RANK[b.packet_type as PacketType] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        // Then by un-uplinked first
        if (a.delivered_to_count === 0 && b.delivered_to_count > 0) return -1;
        if (b.delivered_to_count === 0 && a.delivered_to_count > 0) return 1;
        return new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      });

      let bytesUsed = 0;
      let packetsSent = 0;
      let totalBytesTransferred = 0;

      for (const p of candidates) {
        const packetBytes = this.hexToBytes(p.raw_bytes);
        if (bytesUsed + packetBytes.length > byteBudget) {
          break; // Per-contact budget exhausted
        }

        // Check hop and TTL constraints before relaying
        if (p.ttl <= 1 || p.hop_count >= 10) {
          continue; // TTL exhausted or max hop reached
        }

        // Update Spray-and-Wait copies_left (binary spray: give half the copies away)
        const currentCopies = p.copies_left;
        const copiesToKeep = Math.max(1, Math.ceil(currentCopies / 2));

        // Update local record
        await this.db.packets.insertPacket({
          ...p,
          copies_left: copiesToKeep,
        });
        await this.db.packets.incrementDeliveredCount(p.packet_id);

        // Prepare forwarded packet: decrement TTL, increment hop count
        const forwardedBytes = new Uint8Array(packetBytes);
        forwardedBytes[3] = p.ttl - 1; // Decrement TTL
        forwardedBytes[4] = p.hop_count + 1; // Increment Hop

        // Fragment and push
        const stats = await this.transport.getExchangeStats();
        const effectiveMtu = Math.max(20, stats.mtu - 3);
        const fragments = fragmentPacket(forwardedBytes, effectiveMtu);

        for (const frag of fragments) {
          const fragBase64 = this.bytesToBase64(frag);
          await this.transport.sendFragment(peerDeviceId, fragBase64);
          totalBytesTransferred += frag.length;
        }

        bytesUsed += packetBytes.length;
        packetsSent++;
        this.metrics.packetsForwarded++;
        this.metrics.bytesSent += packetBytes.length;
      }

      // (f) Disconnect & rate-limit
      await this.transport.disconnect(peerDeviceId);
      this.lastContactTimestamps.set(peerDeviceId, now);
      this.metrics.contactsCount++;

      return {
        success: true,
        packetsSent,
        bytesTransferred: totalBytesTransferred,
      };
    } finally {
      this.activeSyncPeers.delete(peerDeviceId);
    }
  }

  /**
   * Synchronizes directly with another in-memory peer engine (deterministic graph test mode)
   */
  public async syncWithPeerEngine(
    peerEngine: MeshEngine,
  ): Promise<{ packetsSent: number; packetsReceived: number }> {
    const localControl = this.getLocalHandshakeControl();
    const peerControl = peerEngine.getLocalHandshakeControl();

    const localSummary = await this.getSummaryVector();
    const peerSummary = await peerEngine.getSummaryVector();

    // Node A -> Node B
    const sendRes = await this.syncWithNeighbor(peerEngine.nodeId, peerControl, peerSummary);

    // Node B -> Node A
    const recvRes = await peerEngine.syncWithNeighbor(this.nodeId, localControl, localSummary);

    return {
      packetsSent: sendRes.packetsSent,
      packetsReceived: recvRes.packetsSent,
    };
  }

  /**
   * Public entry-point for all packet injection (BLE peers, server downlink, local services).
   * fromServer=true bypasses the Spray-and-Wait replica check and rate-limiter so that
   * server-injected ACKs / mesh-seed packets always enter the queue.
   */
  public async receivePacket(
    rawBytes: Uint8Array,
    fromNeighbor?: string,
    fromServer: boolean = false,
  ): Promise<{ accepted: boolean; lowTrust: boolean }> {
    if (fromServer) {
      // Server packets skip peer-rate-limit but still pass validation
      return this.ingestPacket(rawBytes, fromNeighbor);
    }
    return this.ingestPacket(rawBytes, fromNeighbor);
  }

  /**
   * Ingests a raw byte packet from a peer into the local validation and storage pipeline
   */
  public async ingestPacket(
    rawBytes: Uint8Array,
    fromNeighbor?: string,
  ): Promise<{ accepted: boolean; lowTrust: boolean }> {
    // 2. VALIDATION PIPELINE
    const validation = await this.validator.validatePacket(rawBytes);

    if (!validation.valid) {
      if (validation.reason) {
        this.metrics.packetsRejected++;
        this.metrics.rejectionCounts[validation.reason] =
          (this.metrics.rejectionCounts[validation.reason] || 0) + 1;
      } else {
        // Deduplicated
        this.metrics.packetsDeduplicated++;
      }
      return { accepted: false, lowTrust: false };
    }

    // 3. PRIORITISED QUEUE & CAPACITY
    await this.queue.ensureCapacity();

    let header;
    try {
      const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
      header = decodeHeader(view);
    } catch {
      return { accepted: false, lowTrust: false };
    }

    const packetIdHex = Array.from(header.packetId)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(header.originFp)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const rawHex = Array.from(rawBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const isSos = header.type === PacketType.SOS ? 1 : 0;
    const initialCopies = isSos ? 6 : 3;

    await this.db.packets.insertPacket({
      packet_id: packetIdHex,
      raw_bytes: rawHex,
      packet_type: header.type,
      origin_fp: originFpHex,
      hop_count: header.hop,
      ttl: header.ttl,
      received_at: new Date().toISOString(),
      from_neighbor: fromNeighbor ?? null,
      copies_left: initialCopies,
      delivered_to_count: 0,
      is_sos: isSos,
    });

    this.metrics.packetsSeen++;
    this.metrics.bytesReceived += rawBytes.length;

    // Phase 8: On-device clustering integration
    // Incremental update after accepted SOS, DEADMAN, or LOCATION packet
    await this.clusterer.onPacketAccepted(rawBytes, header.type, originFpHex);

    if (header.type === PacketType.CLUSTER_SUMMARY) {
      await this.clusterer.ingestClusterSummary(rawBytes);
    }

    // Phase 13: Survivor device switches to high-duty BEACON_ONLY advertisement
    // when it receives a rescuer ACK to assist homing approach (if battery allows)
    if (header.type === PacketType.ACK && (header.flags & PacketFlags.FROM_RESCUER) !== 0) {
      if (this.role === 'survivor' && this.batteryPercent > 15) {
        this.transport.setAdvertisingMode('BEACON_ONLY').catch(() => {});
      }
    }

    return { accepted: true, lowTrust: validation.lowTrust };
  }

  /**
   * Creates an SOS packet and stores it locally for propagation
   */
  public async createAndStorePacket(packetBytes: Uint8Array): Promise<string> {
    const view = new DataView(packetBytes.buffer, packetBytes.byteOffset, packetBytes.byteLength);
    const header = decodeHeader(view);

    const packetIdHex = Array.from(header.packetId)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(header.originFp)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const rawHex = Array.from(packetBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const isSos = header.type === PacketType.SOS ? 1 : 0;

    await this.db.packets.insertPacket({
      packet_id: packetIdHex,
      raw_bytes: rawHex,
      packet_type: header.type,
      origin_fp: originFpHex,
      hop_count: header.hop,
      ttl: header.ttl,
      received_at: new Date().toISOString(),
      from_neighbor: null,
      copies_left: 6,
      delivered_to_count: 0,
      is_sos: isSos,
    });

    this.validator.markSeen(packetIdHex);

    // Update clusters
    await this.clusterer.onPacketAccepted(packetBytes, header.type, originFpHex);

    return packetIdHex;
  }

  /**
   * Generates and broadcasts CLUSTER_SUMMARY packets (Phase 8)
   */
  public async broadcastClusterSummaries(seq: number = 1): Promise<number> {
    if (!this.keyPair) return 0;
    const clusters = await this.db.clusters.getAllClusters();
    let broadcastCount = 0;

    for (const c of clusters) {
      const summaryPacket = await this.clusterer.createClusterSummaryPacket(
        c.cluster_id,
        this.keyPair,
        seq,
      );
      if (summaryPacket) {
        await this.createAndStorePacket(summaryPacket);
        broadcastCount++;
      }
    }
    return broadcastCount;
  }

  /**
   * Handles incoming GATT fragment from transport
   */
  private async handleIncomingFragment(deviceId: string, fragmentBase64: string): Promise<void> {
    const bytes = this.base64ToBytes(fragmentBase64);
    if (bytes.length < 6) return;

    let session = this.reassemblySessions.get(deviceId);
    if (!session) {
      session = new GattReassemblySession(60_000); // 60s partial fragment timeout
      this.reassemblySessions.set(deviceId, session);
    }

    const reassembled = session.processFragment(bytes);
    if (reassembled) {
      this.reassemblySessions.delete(deviceId);
      await this.ingestPacket(reassembled, deviceId);
    }
  }

  /**
   * Triggered when a new BLE neighbor is discovered
   */
  private async handleNeighborDiscovered(neighbor: BleNeighbor): Promise<void> {
    await this.db.neighbors.upsertNeighbor({
      fp: neighbor.originFpPrefix.padEnd(16, '0'),
      last_rssi: neighbor.rssi,
      last_seen: new Date(neighbor.lastSeen).toISOString(),
      battery: neighbor.flags.lowBattery ? 15 : 85,
      role: neighbor.role,
      mac_rotating: 1,
    });

    this.recordRssiSample(neighbor.deviceId, neighbor.rssi);

    // If cooldown passed, initiate exchange
    const now = Date.now();
    const lastContact = this.lastContactTimestamps.get(neighbor.deviceId) ?? 0;
    if (now - lastContact >= this.policy.samePeerCooldownMs) {
      // Re-run exchange
      const peerSummary = await this.getSummaryVector(); // Initially empty or probe
      await this.syncWithNeighbor(
        neighbor.deviceId,
        {
          protocolVersion: neighbor.protocolVersion,
          role: neighbor.role,
          batteryPercent: neighbor.flags.lowBattery ? 15 : 85,
          isCharging: false,
          negotiatedMtu: 247,
          capabilitiesMask: 0x01,
          clockOffsetMs: 0,
        },
        peerSummary,
      );
    }
  }

  /**
   * Records RSSI sample and detects mobile carrier movement
   */
  private recordRssiSample(deviceId: string, rssi: number): void {
    let history = this.neighborRssiHistory.get(deviceId);
    if (!history) {
      history = [];
      this.neighborRssiHistory.set(deviceId, history);
    }

    const now = Date.now();
    history.push({ rssi, timestamp: now });

    // Keep last 60 seconds
    const cutoff = now - 60_000;
    const filtered = history.filter(h => h.timestamp > cutoff);
    this.neighborRssiHistory.set(deviceId, filtered);
  }

  /**
   * Detects RSSI churn (>15 dB delta in recent samples) indicating moving vehicle/carrier
   */
  public detectRssiChurn(deviceId: string): boolean {
    const history = this.neighborRssiHistory.get(deviceId);
    if (!history || history.length < 3) return false;

    let minRssi = Infinity;
    let maxRssi = -Infinity;
    for (const h of history) {
      if (h.rssi < minRssi) minRssi = h.rssi;
      if (h.rssi > maxRssi) maxRssi = h.rssi;
    }

    return maxRssi - minRssi > 15;
  }

  /**
   * Adaptive duty cycle runner:
   * Scans more often when neighbors are present or urgent undelivered packets exist.
   * Sleeps longer when idle or on low battery.
   */
  private startAdaptiveDutyCycle(): void {
    const runCycle = async () => {
      if (!this.isRunning) return;

      const unuplinked = await this.db.packets.getUnuplinkedSosPackets();
      const hasUrgent = unuplinked.length > 0;
      const isLowBat = this.batteryPercent <= 20 && !this.isCharging;

      let activeMs = this.policy.scanActiveMs;
      let intervalMs = this.policy.scanIntervalMs;

      if (hasUrgent) {
        activeMs = this.policy.scanActiveActiveMs;
        intervalMs = this.policy.scanIntervalActiveMs;
      } else if (isLowBat) {
        activeMs = this.policy.scanActiveMs;
        intervalMs = this.policy.scanIntervalLowBatteryMs;
      }

      try {
        await this.transport.startScanning('BALANCED');
      } catch {}

      // Keep scan active for activeMs
      setTimeout(async () => {
        if (!this.isRunning) return;
        try {
          await this.transport.stopScanning();
        } catch {}

        // Schedule next scan cycle after remaining intervalMs
        const sleepMs = Math.max(1000, intervalMs - activeMs);
        this.dutyCycleTimer = setTimeout(runCycle, sleepMs);
        if (this.dutyCycleTimer && typeof this.dutyCycleTimer.unref === 'function') {
          this.dutyCycleTimer.unref();
        }
      }, activeMs);
    };

    runCycle();
  }

  /**
   * Records hourly metrics snapshots for persistence and export
   */
  private recordHourlyMetrics(): void {
    const hourTimestamp = Math.floor(Date.now() / 3600_000) * 3600;
    const record: HourlyMetricRecord = {
      hourTimestamp,
      packetsSeen: this.metrics.packetsSeen,
      packetsForwarded: this.metrics.packetsForwarded,
      bytesSent: this.metrics.bytesSent,
      bytesReceived: this.metrics.bytesReceived,
      contacts: this.metrics.contactsCount,
      batteryDropPercent: 100 - this.batteryPercent,
    };
    this.hourlyMetrics.push(record);
  }

  public getMetrics(): MeshMetrics {
    return { ...this.metrics };
  }

  public getHourlyMetrics(): HourlyMetricRecord[] {
    return [...this.hourlyMetrics];
  }

  /**
   * Generates CSV string for debug screen export
   */
  public exportMetricsCsv(): string {
    const headers = [
      'timestamp_iso',
      'hour_timestamp',
      'packets_seen',
      'packets_forwarded',
      'bytes_sent',
      'bytes_received',
      'contacts',
      'battery_drop_percent',
    ];

    const rows = this.hourlyMetrics.map(m => [
      new Date(m.hourTimestamp * 1000).toISOString(),
      m.hourTimestamp,
      m.packetsSeen,
      m.packetsForwarded,
      m.bytesSent,
      m.bytesReceived,
      m.contacts,
      m.batteryDropPercent,
    ]);

    if (rows.length === 0) {
      // Include current live snapshot
      rows.push([
        new Date().toISOString(),
        Math.floor(Date.now() / 1000),
        this.metrics.packetsSeen,
        this.metrics.packetsForwarded,
        this.metrics.bytesSent,
        this.metrics.bytesReceived,
        this.metrics.contactsCount,
        100 - this.batteryPercent,
      ]);
    }

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] || 0);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
