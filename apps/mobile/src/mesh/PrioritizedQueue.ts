/**
 * RescueNet Prioritized Packet Queue & Storage Manager
 * Enforces strict priority hierarchy, capacity bounds, eviction guarantees,
 * and TTL retention pruning.
 */

import { PacketType, TYPE_PRIORITY_RANK } from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';
import { MeshPolicy } from './types';
import { PacketRecord } from '../db/repositories/PacketRepository';

export class PrioritizedQueue {
  private db: DatabaseManager;
  private policy: MeshPolicy;

  constructor(db: DatabaseManager, policy: MeshPolicy) {
    this.db = db;
    this.policy = policy;
  }

  /**
   * Evaluates if queue has reached congestion threshold (e.g. >= 70% full)
   */
  public async isCongested(): Promise<boolean> {
    const all = await this.db.packets.getAllPackets();
    const ratio = all.length / this.policy.maxQueueCapacity;
    return ratio >= this.policy.congestionThresholdRatio;
  }

  public async getQueueSize(): Promise<number> {
    const all = await this.db.packets.getAllPackets();
    return all.length;
  }

  /**
   * Prepares capacity before storing a new packet, evicting low-priority items if necessary
   */
  public async ensureCapacity(): Promise<void> {
    const all = await this.db.packets.getAllPackets();
    if (all.length < this.policy.maxQueueCapacity) {
      return;
    }

    // Sort existing packets for eviction:
    // Highest rank number (lowest priority) first, then oldest received_at first
    const evictable = all.filter((p) => !this.isImmuneFromEviction(p));

    if (evictable.length === 0) {
      // Entire queue is filled with immune active SOS/ACK packets; cannot evict
      return;
    }

    evictable.sort((a, b) => {
      const rankA = TYPE_PRIORITY_RANK[a.packet_type as PacketType] ?? 99;
      const rankB = TYPE_PRIORITY_RANK[b.packet_type as PacketType] ?? 99;
      if (rankA !== rankB) {
        return rankB - rankA; // Evict highest rank number first (e.g. CHAT before SOS)
      }
      return new Date(a.received_at).getTime() - new Date(b.received_at).getTime(); // Oldest first
    });

    const toEvict = evictable[0]!;
    await this.db.packets.deletePacket(toEvict.packet_id);
    await this.db.events.logEvent('packet_evicted', {
      packet_id: toEvict.packet_id,
      packet_type: toEvict.packet_type,
      reason: 'capacity_exceeded',
    });
  }

  /**
   * An un-uplinked SOS or ACK packet still within TTL is IMMUNE to eviction
   */
  public isImmuneFromEviction(p: PacketRecord): boolean {
    const isSosOrAck = p.packet_type === PacketType.SOS || p.packet_type === PacketType.ACK;
    const withinTtl = p.ttl > 0;
    const notUplinked = p.delivered_to_count === 0;

    return isSosOrAck && withinTtl && notUplinked;
  }

  /**
   * Periodically prunes expired packets past retention limits
   */
  public async pruneExpired(nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<number> {
    const all = await this.db.packets.getAllPackets();
    let prunedCount = 0;

    for (const p of all) {
      const receivedSec = Math.floor(new Date(p.received_at).getTime() / 1000);
      const ageSec = nowSeconds - receivedSec;
      const retentionSec = this.getRetentionWindow(p.packet_type as PacketType);

      if (ageSec > retentionSec) {
        await this.db.packets.deletePacket(p.packet_id);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  private getRetentionWindow(type: PacketType): number {
    switch (type) {
      case PacketType.SOS:
        return this.policy.sosRetentionSeconds;
      case PacketType.CHAT:
      case PacketType.CHAT_RECEIPT:
        return this.policy.chatRetentionSeconds;
      case PacketType.LOCATION:
        return this.policy.locationRetentionSeconds;
      default:
        return this.policy.otherRetentionSeconds;
    }
  }
}
