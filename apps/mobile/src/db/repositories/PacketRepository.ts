import { IDatabaseDriver } from '../driver';

export interface PacketRecord {
  packet_id: string; // 16 hex chars (8 bytes)
  raw_bytes: string; // base64 or hex string
  packet_type: number;
  origin_fp: string;
  hop_count: number;
  ttl: number;
  received_at: string; // ISO
  from_neighbor?: string | null;
  copies_left: number;
  uplinked_at?: string | null;
  delivered_to_count: number;
  is_sos: number; // 1 or 0
  parsed_json?: string | null;
}

export class PacketRepository {
  private driver: IDatabaseDriver;
  public static readonly DEFAULT_STORAGE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async insertPacket(p: PacketRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO packets (
        packet_id, raw_bytes, packet_type, origin_fp, hop_count, ttl,
        received_at, from_neighbor, copies_left, uplinked_at,
        delivered_to_count, is_sos, parsed_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        p.packet_id,
        p.raw_bytes,
        p.packet_type,
        p.origin_fp,
        p.hop_count,
        p.ttl,
        p.received_at,
        p.from_neighbor ?? null,
        p.copies_left,
        p.uplinked_at ?? null,
        p.delivered_to_count,
        p.is_sos,
        p.parsed_json ?? null,
      ]
    );
  }

  async getPacketById(packetId: string): Promise<PacketRecord | null> {
    const res = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets WHERE packet_id = ?;`,
      [packetId]
    );
    return res.rows[0] ?? null;
  }

  async deletePacket(packetId: string): Promise<void> {
    await this.driver.execute(`DELETE FROM packets WHERE packet_id = ?;`, [packetId]);
  }

  async getAllPackets(limit: number = 200): Promise<PacketRecord[]> {
    const res = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets ORDER BY received_at DESC LIMIT ${limit};`
    );
    return res.rows;
  }

  async markUplinked(packetId: string, timestamp?: string): Promise<void> {
    const ts = timestamp || new Date().toISOString();
    await this.driver.execute(
      `UPDATE packets SET uplinked_at = ? WHERE packet_id = ?;`,
      [ts, packetId]
    );
  }

  async incrementDeliveredCount(packetId: string): Promise<void> {
    await this.driver.execute(
      `UPDATE packets SET delivered_to_count = delivered_to_count + 1 WHERE packet_id = ?;`,
      [packetId]
    );
  }

  async getUnuplinkedSosPackets(): Promise<PacketRecord[]> {
    const res = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets WHERE is_sos = 1 AND uplinked_at IS NULL ORDER BY received_at ASC;`
    );
    return res.rows;
  }

  async getUnuplinkedPackets(limit: number = 200, onlySos: boolean = false): Promise<PacketRecord[]> {
    const filter = onlySos ? 'WHERE is_sos = 1 AND uplinked_at IS NULL' : 'WHERE uplinked_at IS NULL';
    const res = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets ${filter} ORDER BY is_sos DESC, received_at ASC LIMIT ${limit};`
    );
    return res.rows;
  }

  async markUplinkedWithCopies(packetId: string, minCopies: number = 1, timestamp?: string): Promise<void> {
    const ts = timestamp || new Date().toISOString();
    // Two statements to avoid MIN() parsing complexity in the in-memory driver
    await this.driver.execute(
      `UPDATE packets SET uplinked_at = ? WHERE packet_id = ?;`,
      [ts, packetId]
    );
    // Fetch current copies_left and apply MIN manually
    const rec = await this.getPacketById(packetId);
    if (rec) {
      const newCopies = Math.min(rec.copies_left, minCopies);
      await this.driver.execute(
        `UPDATE packets SET copies_left = ? WHERE packet_id = ?;`,
        [newCopies, packetId]
      );
    }
  }

  async getPacketsByType(type: number): Promise<PacketRecord[]> {
    const res = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets WHERE packet_type = ? ORDER BY received_at DESC;`,
      [type]
    );
    return res.rows;
  }

  async countPackets(): Promise<number> {
    const res = await this.driver.execute<{ count: number }>(`SELECT COUNT(*) as count FROM packets;`);
    return res.rows[0]?.count ?? 0;
  }

  /**
   * Estimates total packet table byte consumption
   */
  async calculateStorageBytes(): Promise<number> {
    const packets = await this.driver.execute<PacketRecord>(`SELECT * FROM packets;`);
    let total = 0;
    for (const p of packets.rows) {
      total += (p.raw_bytes?.length || 0) + (p.parsed_json?.length || 0) + 128; // 128 bytes metadata overhead
    }
    return total;
  }

  /**
   * LRU Eviction Policy with Strict Safety Rules:
   * Storage cap: default 50 MB.
   * CRITICAL NON-NEGOTIABLE GUARANTEE: Never evict un-uplinked SOS packets (is_sos = 1 AND uplinked_at IS NULL)!
   * Eviction priority:
   * 1. Old non-SOS packets (oldest received_at first)
   * 2. Already-uplinked SOS packets (oldest uplinked_at first)
   */
  async applyLruEviction(
    targetCapBytes: number = PacketRepository.DEFAULT_STORAGE_CAP_BYTES
  ): Promise<{ evictedCount: number; remainingBytes: number }> {
    let currentBytes = await this.calculateStorageBytes();
    if (currentBytes <= targetCapBytes) {
      return { evictedCount: 0, remainingBytes: currentBytes };
    }

    let evictedCount = 0;

    // 1. Evict non-SOS packets starting with oldest
    const nonSosPackets = await this.driver.execute<PacketRecord>(
      `SELECT * FROM packets WHERE is_sos = 0 ORDER BY received_at ASC;`
    );

    for (const p of nonSosPackets.rows) {
      if (currentBytes <= targetCapBytes) break;
      await this.driver.execute(`DELETE FROM packets WHERE packet_id = ?;`, [p.packet_id]);
      const freed = (p.raw_bytes?.length || 0) + (p.parsed_json?.length || 0) + 128;
      currentBytes -= freed;
      evictedCount++;
    }

    // 2. If still over cap, evict already uplinked SOS packets (NEVER touch un-uplinked SOS!)
    if (currentBytes > targetCapBytes) {
      const uplinkedSosPackets = await this.driver.execute<PacketRecord>(
        `SELECT * FROM packets WHERE is_sos = 1 AND uplinked_at IS NOT NULL ORDER BY uplinked_at ASC;`
      );

      for (const p of uplinkedSosPackets.rows) {
        if (currentBytes <= targetCapBytes) break;
        await this.driver.execute(`DELETE FROM packets WHERE packet_id = ?;`, [p.packet_id]);
        const freed = (p.raw_bytes?.length || 0) + (p.parsed_json?.length || 0) + 128;
        currentBytes -= freed;
        evictedCount++;
      }
    }

    return { evictedCount, remainingBytes: Math.max(0, currentBytes) };
  }
}
