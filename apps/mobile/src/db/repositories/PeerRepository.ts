import { IDatabaseDriver } from '../driver';

export interface PeerRecord {
  fp: string;
  pubkey: string;
  nickname: string;
  offers_skills: string;
  last_location_lat?: number | null;
  last_location_lon?: number | null;
  last_seen: string;
}

export class PeerRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async upsertPeer(p: PeerRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO peers (
        fp, pubkey, nickname, offers_skills,
        last_location_lat, last_location_lon, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        p.fp,
        p.pubkey,
        p.nickname,
        p.offers_skills,
        p.last_location_lat ?? null,
        p.last_location_lon ?? null,
        p.last_seen,
      ],
    );
  }

  async getPeer(fp: string): Promise<PeerRecord | null> {
    const res = await this.driver.execute<PeerRecord>(`SELECT * FROM peers WHERE fp = ?;`, [fp]);
    return res.rows[0] ?? null;
  }

  async getAllPeers(): Promise<PeerRecord[]> {
    const res = await this.driver.execute<PeerRecord>(
      `SELECT * FROM peers ORDER BY last_seen DESC;`,
    );
    return res.rows;
  }

  async deleteHistory(): Promise<void> {
    await this.driver.execute(`DELETE FROM peers;`);
  }
}
