import { IDatabaseDriver } from '../driver';

export interface NeighborRecord {
  fp: string; // 16 hex chars
  last_rssi: number;
  last_seen: string; // ISO
  battery: number;
  role: 'survivor' | 'rescuer' | 'gateway';
  mac_rotating: number; // 0 or 1
}

export class NeighborRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async upsertNeighbor(n: NeighborRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO neighbors (
        fp, last_rssi, last_seen, battery, role, mac_rotating
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [n.fp, n.last_rssi, n.last_seen, n.battery, n.role, n.mac_rotating]
    );
  }

  async getNeighbor(fp: string): Promise<NeighborRecord | null> {
    const res = await this.driver.execute<NeighborRecord>(
      `SELECT * FROM neighbors WHERE fp = ?;`,
      [fp]
    );
    return res.rows[0] ?? null;
  }

  async getAllNeighbors(limit: number = 50): Promise<NeighborRecord[]> {
    const res = await this.driver.execute<NeighborRecord>(
      `SELECT * FROM neighbors ORDER BY last_seen DESC LIMIT ${limit};`
    );
    return res.rows;
  }

  async removeStaleNeighbors(thresholdIso: string): Promise<number> {
    const res = await this.driver.execute(
      `DELETE FROM neighbors WHERE last_seen < ?;`,
      [thresholdIso]
    );
    return res.rowsAffected;
  }
}
