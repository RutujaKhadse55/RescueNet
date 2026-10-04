/**
 * RescueNet Homing Service (Phase 13)
 * Implements BLE signal strength tracking and directional guidance for responders
 * making the final approach to trapped survivors.
 *
 * Smooths raw RSSI via Kalman filtering and 5-8s moving average window.
 * Computes trend (Warmer / Colder / Steady), 0-5 signal bars, and pulse rate.
 * Dispatches signed REACHED acknowledgment upon successful location.
 */

import { HomingEngine, HomingSignalState, createAndSignAck, PacketFlags } from '@rescuenet/core';
import { IBleTransport } from '../native/RescueBle';
import { DatabaseManager } from '../db/DatabaseManager';
import { MeshEngine } from '../mesh/MeshEngine';
import { RescuerCredentialService } from './RescuerCredentialService';

export interface HomingTarget {
  targetId: string; // clusterId or packetId hex
  originFpPrefix?: string; // 8 hex chars (4 bytes)
  title: string;
}

export type PulseType = 'audio' | 'haptic' | 'both';

export class HomingService {
  private transport: IBleTransport;
  private db: DatabaseManager;
  private meshEngine: MeshEngine;
  private rescuerService: RescuerCredentialService;
  private homingEngine: HomingEngine;

  private currentTarget: HomingTarget | null = null;
  private isHomingActive: boolean = false;
  private unsubscribeRssi?: () => void;
  private pulseTimer: NodeJS.Timeout | null = null;
  private onStateChangeCallback?: (state: HomingSignalState) => void;
  private onPulseCallback?: (type: PulseType, intervalMs: number) => void;

  constructor(
    transport: IBleTransport,
    db: DatabaseManager,
    meshEngine: MeshEngine,
    rescuerService: RescuerCredentialService,
  ) {
    this.transport = transport;
    this.db = db;
    this.meshEngine = meshEngine;
    this.rescuerService = rescuerService;
    this.homingEngine = new HomingEngine();
  }

  public isRunning(): boolean {
    return this.isHomingActive;
  }

  public getTarget(): HomingTarget | null {
    return this.currentTarget;
  }

  public getState(): HomingSignalState {
    return this.homingEngine.getState();
  }

  public onStateChange(cb: (state: HomingSignalState) => void): void {
    this.onStateChangeCallback = cb;
  }

  public onPulse(cb: (type: PulseType, intervalMs: number) => void): void {
    this.onPulseCallback = cb;
  }

  /**
   * Starts homing mode on a chosen survivor cluster or origin fingerprint.
   * Switches BLE scanner to LOW_LATENCY for continuous signal sampling.
   */
  public async startHoming(target: HomingTarget): Promise<void> {
    this.stopHoming();

    this.currentTarget = target;
    this.isHomingActive = true;
    this.homingEngine.reset();

    // 1. Switch BLE scanning to LOW_LATENCY for fast real-time RSSI updates
    await this.transport.setScanMode('LOW_LATENCY');

    // 2. Listen for RSSI samples matching target device or origin prefix
    this.unsubscribeRssi = this.transport.onRssiSample((deviceId: string, rssi: number) => {
      if (!this.isHomingActive || !this.currentTarget) return;

      // In real BLE advertising, deviceId or manufacturer data carries originFpPrefix.
      // Filter if target has specific origin prefix
      if (this.currentTarget.originFpPrefix) {
        const cleanPrefix = this.currentTarget.originFpPrefix.toLowerCase();
        const cleanDevice = deviceId.toLowerCase().replace(/[^a-f0-9]/g, '');
        if (
          !cleanDevice.includes(cleanPrefix) &&
          !deviceId.includes(this.currentTarget.originFpPrefix)
        ) {
          // If explicitly designated target prefix does not match, ignore unrelated signals
          // (Unless targetId matches deviceId directly)
          if (deviceId !== this.currentTarget.targetId) {
            return;
          }
        }
      }

      this.feedRssiSample(rssi);
    });

    // 3. Start audio/haptic pulse cycle
    this.scheduleNextPulse();

    await this.db.events.logEvent('homing_started', {
      targetId: target.targetId,
      prefix: target.originFpPrefix,
      title: target.title,
    });
  }

  /**
   * Feeds an incoming RSSI measurement into the signal processing engine.
   * Public for testing and simulation injection.
   */
  public feedRssiSample(rawRssi: number, timestampMs: number = Date.now()): HomingSignalState {
    const newState = this.homingEngine.processRssi(rawRssi, timestampMs);
    this.onStateChangeCallback?.(newState);
    return newState;
  }

  /**
   * Schedules pulse ticks according to current smoothed signal proximity
   */
  private scheduleNextPulse(): void {
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }

    if (!this.isHomingActive) return;

    const state = this.homingEngine.getState();
    const interval = Math.max(100, Math.min(1500, state.pulseIntervalMs));

    this.pulseTimer = setTimeout(() => {
      if (this.isHomingActive) {
        this.onPulseCallback?.('both', interval);
        this.scheduleNextPulse();
      }
    }, interval);
  }

  /**
   * "Found them" button action:
   * Emits a signed REACHED acknowledgment (status = 3: OnScene / Reached)
   * under the rescuer's verified credential, updates the cluster status,
   * and ends active homing mode.
   */
  public async markFound(): Promise<{ success: boolean; ackPacketHex?: string }> {
    if (!this.currentTarget) {
      return { success: false };
    }

    const cred = this.rescuerService.getActiveCredential();
    const keyPair = this.meshEngine.getKeyPair();

    if (!cred || !keyPair) {
      // Must be authenticated rescuer to sign REACHED packet
      return { success: false };
    }

    // Convert targetId to 8-byte targetPacketId buffer
    const targetBuffer = new Uint8Array(8);
    const cleanHex = this.currentTarget.targetId
      .replace(/[^a-f0-9]/gi, '')
      .padEnd(16, '0')
      .slice(0, 16);
    targetBuffer.set(Buffer.from(cleanHex, 'hex'));

    const agencyIdNum = parseInt(cred.agencyId, 10) || 1;

    // Create signed ACK with status = 3 (REACHED) and FROM_RESCUER flag
    const ackBytes = await createAndSignAck(
      {
        flags: PacketFlags.FROM_RESCUER,
        targetPacketId: targetBuffer,
        arrivalMinutes: 0,
        status: 3, // OnScene / Reached
        agencyId: agencyIdNum,
        keyPair,
      },
      this.db.getCrypto(),
    );

    // Re-relay through local mesh engine
    await this.meshEngine.createAndStorePacket(ackBytes);

    // Update cluster state in local database
    await this.db.clusters.updateStatus(this.currentTarget.targetId, 'reached');
    await this.db.events.logEvent('rescuer_marked_reached', {
      targetId: this.currentTarget.targetId,
      rescuerBadge: cred.badgeNumber,
      rescuerName: cred.rescuerName,
    });

    // Stop homing mode
    this.stopHoming();

    return {
      success: true,
      ackPacketHex: Buffer.from(ackBytes).toString('hex'),
    };
  }

  /**
   * Stops active homing mode, restores scan mode to BALANCED, clears timers.
   */
  public stopHoming(): void {
    if (this.unsubscribeRssi) {
      this.unsubscribeRssi();
      this.unsubscribeRssi = undefined;
    }

    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }

    if (this.isHomingActive) {
      this.isHomingActive = false;
      this.transport.setScanMode('BALANCED').catch(() => {});
    }

    this.currentTarget = null;
  }
}
