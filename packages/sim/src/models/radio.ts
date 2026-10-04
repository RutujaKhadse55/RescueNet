/**
 * RescueNet Radio Propagation Model (Phase 15)
 *
 * Implements Log-Distance Path Loss with Shadowing and Obstacle Attenuation:
 * PL(d) = PL(d0) + 10 * n * log10(d / d0) + X_sigma + sum(obstacle_attenuation)
 *
 * Parameters calibrated for 2.4 GHz BLE Coded PHY (125 kbps / S=8) and 1M/2M PHY:
 * - Reference distance d0 = 1.0 m, PL(d0) = 40.0 dB
 * - Transmit Power Tx = 0 dBm (standard phone), Receiver Sensitivity Rx_sens = -95 dBm
 * - Maximum link budget = 95 dB
 */

import { Obstacle } from './types';

export class RadioPropagationModel {
  private readonly txPowerDbm: number = 0; // 0 dBm
  private readonly rxSensitivityDbm: number = -95; // -95 dBm
  private readonly refLossDbm: number = 40.0; // PL(1m) at 2.4 GHz
  private readonly pathLossExponent: number;
  private readonly shadowingStdDev: number;
  private readonly obstacles: Obstacle[];

  constructor(
    pathLossExponent: number = 2.8,
    shadowingStdDev: number = 4.0,
    obstacles: Obstacle[] = [],
  ) {
    this.pathLossExponent = pathLossExponent;
    this.shadowingStdDev = shadowingStdDev;
    this.obstacles = obstacles;
  }

  /**
   * Calculates received signal strength (RSSI) in dBm between two nodes.
   */
  public computeRssi(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gaussianRandom: number = 0,
  ): { rssi: number; isConnected: boolean; distanceMeters: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distanceMeters = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));

    // 1. Log-distance path loss
    const distanceLoss = 10 * this.pathLossExponent * Math.log10(distanceMeters);

    // 2. Obstacle attenuation (concrete walls, rubble piles)
    let obstacleLoss = 0;
    for (const obs of this.obstacles) {
      if (this.lineIntersects(x1, y1, x2, y2, obs.x1, obs.y1, obs.x2, obs.y2)) {
        obstacleLoss += obs.attenuationDb;
      }
    }

    // 3. Shadowing / multipath fluctuation
    const shadowing = gaussianRandom * this.shadowingStdDev;

    const totalLoss = this.refLossDbm + distanceLoss + obstacleLoss + shadowing;
    const rssi = this.txPowerDbm - totalLoss;

    return {
      rssi: Math.round(rssi * 10) / 10,
      isConnected: rssi >= this.rxSensitivityDbm,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
    };
  }

  /**
   * Fast 2D segment intersection algorithm
   */
  private lineIntersects(
    p0_x: number,
    p0_y: number,
    p1_x: number,
    p1_y: number,
    p2_x: number,
    p2_y: number,
    p3_x: number,
    p3_y: number,
  ): boolean {
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;

    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

    return s >= 0 && s <= 1 && t >= 0 && t <= 1;
  }
}
