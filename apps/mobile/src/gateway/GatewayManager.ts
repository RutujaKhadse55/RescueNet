/**
 * RescueNet Gateway Mode Manager (Phase 10)
 * Turns a phone into an autonomous emergency data relay for rescue vehicles,
 * relief camps, and community hubs.
 * Keeps screen on, expands BLE byte budgets, runs continuous uplink loops,
 * and tracks uplink throughput.
 */

import { UplinkService } from '../uplink/UplinkService';
import { IBleTransport } from '../native/RescueBle';

export interface GatewayStats {
  isActive: boolean;
  totalBytesUploaded: number;
  totalPacketsUploaded: number;
  lastUploadTime?: string;
  uploadRateKbps: number;
  isPowerConnected: boolean;
  plugInAndForgetEnabled: boolean;
}

export class GatewayManager {
  private uplinkService: UplinkService;
  private transport?: IBleTransport;

  private isActive: boolean = false;
  private plugInAndForgetEnabled: boolean = true;
  private isPowerConnected: boolean = false;

  private totalBytesUploaded: number = 0;
  private totalPacketsUploaded: number = 0;
  private lastUploadTime?: string;
  private lastBytesMeasurement: number = 0;
  private lastMeasurementTime: number = Date.now();
  private currentThroughputKbps: number = 0;

  private loopIntervalTimer: NodeJS.Timeout | null = null;

  constructor(uplinkService: UplinkService, transport?: IBleTransport) {
    this.uplinkService = uplinkService;
    this.transport = transport;
  }

  public setTransport(transport: IBleTransport): void {
    this.transport = transport;
  }

  public isGatewayActive(): boolean {
    return this.isActive;
  }

  public isPlugInAndForget(): boolean {
    return this.plugInAndForgetEnabled;
  }

  public setPlugInAndForget(enabled: boolean): void {
    this.plugInAndForgetEnabled = enabled;
  }

  public getStats(): GatewayStats {
    return {
      isActive: this.isActive,
      totalBytesUploaded: this.totalBytesUploaded,
      totalPacketsUploaded: this.totalPacketsUploaded,
      lastUploadTime: this.lastUploadTime,
      uploadRateKbps: this.currentThroughputKbps,
      isPowerConnected: this.isPowerConnected,
      plugInAndForgetEnabled: this.plugInAndForgetEnabled,
    };
  }

  /**
   * Activates Gateway Mode
   */
  public async activate(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;

    // Expand BLE Transport parameters for high-volume gateway operation
    if (this.transport) {
      // Gateway role: continuous scanning, high duty cycle
      await this.transport
        .startAdvertising(
          'LOW_LATENCY',
          'gateway',
          { hasSos: false, lowBattery: false, beaconOnly: false },
          '00000000',
        )
        .catch(() => {});
      await this.transport.startScanning('LOW_LATENCY').catch(() => {});
    }

    // Continuous aggressive uplink loop (every 5 seconds)
    this.lastMeasurementTime = Date.now();
    this.lastBytesMeasurement = this.totalBytesUploaded;

    this.loopIntervalTimer = setInterval(async () => {
      if (!this.isActive) return;
      await this.performGatewayCycle();
    }, 5000);

    if (this.loopIntervalTimer && typeof this.loopIntervalTimer.unref === 'function') {
      this.loopIntervalTimer.unref();
    }

    // Initial cycle
    await this.performGatewayCycle();
  }

  /**
   * Deactivates Gateway Mode
   */
  public async deactivate(): Promise<void> {
    this.isActive = false;

    if (this.loopIntervalTimer) {
      clearInterval(this.loopIntervalTimer);
      this.loopIntervalTimer = null;
    }

    if (this.transport) {
      await this.transport
        .startAdvertising(
          'BALANCED',
          'survivor',
          { hasSos: false, lowBattery: false, beaconOnly: false },
          '00000000',
        )
        .catch(() => {});
    }
  }

  /**
   * Called by native power/battery listeners when charging state changes
   * ("Plug in and forget" mode)
   */
  public async onPowerStateChanged(connected: boolean): Promise<void> {
    this.isPowerConnected = connected;
    if (this.plugInAndForgetEnabled) {
      if (connected && !this.isActive) {
        await this.activate();
      } else if (!connected && this.isActive) {
        await this.deactivate();
      }
    }
  }

  /**
   * Called on system boot completion
   */
  public async onBootCompleted(): Promise<void> {
    if (this.plugInAndForgetEnabled && this.isPowerConnected) {
      await this.activate();
    }
  }

  private async performGatewayCycle(): Promise<void> {
    const res = await this.uplinkService.triggerUplink();
    if (res && res.accepted > 0) {
      const approxBytes = res.accepted * 140; // ~140 bytes per packet
      this.totalPacketsUploaded += res.accepted;
      this.totalBytesUploaded += approxBytes;
      this.lastUploadTime = new Date().toISOString();

      // Compute throughput in kbps
      const now = Date.now();
      const elapsedSeconds = Math.max(1, (now - this.lastMeasurementTime) / 1000);
      const bytesDiff = this.totalBytesUploaded - this.lastBytesMeasurement;
      this.currentThroughputKbps = (bytesDiff * 8) / (elapsedSeconds * 1000);

      this.lastBytesMeasurement = this.totalBytesUploaded;
      this.lastMeasurementTime = now;
    }
  }
}
