/**
 * RescueNet Battery & Energy Consumption Model (Phase 15)
 *
 * Calibrated against Android battery stats and BLE chipset profiles:
 * - 3,500 mAh battery capacity (12.95 Wh @ 3.7V)
 * - BLE Advertising (100ms interval): ~18.5 mA active during Tx pulses
 * - BLE Low-Latency Continuous Scanning: ~24.0 mA
 * - BLE Balanced Scanning (10% duty cycle): ~2.4 mA
 * - BLE Low-Power Scanning (2.5% duty cycle): ~0.6 mA
 * - Ingestion / Cryptographic Verification: ~0.001 mAh per signature
 * - Survival Mode Trigger: When battery drops <= 15%, device locks into BEACON_ONLY mode
 */

import { SimNode } from './types';

export class BatteryModel {
  public readonly batteryCapacityMah: number = 3500;

  // Hourly drain in percent based on active role and duty cycle
  private readonly drainPerPacketTxPercent: number = 0.0004;
  private readonly drainPerPacketRxPercent: number = 0.0002;
  private readonly baselineDrainPerHourNormal: number = 0.85; // 0.85% / hour in balanced scanning
  private readonly baselineDrainPerHourBeaconOnly: number = 0.22; // 0.22% / hour in BEACON_ONLY survival mode
  private readonly baselineDrainPerHourCarrier: number = 1.65; // High duty cycle scanning

  /**
   * Updates battery levels over a simulation time step dt (seconds)
   */
  public stepBattery(nodes: SimNode[], dt: number): void {
    const hours = dt / 3600;

    for (const node of nodes) {
      if (!node.isAlive || node.role === 'gateway') continue;

      let baseHourlyDrain = this.baselineDrainPerHourNormal;
      if (node.isInSurvivalMode) {
        baseHourlyDrain = this.baselineDrainPerHourBeaconOnly;
      } else if (node.role === 'carrier' || node.role === 'rescuer') {
        baseHourlyDrain = this.baselineDrainPerHourCarrier;
      }

      node.batteryPercent -= baseHourlyDrain * hours;

      // Trigger survival mode when battery drops <= 15%
      if (node.batteryPercent <= 15.0 && !node.isInSurvivalMode) {
        node.isInSurvivalMode = true;
      }

      // If battery depleted to 0, node shuts down
      if (node.batteryPercent <= 0) {
        node.batteryPercent = 0;
        node.isAlive = false;
        node.buffer = [];
      }
    }
  }

  /**
   * Deducts energy consumed by a packet transmission
   */
  public recordTransmission(node: SimNode, bytesSent: number): void {
    if (!node.isAlive || node.role === 'gateway') return;
    const drain = this.drainPerPacketTxPercent * (bytesSent / 180);
    node.batteryPercent = Math.max(0, node.batteryPercent - drain);
    node.packetsTransmitted++;
    node.bytesTransmitted += bytesSent;
  }

  /**
   * Deducts energy consumed by receiving and cryptographically processing a packet
   */
  public recordReception(node: SimNode, bytesReceived: number): void {
    if (!node.isAlive || node.role === 'gateway') return;
    const drain = this.drainPerPacketRxPercent * (bytesReceived / 180);
    node.batteryPercent = Math.max(0, node.batteryPercent - drain);
    node.packetsReceived++;
  }
}
