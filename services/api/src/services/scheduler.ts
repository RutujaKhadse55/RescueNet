/**
 * RescueNet Background Scheduler (Phase 9)
 * Periodic tasks: priority recalculation, staleness monitoring,
 * possibly_failing flags, and retention purges.
 */

import { db } from '../db/client';
import { calculatePriorityScore } from '@rescuenet/core';
import { eventBus } from './eventBus';

export class BackgroundScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  public start(intervalMs: number = 60_000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      await this.runJobs();
    }, intervalMs);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runJobs(): Promise<void> {
    try {
      // 1. Recompute priority & flags for active clusters
      const clustersRes = await db.query(
        `SELECT * FROM clusters WHERE state NOT IN ('closed', 'false_alarm');`
      );

      const nowSeconds = Math.floor(Date.now() / 1000);

      for (const c of clustersRes.rows) {
        const lastSeenSeconds = Math.floor(new Date(c.last_seen).getTime() / 1000);
        const minutesElapsed = Math.max(0, Math.floor((nowSeconds - lastSeenSeconds) / 60));

        const priorityRes = calculatePriorityScore({
          status: c.max_status,
          peopleCount: c.declared_people,
          minutesSinceLastSeen: minutesElapsed,
          needsMask: c.needs_mask,
          radiusMeters: c.radius_m,
          lowTrust: (c.flags || []).includes('low_trust'),
        });

        const flags = [...(c.flags || [])].filter(
          (f) => f !== 'possibly_failing' && f !== 'large_group'
        );

        if (priorityRes.flags.large_group) flags.push('large_group');
        if (priorityRes.flags.possibly_failing) flags.push('possibly_failing');

        await db.query(
          `UPDATE clusters SET priority_score = $1, priority_breakdown = $2, flags = $3, updated_at = now() WHERE id = $4;`,
          [priorityRes.score, priorityRes.components, flags, c.id]
        );

        if (priorityRes.flags.possibly_failing && !(c.flags || []).includes('possibly_failing')) {
          eventBus.broadcastClusterEvent({
            type: 'cluster_updated',
            clusterId: c.id,
            data: { possiblyFailing: true, priorityScore: priorityRes.score },
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('[BackgroundScheduler] Error executing periodic jobs:', err);
    }
  }
}

export const scheduler = new BackgroundScheduler();
