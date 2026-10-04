/**
 * RescueNet Cluster Management Service (Phase 9)
 * Handles cluster queries, timeline audit logs, state transitions,
 * team assignments, merges, splits, and false alarm tagging.
 */

import { db } from '../db/client';
import { AuditService } from './auditService';
import { eventBus } from './eventBus';

export interface ClusterFilterParams {
  incidentId?: string;
  state?: string;
  minPriority?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ClusterService {
  /**
   * Retrieves clusters for an incident with filtering, sorted by priority_score DESC
   */
  public static async getClusters(filters: ClusterFilterParams): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM clusters ORDER BY priority_score DESC;`
    );

    let rows = res.rows;
    if (filters.incidentId) {
      rows = rows.filter((r) => r.incident_id === filters.incidentId);
    }
    if (filters.state) {
      rows = rows.filter((r) => r.state === filters.state);
    }
    if (filters.minPriority !== undefined) {
      rows = rows.filter((r) => r.priority_score >= filters.minPriority!);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) => r.id.toLowerCase().includes(q));
    }

    return rows;
  }

  /**
   * Retrieves a single cluster with members, packets, timeline, and trust breakdown
   */
  public static async getClusterDetails(
    clusterId: string,
    requestingUserId?: string,
    clientIp?: string
  ): Promise<any> {
    const clRes = await db.query(`SELECT * FROM clusters WHERE id = $1;`, [clusterId]);
    if (clRes.rows.length === 0) return null;
    const cluster = clRes.rows[0];

    // Log coordinate access for compliance & privacy audit
    await AuditService.logCoordinateAccess(clusterId, requestingUserId, clientIp);

    // Fetch members
    const membersRes = await db.query(
      `SELECT * FROM cluster_members WHERE cluster_id = $1;`,
      [clusterId]
    );

    // Fetch timeline events
    const events = (db as any).getDb().cluster_events?.filter((e: any) => e.cluster_id === clusterId) || [];

    // Fetch trust signals
    const signals = (db as any).getDb().trust_signals?.filter((s: any) => s.cluster_id === clusterId) || [];

    return {
      ...cluster,
      members: membersRes.rows,
      timeline: events,
      trustBreakdown: signals,
    };
  }

  /**
   * Updates cluster state, merges, splits, or marks false alarm
   */
  public static async updateCluster(
    clusterId: string,
    updates: {
      state?: 'new' | 'assigned' | 'en_route' | 'reached' | 'closed' | 'false_alarm';
      falseAlarmReason?: string;
      mergeWithId?: string;
    },
    userId?: string
  ): Promise<any> {
    const clRes = await db.query(`SELECT * FROM clusters WHERE id = $1;`, [clusterId]);
    if (clRes.rows.length === 0) return null;
    const cluster = clRes.rows[0];

    if (updates.state) {
      cluster.state = updates.state;
      await db.query(`UPDATE clusters SET state = $1, updated_at = now() WHERE id = $2;`, [
        updates.state,
        clusterId,
      ]);

      await AuditService.log('update_cluster_state', 'cluster', clusterId, userId, null, {
        newState: updates.state,
        reason: updates.falseAlarmReason,
      });

      eventBus.broadcastClusterEvent({
        type: 'state_changed',
        clusterId,
        data: { state: updates.state },
        timestamp: new Date().toISOString(),
      });
    }

    if (updates.mergeWithId) {
      await db.query(`UPDATE clusters SET merged_into = $1, state = 'closed' WHERE id = $2;`, [
        updates.mergeWithId,
        clusterId,
      ]);
      await AuditService.log('merge_clusters', 'cluster', clusterId, userId, null, {
        mergedInto: updates.mergeWithId,
      });
    }

    return cluster;
  }

  /**
   * Assigns a rescue team to a cluster
   */
  public static async assignTeam(
    clusterId: string,
    teamId: string,
    assignedByUserId: string,
    etaMinutes: number = 30
  ): Promise<any> {
    const assignmentId = `asgn_${Date.now()}`;
    await db.query(
      `INSERT INTO assignments (id, cluster_id, team_id, assigned_by, eta_minutes, status, assigned_at)
       VALUES ($1, $2, $3, $4, $5, 'assigned', now());`,
      [assignmentId, clusterId, teamId, assignedByUserId, etaMinutes]
    );

    await db.query(`UPDATE clusters SET state = 'assigned', updated_at = now() WHERE id = $1;`, [
      clusterId,
    ]);

    await AuditService.log('assign_team', 'cluster', clusterId, assignedByUserId, null, {
      teamId,
      etaMinutes,
    });

    eventBus.broadcastClusterEvent({
      type: 'state_changed',
      clusterId,
      data: { state: 'assigned', teamId, etaMinutes },
      timestamp: new Date().toISOString(),
    });

    return { assignmentId, clusterId, teamId, etaMinutes, status: 'assigned' };
  }
}
