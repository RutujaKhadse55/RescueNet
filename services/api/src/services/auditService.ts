import { db } from '../db/client';

export class AuditService {
  public static async log(
    action: string,
    objectType: string,
    objectId?: string | null,
    userId?: string | null,
    ip?: string | null,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO audit_log (user_id, action, object_type, object_id, ip, details, at)
         VALUES ($1, $2, $3, $4, $5, $6, now());`,
        [userId ?? null, action, objectType, objectId ?? null, ip ?? null, JSON.stringify(details)]
      );
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }

  public static async logCoordinateAccess(
    clusterId: string,
    userId?: string,
    ip?: string
  ): Promise<void> {
    await AuditService.log('read_precise_coordinates', 'cluster_coordinates', clusterId, userId, ip, {
      sensitive: true,
      timestamp: new Date().toISOString(),
    });
  }
}
