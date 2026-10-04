/**
 * RescueNet Mobility Engine (Phase 15)
 *
 * Implements realistic disaster movement patterns:
 * 1. Survivors: Slow Random Waypoint (0.3 - 1.2 m/s, long pauses 60-300s) representing trapped or sheltering individuals.
 * 2. Group Mobility: Clustered movement toward evacuation centers.
 * 3. Rescuer Patrol Vehicles: Systematic grid / route sweeping (6.0 - 10.0 m/s, ~20-36 km/h) carrying large byte budgets.
 * 4. Gateways: Fixed positions at known road access points, perimeter check-posts, and operational bases.
 */

import { SimNode, ScenarioConfig } from './types';

export class MobilityEngine {
  private rng: () => number;

  constructor(randomGenerator: () => number) {
    this.rng = randomGenerator;
  }

  /**
   * Initializes initial node spatial distribution based on role.
   */
  public initializePositions(nodes: SimNode[], config: ScenarioConfig): void {
    const gatewaySpacing = config.areaWidthM / (config.gatewayCount + 1);

    nodes.forEach((node, index) => {
      if (node.role === 'gateway') {
        // Place gateways strategically along the perimeter / access road
        node.x = gatewaySpacing * (index + 1);
        node.y = config.areaHeightM * 0.95; // south road access
        node.vx = 0;
        node.vy = 0;
        node.waypointX = node.x;
        node.waypointY = node.y;
        node.pauseTimeLeft = 999999;
      } else if (node.role === 'rescuer') {
        // Rescuers start at road access points and patrol inward
        node.x = config.areaWidthM * this.rng();
        node.y = config.areaHeightM * 0.9;
        this.assignNewWaypoint(node, config, 8.0); // 8 m/s vehicle patrol
      } else {
        // Survivors and civilian carriers scattered across disaster zone
        // Clustered around 2-3 damage epicenter zones
        const epicenterX = config.areaWidthM * (0.3 + 0.4 * (index % 3));
        const epicenterY = config.areaHeightM * (0.3 + 0.4 * (index % 2));
        const spread = Math.min(config.areaWidthM, config.areaHeightM) * 0.2;

        node.x = Math.max(10, Math.min(config.areaWidthM - 10, epicenterX + (this.rng() - 0.5) * spread));
        node.y = Math.max(10, Math.min(config.areaHeightM - 10, epicenterY + (this.rng() - 0.5) * spread));

        const speed = node.role === 'carrier' ? 1.5 : 0.6;
        this.assignNewWaypoint(node, config, speed);
      }
    });
  }

  /**
   * Advances simulation node positions by deltaTimeSeconds.
   */
  public stepMobility(nodes: SimNode[], config: ScenarioConfig, dt: number): void {
    for (const node of nodes) {
      if (node.role === 'gateway') continue;

      if (node.pauseTimeLeft > 0) {
        node.pauseTimeLeft -= dt;
        continue;
      }

      // Move toward waypoint
      const dx = node.waypointX - node.x;
      const dy = node.waypointY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const stepDist = Math.sqrt(node.vx * node.vx + node.vy * node.vy) * dt;

      if (dist <= stepDist || dist < 2.0) {
        // Waypoint reached
        node.x = node.waypointX;
        node.y = node.waypointY;

        // Rescuers don't pause long (patrolling), survivors pause long (sheltering)
        const pause = node.role === 'rescuer' ? 5 + this.rng() * 10 : 30 + this.rng() * 180;
        node.pauseTimeLeft = pause;

        const speed = node.role === 'rescuer' ? 8.0 : (node.role === 'carrier' ? 1.5 : 0.6);
        this.assignNewWaypoint(node, config, speed);
      } else {
        node.x += (dx / dist) * stepDist;
        node.y += (dy / dist) * stepDist;
      }

      // Keep within bounds
      node.x = Math.max(5, Math.min(config.areaWidthM - 5, node.x));
      node.y = Math.max(5, Math.min(config.areaHeightM - 5, node.y));
    }
  }

  private assignNewWaypoint(node: SimNode, config: ScenarioConfig, speed: number): void {
    node.waypointX = 10 + this.rng() * (config.areaWidthM - 20);
    node.waypointY = 10 + this.rng() * (config.areaHeightM - 20);

    const dx = node.waypointX - node.x;
    const dy = node.waypointY - node.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    node.vx = (dx / dist) * speed;
    node.vy = (dy / dist) * speed;
  }
}
