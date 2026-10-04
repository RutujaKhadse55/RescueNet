/**
 * RescueNet On-Device Clustering Engine (Phase 8)
 * Incrementally consolidates SOS/DEADMAN/LOCATION telemetry into spatial clusters,
 * runs periodic DBSCAN re-clustering, and handles split/merge transitions.
 */

import {
  ClusterMember,
  ClusterRecord as CoreClusterRecord,
  dbscanClustering,
  IncrementalClusterer,
  DEFAULT_CLUSTER_EPS_METERS,
  splitCluster,
  createAndSignClusterSummary,
  decodeClusterSummary,
  decodeSos,
  decodeDeadman,
  decodeLocation,
  PacketType,
  ICrypto,
} from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';
import { ClusterRecord as DbClusterRecord } from '../db/repositories/ClusterRepository';

export interface ClusterConfig {
  epsMeters: number; // default 40m
  minPts: number; // default 1
  splitDistanceMeters: number; // default 80m (2 * eps)
  splitAltitudeMeters: number; // default 3.0m (1 floor)
  reclusterIntervalMs: number; // default 120,000 ms (2 min)
  congestionQueueRatio: number; // default 0.70
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  epsMeters: DEFAULT_CLUSTER_EPS_METERS,
  minPts: 1,
  splitDistanceMeters: 2 * DEFAULT_CLUSTER_EPS_METERS,
  splitAltitudeMeters: 3.0,
  reclusterIntervalMs: 120_000,
  congestionQueueRatio: 0.70,
};

export class MeshClusterer {
  private db: DatabaseManager;
  private config: ClusterConfig;
  private crypto: ICrypto;
  private incrementalClusterer: IncrementalClusterer;
  private membersMap: Map<string, ClusterMember> = new Map();
  private reclusterTimer: NodeJS.Timeout | null = null;

  constructor(db: DatabaseManager, crypto: ICrypto, config?: Partial<ClusterConfig>) {
    this.db = db;
    this.crypto = crypto;
    this.config = { ...DEFAULT_CLUSTER_CONFIG, ...config };
    this.incrementalClusterer = new IncrementalClusterer(this.config.epsMeters);
  }

  public async start(): Promise<void> {
    // Load existing members from DB
    await this.loadInitialMembers();

    // Start periodic 2-minute full DBSCAN re-clustering
    this.reclusterTimer = setInterval(async () => {
      await this.runFullRecluster();
    }, this.config.reclusterIntervalMs);

    if (this.reclusterTimer && typeof this.reclusterTimer.unref === 'function') {
      this.reclusterTimer.unref();
    }
  }

  public stop(): void {
    if (this.reclusterTimer) {
      clearInterval(this.reclusterTimer);
      this.reclusterTimer = null;
    }
  }

  public updateConfig(newConfig: Partial<ClusterConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.incrementalClusterer = new IncrementalClusterer(this.config.epsMeters);
  }

  public getConfig(): ClusterConfig {
    return { ...this.config };
  }

  /**
   * Called whenever a valid SOS, DEADMAN, or LOCATION packet is accepted
   */
  public async onPacketAccepted(
    packetBytes: Uint8Array,
    packetType: PacketType,
    originFpHex: string
  ): Promise<void> {
    let member: ClusterMember | null = null;
    const now = Math.floor(Date.now() / 1000);

    try {
      if (packetType === PacketType.SOS) {
        const sos = decodeSos(packetBytes);
        member = {
          originFpHex: originFpHex.toLowerCase(),
          latitude: sos.body.latitude,
          longitude: sos.body.longitude,
          accuracyMeters: sos.body.accuracyMeters,
          peopleCount: sos.body.peopleCount,
          status: sos.body.status,
          needsMask: sos.body.needsMask,
          batteryPercent: sos.body.batteryPercent,
          timestamp: sos.body.timestamp,
        };
      } else if (packetType === PacketType.DEADMAN) {
        const deadman = decodeDeadman(packetBytes);
        // Use last known coordinates for this origin if available
        const existing = this.membersMap.get(originFpHex.toLowerCase());
        member = {
          originFpHex: originFpHex.toLowerCase(),
          latitude: existing?.latitude ?? 18.5204,
          longitude: existing?.longitude ?? 73.8567,
          accuracyMeters: existing?.accuracyMeters ?? 15,
          peopleCount: existing?.peopleCount ?? 1,
          status: 3, // CRITICAL
          needsMask: existing?.needsMask ?? 1,
          batteryPercent: deadman.body.batteryPercent,
          timestamp: now,
        };
      } else if (packetType === PacketType.LOCATION) {
        const loc = decodeLocation(packetBytes);
        const existing = this.membersMap.get(originFpHex.toLowerCase());
        member = {
          originFpHex: originFpHex.toLowerCase(),
          latitude: loc.body.latitude,
          longitude: loc.body.longitude,
          accuracyMeters: loc.body.accuracyMeters,
          peopleCount: existing?.peopleCount ?? 1,
          status: existing?.status ?? 0,
          needsMask: existing?.needsMask ?? 0,
          batteryPercent: loc.body.batteryPercent,
          timestamp: loc.body.timestamp,
        };
      }
    } catch {
      return;
    }

    if (member) {
      this.membersMap.set(member.originFpHex, member);
      this.incrementalClusterer.addMember(member);
      await this.persistActiveClusters();
    }
  }

  /**
   * Ingests a CLUSTER_SUMMARY packet received from a peer and merges deterministically
   */
  public async ingestClusterSummary(packetBytes: Uint8Array): Promise<void> {
    try {
      const summary = decodeClusterSummary(packetBytes);
      const existingDb = await this.db.clusters.getClusterById(summary.body.clusterId);

      const dbCluster: DbClusterRecord = {
        cluster_id: summary.body.clusterId,
        centroid_lat: summary.body.centroidLat,
        centroid_lon: summary.body.centroidLon,
        radius_meters: summary.body.radiusMeters,
        member_count: summary.body.memberFingerprintHashes.length,
        priority_score: summary.body.maxStatus / 3.0,
        state: existingDb?.state ?? 'new',
        updated_at: new Date(summary.body.lastSeen * 1000).toISOString(),
      };

      await this.db.clusters.upsertCluster(dbCluster);
    } catch (e) {
      console.error('[MeshClusterer] Error ingesting CLUSTER_SUMMARY:', e);
    }
  }

  /**
   * Runs a complete DBSCAN re-cluster across all held member telemetry
   */
  public async runFullRecluster(): Promise<CoreClusterRecord[]> {
    const members = Array.from(this.membersMap.values());
    if (members.length === 0) return [];

    const rawClusters = dbscanClustering(members, this.config.epsMeters, this.config.minPts);

    // Apply split check on any cluster whose members have drifted apart
    const validatedClusters: CoreClusterRecord[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const c of rawClusters) {
      const splits = splitCluster(
        c,
        this.config.epsMeters,
        300, // 5 min drift
        now
      );
      validatedClusters.push(...splits);
    }

    // Persist to database
    for (const c of validatedClusters) {
      await this.db.clusters.upsertCluster({
        cluster_id: c.clusterId,
        centroid_lat: c.centroid.latitude,
        centroid_lon: c.centroid.longitude,
        radius_meters: c.boundingRadiusMeters,
        member_count: c.declaredPeople,
        priority_score: c.maxSeverity / 3.0,
        state: 'new',
        updated_at: new Date(c.lastSeen * 1000).toISOString(),
      });
    }

    return validatedClusters;
  }

  /**
   * Generates a signed CLUSTER_SUMMARY packet for a given cluster
   */
  public async createClusterSummaryPacket(
    clusterId: string,
    keyPair: { publicKey: Uint8Array; privateKey: Uint8Array },
    seq: number
  ): Promise<Uint8Array | null> {
    const clusters = this.incrementalClusterer.getClusters();
    const target = clusters.find((c) => c.clusterId === clusterId);
    if (!target) return null;

    const memberHashes = target.memberFingerprints.map((fpHex) => {
      const bytes = new Uint8Array(4);
      for (let i = 0; i < 4; i++) {
        bytes[i] = parseInt(fpHex.substring(i * 2, i * 2 + 2), 16) || 0;
      }
      return bytes;
    });

    return createAndSignClusterSummary(
      {
        clusterId: target.clusterId,
        memberFingerprintHashes: memberHashes,
        peopleCount: target.declaredPeople,
        centroidLat: target.centroid.latitude,
        centroidLon: target.centroid.longitude,
        radiusMeters: Math.round(target.boundingRadiusMeters),
        maxStatus: target.maxSeverity,
        needsMask: target.aggregateNeedsMask,
        bestBattery: target.bestBattery,
        firstSeen: target.firstSeen,
        lastSeen: target.lastSeen,
        sequenceNumber: seq,
        keyPair,
      },
      this.crypto
    );
  }

  private async persistActiveClusters(): Promise<void> {
    const active = this.incrementalClusterer.getClusters();
    for (const c of active) {
      await this.db.clusters.upsertCluster({
        cluster_id: c.clusterId,
        centroid_lat: c.centroid.latitude,
        centroid_lon: c.centroid.longitude,
        radius_meters: c.boundingRadiusMeters,
        member_count: c.declaredPeople,
        priority_score: c.maxSeverity / 3.0,
        state: 'new',
        updated_at: new Date(c.lastSeen * 1000).toISOString(),
      });
    }
  }

  private async loadInitialMembers(): Promise<void> {
    // Load members from stored SOS packets
    const packets = await this.db.packets.getAllPackets();
    for (const p of packets) {
      if (p.is_sos === 1) {
        try {
          const raw = this.hexToBytes(p.raw_bytes);
          const sos = decodeSos(raw);
          const member: ClusterMember = {
            originFpHex: p.origin_fp.toLowerCase(),
            latitude: sos.body.latitude,
            longitude: sos.body.longitude,
            accuracyMeters: sos.body.accuracyMeters,
            peopleCount: sos.body.peopleCount,
            status: sos.body.status,
            needsMask: sos.body.needsMask,
            batteryPercent: sos.body.batteryPercent,
            timestamp: sos.body.timestamp,
          };
          this.membersMap.set(member.originFpHex, member);
          this.incrementalClusterer.addMember(member);
        } catch {
          // Skip malformed
        }
      }
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
