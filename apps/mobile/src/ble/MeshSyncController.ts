import { IBleTransport, BleNeighbor } from '../native/RescueBle';
import { DatabaseManager } from '../db/DatabaseManager';
import {
  SummaryVector,
  diffSummaryVectors,
  selectToSend,
  fragmentPacket,
  GattReassemblySession,
  HEADER_SIZE,
  InMemoryMeshStore,
  StoredPacket,
  PacketType,
} from '@rescuenet/core';

export class MeshSyncController {
  private transport: IBleTransport;
  private db: DatabaseManager;
  private _localOriginFpPrefix: string;
  private _getPrivateKey: () => Promise<Uint8Array>;
  private reassemblySessions: Map<string, GattReassemblySession> = new Map();

  constructor(
    transport: IBleTransport,
    db: DatabaseManager,
    localOriginFpPrefix: string,
    getPrivateKey: () => Promise<Uint8Array>,
  ) {
    this.transport = transport;
    this.db = db;
    this._localOriginFpPrefix = localOriginFpPrefix;
    this._getPrivateKey = getPrivateKey;
  }

  public getLocalOriginFpPrefix(): string {
    return this._localOriginFpPrefix;
  }

  public async getPrivateKeyBytes(): Promise<Uint8Array> {
    return this._getPrivateKey();
  }

  public start(): void {
    // Listen to neighbor discovery
    this.transport.onNeighborDiscovered(async (neighbor: BleNeighbor) => {
      await this.db.neighbors.upsertNeighbor({
        fp: neighbor.originFpPrefix.padEnd(16, '0'),
        last_rssi: neighbor.rssi,
        last_seen: new Date(neighbor.lastSeen).toISOString(),
        battery: neighbor.flags.lowBattery ? 15 : 85,
        role: neighbor.role,
        mac_rotating: 1,
      });
    });

    // Listen to incoming fragments
    this.transport.onPacketFragmentReceived(async (deviceId: string, fragmentBase64: string) => {
      await this.handleIncomingFragment(deviceId, fragmentBase64);
    });
  }

  /**
   * Performs mutual packet exchange with a connected neighbor
   */
  public async syncWithNeighbor(
    deviceId: string,
    peerSummaryVector: SummaryVector,
  ): Promise<{ packetsSent: number; bytesTransferred: number }> {
    // 1. Build local summary vector and in-memory store for selectToSend
    const allPackets = await this.db.packets.getAllPackets();
    const localStore = new InMemoryMeshStore();
    const localVector: SummaryVector = [];

    for (const p of allPackets) {
      const stored: StoredPacket = {
        packetIdHex: p.packet_id,
        type: p.packet_type as PacketType,
        originFpHex: p.origin_fp,
        rawBytes: this.hexToBytes(p.raw_bytes),
        sizeBytes: p.raw_bytes.length / 2,
        priorityScore: p.is_sos === 1 ? 1.0 : 0.5,
        createdAt: Math.floor(new Date(p.received_at).getTime() / 1000),
        hop: p.hop_count,
        ttl: p.ttl,
        copiesLeft: p.copies_left,
        sequenceNumber: 0,
      };
      localStore.put(stored);

      localVector.push({
        packetIdHex: p.packet_id,
        type: p.packet_type as PacketType,
        priorityScore: stored.priorityScore,
        ageSeconds: Math.floor((Date.now() - new Date(p.received_at).getTime()) / 1000),
        copiesLeft: p.copies_left,
        sizeBytes: stored.sizeBytes,
      });
    }

    // 2. Diff and select packets within 64 KB exchange budget
    const diff = diffSummaryVectors(localVector, peerSummaryVector);
    if (diff.remoteNeeds.length === 0) {
      return { packetsSent: 0, bytesTransferred: 0 };
    }
    const selected = selectToSend(localStore, peerSummaryVector, 65536);

    let packetsSent = 0;
    let bytesTransferred = 0;

    for (const sel of selected) {
      const p = await this.db.packets.getPacketById(sel.packet.packetIdHex);
      if (!p) continue;

      if (p.copies_left > 1 || p.is_sos === 1) {
        // Fragment packet
        const rawBytes = sel.packet.rawBytes;
        const stats = await this.transport.getExchangeStats();
        const effectiveMtu = Math.max(20, stats.mtu - 3); // 3 bytes GATT overhead
        const fragments = fragmentPacket(rawBytes, effectiveMtu);

        for (const frag of fragments) {
          const fragBase64 = this.bytesToBase64(frag);
          await this.transport.sendFragment(deviceId, fragBase64);
          bytesTransferred += frag.length;
        }

        // Spray-and-wait: halves copies for relayed non-SOS packets
        const newCopies =
          p.is_sos === 1 ? p.copies_left : Math.max(1, Math.floor(p.copies_left / 2));
        await this.db.packets.insertPacket({
          ...p,
          copies_left: newCopies,
        });

        await this.db.packets.incrementDeliveredCount(p.packet_id);
        packetsSent++;
      }
    }

    return { packetsSent, bytesTransferred };
  }

  /**
   * Diagnostic test packet transmission
   */
  public async sendTestPing(targetDeviceId: string): Promise<boolean> {
    const pingPayload = new Uint8Array([0x07, 0x01, 0x02, 0x03, 0x04]);
    const fragments = fragmentPacket(pingPayload, 128);
    for (const frag of fragments) {
      await this.transport.sendFragment(targetDeviceId, this.bytesToBase64(frag));
    }
    return true;
  }

  private async handleIncomingFragment(deviceId: string, fragmentBase64: string): Promise<void> {
    const bytes = this.base64ToBytes(fragmentBase64);
    if (bytes.length < 5) return;

    let session = this.reassemblySessions.get(deviceId);
    if (!session) {
      session = new GattReassemblySession(60_000); // 60s timeout
      this.reassemblySessions.set(deviceId, session);
    }

    const reassembled = session.processFragment(bytes);
    if (reassembled) {
      this.reassemblySessions.delete(deviceId);
      // Valid packet completed
      await this.ingestCompletedPacket(reassembled, deviceId);
    }
  }

  private async ingestCompletedPacket(
    packetBytes: Uint8Array,
    fromNeighbor: string,
  ): Promise<void> {
    if (packetBytes.length < HEADER_SIZE) return;

    const packetType = packetBytes[1];
    const isSos = packetType === 0x01 || packetType === 0x04 ? 1 : 0;
    const packetIdHex = Array.from(packetBytes.subarray(5, 13))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(packetBytes.subarray(13, 21))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const rawHex = Array.from(packetBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    await this.db.packets.insertPacket({
      packet_id: packetIdHex,
      raw_bytes: rawHex,
      packet_type: packetType || 0,
      origin_fp: originFpHex,
      hop_count: packetBytes[4] || 0,
      ttl: packetBytes[3] || 0,
      received_at: new Date().toISOString(),
      from_neighbor: fromNeighbor,
      copies_left: isSos ? 6 : 3,
      delivered_to_count: 0,
      is_sos: isSos,
    });
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
