/**
 * RescueNet Transport-Independent Mesh Synchronization Engine
 * Handles summary vectors, set reconciliation, priority-based packet selection,
 * Spray-and-Wait with epidemic fast-path, rate limiting, and battery relay policy.
 */

import { PacketType } from '../codec/types';

export interface StoredPacket {
  packetIdHex: string;
  type: PacketType;
  originFpHex: string;
  rawBytes: Uint8Array;
  sizeBytes: number;
  priorityScore: number;
  createdAt: number; // unix seconds
  hop: number;
  ttl: number;
  copiesLeft: number; // Spray-and-wait copy count (default L = 6)
  isCriticalSos?: boolean;
  sequenceNumber: number;
  nonce?: number;
}

export interface MeshStore {
  get(packetIdHex: string): StoredPacket | null;
  put(packet: StoredPacket): boolean;
  has(packetIdHex: string): boolean;
  list(): StoredPacket[];
  delete(packetIdHex: string): boolean;
}

export class InMemoryMeshStore implements MeshStore {
  private packets: Map<string, StoredPacket> = new Map();

  public get(packetIdHex: string): StoredPacket | null {
    return this.packets.get(packetIdHex.toLowerCase()) ?? null;
  }

  public put(packet: StoredPacket): boolean {
    this.packets.set(packet.packetIdHex.toLowerCase(), packet);
    return true;
  }

  public has(packetIdHex: string): boolean {
    return this.packets.has(packetIdHex.toLowerCase());
  }

  public list(): StoredPacket[] {
    return Array.from(this.packets.values());
  }

  public delete(packetIdHex: string): boolean {
    return this.packets.delete(packetIdHex.toLowerCase());
  }
}

export interface SummaryItem {
  packetIdHex: string;
  type: PacketType;
  priorityScore: number;
  ageSeconds: number;
  copiesLeft: number;
  sizeBytes: number;
}

export type SummaryVector = SummaryItem[];

/**
 * Priority rank for packet types
 * Order: SOS > ACK > DEADMAN > CLUSTER_SUMMARY > LOCATION > CHAT > CHAT_RECEIPT
 */
export const TYPE_PRIORITY_RANK: Record<PacketType, number> = {
  [PacketType.SOS]: 1,
  [PacketType.ACK]: 2,
  [PacketType.DEADMAN]: 3,
  [PacketType.CLUSTER_SUMMARY]: 4,
  [PacketType.LOCATION]: 5,
  [PacketType.CHAT]: 6,
  [PacketType.CHAT_RECEIPT]: 7,
  [PacketType.HELLO]: 8,
};

/**
 * Computes difference between local and remote SummaryVectors
 */
export function diffSummaryVectors(
  local: SummaryVector,
  remote: SummaryVector,
): { localNeeds: string[]; remoteNeeds: string[] } {
  const localSet = new Set(local.map(i => i.packetIdHex.toLowerCase()));
  const remoteSet = new Set(remote.map(i => i.packetIdHex.toLowerCase()));

  const localNeeds: string[] = [];
  for (const item of remote) {
    if (!localSet.has(item.packetIdHex.toLowerCase())) {
      localNeeds.push(item.packetIdHex.toLowerCase());
    }
  }

  const remoteNeeds: string[] = [];
  for (const item of local) {
    if (!remoteSet.has(item.packetIdHex.toLowerCase())) {
      remoteNeeds.push(item.packetIdHex.toLowerCase());
    }
  }

  return { localNeeds, remoteNeeds };
}

export interface NeighborState {
  neighborOriginFpHex: string;
  batteryPercent: number;
  isCharging?: boolean;
}

export interface SelectedPacketResult {
  packet: StoredPacket;
  allocatedCopies: number;
  remainingLocalCopies: number;
}

/**
 * Selects packets to transmit to a neighbor within an airtime byte budget
 */
export function selectToSend(
  localStore: MeshStore,
  remoteSummary: SummaryVector,
  budgetBytes: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SelectedPacketResult[] {
  const remoteKnown = new Set(remoteSummary.map(r => r.packetIdHex.toLowerCase()));
  const candidates = localStore.list().filter(p => !remoteKnown.has(p.packetIdHex.toLowerCase()));

  // Sort candidates by priority rank, then priority score descending, then age ascending
  candidates.sort((a, b) => {
    const rankA = TYPE_PRIORITY_RANK[a.type] ?? 99;
    const rankB = TYPE_PRIORITY_RANK[b.type] ?? 99;
    if (rankA !== rankB) {
      return rankA - rankB; // Lower rank number = higher priority
    }
    if (Math.abs(a.priorityScore - b.priorityScore) > 0.001) {
      return b.priorityScore - a.priorityScore; // Higher score first
    }
    const ageA = nowSeconds - a.createdAt;
    const ageB = nowSeconds - b.createdAt;
    return ageA - ageB; // Fresher first
  });

  const selected: SelectedPacketResult[] = [];
  let bytesUsed = 0;

  for (const p of candidates) {
    if (bytesUsed + p.sizeBytes > budgetBytes) {
      continue;
    }

    // TTL and Hop checks
    if (p.ttl <= 0 || p.hop >= 10) {
      continue;
    }

    // Spray-and-Wait copy counting (L = 6)
    // High-priority SOS (isCriticalSos) uses epidemic flooding for the first 3 hops
    let sendCopies = 1;
    let keepCopies = p.copiesLeft;

    if (p.isCriticalSos && p.hop < 3) {
      // Epidemic mode for first 3 hops
      sendCopies = p.copiesLeft;
      keepCopies = p.copiesLeft;
    } else if (p.copiesLeft > 1) {
      // Binary Spray-and-Wait
      sendCopies = Math.ceil(p.copiesLeft / 2);
      keepCopies = Math.floor(p.copiesLeft / 2);
    } else if (p.copiesLeft === 1) {
      // Last copy: only send if we have budget
      sendCopies = 1;
      keepCopies = 0;
    }

    selected.push({
      packet: p,
      allocatedCopies: sendCopies,
      remainingLocalCopies: keepCopies,
    });

    bytesUsed += p.sizeBytes;
  }

  return selected;
}

/**
 * Per-Origin Rate Limiting Engine
 * Default limits: 6 new SOS/hour, 60 location updates/hour
 */
export class MeshRateLimiter {
  private records: Map<
    string,
    {
      sosTimestamps: number[];
      locationTimestamps: number[];
    }
  > = new Map();

  constructor(
    private readonly maxSosPerHour: number = 6,
    private readonly maxLocationPerHour: number = 60,
  ) {}

  public isAllowed(originFpHex: string, type: PacketType, nowSeconds: number): boolean {
    const key = originFpHex.toLowerCase();
    let record = this.records.get(key);
    if (!record) {
      record = { sosTimestamps: [], locationTimestamps: [] };
      this.records.set(key, record);
    }

    const oneHourAgo = nowSeconds - 3600;

    if (type === PacketType.SOS) {
      record.sosTimestamps = record.sosTimestamps.filter(t => t > oneHourAgo);
      if (record.sosTimestamps.length >= this.maxSosPerHour) {
        return false;
      }
      record.sosTimestamps.push(nowSeconds);
      return true;
    }

    if (type === PacketType.LOCATION) {
      record.locationTimestamps = record.locationTimestamps.filter(t => t > oneHourAgo);
      if (record.locationTimestamps.length >= this.maxLocationPerHour) {
        return false;
      }
      record.locationTimestamps.push(nowSeconds);
      return true;
    }

    return true;
  }
}

/**
 * Replay Protection Filter
 * Rejects duplicate sequence numbers and previously-seen nonces
 */
export class ReplayFilter {
  private seenSequences: Map<string, Set<number>> = new Map();
  private seenNonces: Set<string> = new Set();
  private maxStored = 5000;

  public isDuplicate(originFpHex: string, sequenceNumber: number, nonce?: number): boolean {
    const key = originFpHex.toLowerCase();
    let seqs = this.seenSequences.get(key);
    if (!seqs) {
      seqs = new Set();
      this.seenSequences.set(key, seqs);
    }

    if (seqs.has(sequenceNumber)) {
      return true;
    }

    if (nonce !== undefined) {
      const nonceKey = `${key}_${nonce}`;
      if (this.seenNonces.has(nonceKey)) {
        return true;
      }
    }

    return false;
  }

  public record(originFpHex: string, sequenceNumber: number, nonce?: number): void {
    const key = originFpHex.toLowerCase();
    let seqs = this.seenSequences.get(key);
    if (!seqs) {
      seqs = new Set();
      this.seenSequences.set(key, seqs);
    }

    seqs.add(sequenceNumber);

    if (nonce !== undefined) {
      const nonceKey = `${key}_${nonce}`;
      this.seenNonces.add(nonceKey);
      if (this.seenNonces.size > this.maxStored) {
        // Simple trim
        const iter = this.seenNonces.values();
        for (let i = 0; i < 500; i++) {
          this.seenNonces.delete(iter.next().value!);
        }
      }
    }
  }
}

/**
 * Battery-Aware Relay Policy
 */
export enum RelayPolicyMode {
  RELAY_FULL = 'RELAY_FULL',
  RELAY_SOS_ONLY = 'RELAY_SOS_ONLY',
  SLEEP = 'SLEEP',
}

export function evaluateRelayPolicy(
  batteryPercent: number,
  isCharging: boolean,
  neighborBatteryLevels: number[] = [],
): RelayPolicyMode {
  if (isCharging) {
    return RelayPolicyMode.RELAY_FULL;
  }

  if (batteryPercent < 15) {
    return RelayPolicyMode.SLEEP;
  }

  if (batteryPercent >= 40) {
    return RelayPolicyMode.RELAY_FULL;
  }

  // Battery between 15% and 39%
  // If there are abundant neighbors with higher battery, conserve power by relaying SOS only
  if (neighborBatteryLevels.length > 0) {
    const higherNeighbors = neighborBatteryLevels.filter(b => b > batteryPercent);
    if (higherNeighbors.length >= 2) {
      return RelayPolicyMode.RELAY_SOS_ONLY;
    }
  }

  return RelayPolicyMode.RELAY_SOS_ONLY;
}
