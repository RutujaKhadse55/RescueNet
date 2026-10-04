import { IDatabaseDriver } from '../driver';

export interface ClusterRecord {
  cluster_id: string;
  centroid_lat: number;
  centroid_lon: number;
  radius_meters: number;
  member_count: number;
  priority_score: number;
  state: 'new' | 'assigned' | 'en_route' | 'reached' | 'closed' | 'false_alarm';
  updated_at: string;
}

export interface ClusterMemberRecord {
  cluster_id: string;
  origin_fp: string;
  joined_at: string;
}

export class ClusterRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async upsertCluster(c: ClusterRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO clusters (
        cluster_id, centroid_lat, centroid_lon, radius_meters,
        member_count, priority_score, state, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        c.cluster_id,
        c.centroid_lat,
        c.centroid_lon,
        c.radius_meters,
        c.member_count,
        c.priority_score,
        c.state,
        c.updated_at,
      ]
    );
  }

  async getCluster(clusterId: string): Promise<ClusterRecord | null> {
    const res = await this.driver.execute<ClusterRecord>(
      `SELECT * FROM clusters WHERE cluster_id = ?;`,
      [clusterId]
    );
    return res.rows[0] ?? null;
  }

  async getClusterById(clusterId: string): Promise<ClusterRecord | null> {
    return this.getCluster(clusterId);
  }

  async getAllClusters(): Promise<ClusterRecord[]> {
    const res = await this.driver.execute<ClusterRecord>(
      `SELECT * FROM clusters ORDER BY priority_score DESC;`
    );
    return res.rows;
  }

  async updateStatus(
    clusterId: string,
    state: 'new' | 'assigned' | 'en_route' | 'reached' | 'closed' | 'false_alarm'
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.driver.execute(
      `UPDATE clusters SET state = ?, updated_at = ? WHERE cluster_id = ?;`,
      [state, now, clusterId]
    );
  }

  async addMember(member: ClusterMemberRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO cluster_members (cluster_id, origin_fp, joined_at)
       VALUES (?, ?, ?);`,
      [member.cluster_id, member.origin_fp, member.joined_at]
    );
  }

  async getMembers(clusterId: string): Promise<ClusterMemberRecord[]> {
    const res = await this.driver.execute<ClusterMemberRecord>(
      `SELECT * FROM cluster_members WHERE cluster_id = ?;`,
      [clusterId]
    );
    return res.rows;
  }
}
