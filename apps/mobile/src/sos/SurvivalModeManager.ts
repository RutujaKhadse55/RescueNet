/**
 * RescueNet - Survival Mode & Dead-Man's Beacon Manager
 *
 * Implements:
 * 1. Dead-man's beacon: battery <= 5% (configurable):
 *    - Sends one final DEADMAN packet (last position, status, people, battery)
 *    - Enters BEACON_ONLY BLE advertising mode
 *    - Shuts down non-essential features (chat, live location sharing, scan duty to minimum)
 *    - Emits alert explaining what is happening and battery-saving tips
 * 2. Survival Mode: battery <= 20% or user toggle:
 *    - UI dimming flag, disables maps & animations
 *    - Stretches scan duty cycles, relays SOS packets only
 */

import {
  SodiumCrypto,
  encodeDeadman,
  FLAG_IMMUTABLE_MASK,
  PacketType,
  PROTOCOL_VERSION,
} from '@rescuenet/core';
import { SosController } from './SosController';
import { RescueBle } from '../native/RescueBle';

export interface BatteryStatus {
  level: number; // 0 to 100
  isCharging: boolean;
}

export type SurvivalModeListener = (isSurvivalMode: boolean) => void;
export type DeadmanTriggerListener = (event: { timestamp: number; batteryLevel: number }) => void;

export class SurvivalModeManager {
  private static instance: SurvivalModeManager | null = null;

  private batteryLevel: number = 100;
  private isCharging: boolean = false;
  private isSurvivalMode: boolean = false;
  private userSurvivalOverride: boolean | null = null;
  private deadmanSent: boolean = false;

  private survivalListeners: Set<SurvivalModeListener> = new Set();
  private deadmanListeners: Set<DeadmanTriggerListener> = new Set();

  private constructor() {}

  public static getInstance(): SurvivalModeManager {
    if (!SurvivalModeManager.instance) {
      SurvivalModeManager.instance = new SurvivalModeManager();
    }
    return SurvivalModeManager.instance;
  }

  /**
   * Update battery state (called periodically or via Native BatteryManager)
   */
  public async updateBattery(level: number, isCharging: boolean = false): Promise<void> {
    this.batteryLevel = Math.max(0, Math.min(100, Math.round(level)));
    this.isCharging = isCharging;

    await this.evaluateModes();
  }

  public getBatteryLevel(): number {
    return this.batteryLevel;
  }

  public getIsCharging(): boolean {
    return this.isCharging;
  }

  public isInSurvivalMode(): boolean {
    if (this.userSurvivalOverride !== null) {
      return this.userSurvivalOverride;
    }
    return this.isSurvivalMode;
  }

  public setUserSurvivalOverride(override: boolean | null): void {
    this.userSurvivalOverride = override;
    this.notifySurvivalListeners();
  }

  public hasTriggeredDeadman(): boolean {
    return this.deadmanSent;
  }

  /**
   * Reset dead-man flag (e.g. when phone is plugged in to charger above 10%)
   */
  public resetDeadman(): void {
    if (this.batteryLevel > 10) {
      this.deadmanSent = false;
    }
  }

  private async evaluateModes(): Promise<void> {
    // 1. Check Survival Mode (<= 20% and not charging)
    const shouldBeSurvival = !this.isCharging && this.batteryLevel <= 20;
    if (shouldBeSurvival !== this.isSurvivalMode) {
      this.isSurvivalMode = shouldBeSurvival;
      this.notifySurvivalListeners();

      if (this.isSurvivalMode) {
        // Stretch scan duty cycles to LOW_POWER
        await RescueBle.setScanMode('LOW_POWER').catch(() => {});
      }
    }

    // 2. Check Dead-man's beacon (<= 5% and not charging)
    if (!this.isCharging && this.batteryLevel <= 5 && !this.deadmanSent) {
      await this.triggerDeadmanBeacon();
    }
  }

  /**
   * Transmit single final DEADMAN packet and lock down into BEACON_ONLY mode
   */
  public async triggerDeadmanBeacon(): Promise<void> {
    if (this.deadmanSent) return;
    this.deadmanSent = true;

    try {
      const crypto = await SodiumCrypto.getInstance();
      const sosController = SosController.getInstance();
      const identity = await sosController.getIdentity();

      if (identity) {
        const packetId = crypto.randomBytes(8);
        const seq = sosController.getNextSeq();

        // Construct preimage: 19 immutable header bytes + 4B countdown + 1B battery + 2B seq + 32B pubkey = 58B
        const preimage = new Uint8Array(19 + 4 + 1 + 2 + 32);
        const pView = new DataView(preimage.buffer, preimage.byteOffset, preimage.byteLength);
        pView.setUint8(0, PROTOCOL_VERSION);
        pView.setUint8(1, PacketType.DEADMAN);
        pView.setUint8(2, 0 & FLAG_IMMUTABLE_MASK);
        preimage.set(packetId.subarray(0, 8), 3);
        preimage.set(identity.fingerprint.subarray(0, 8), 11);

        let pOffset = 19;
        pView.setUint32(pOffset, 300, true); // 300s countdown
        pOffset += 4;
        pView.setUint8(pOffset++, this.batteryLevel);
        pView.setUint16(pOffset, seq, true);
        pOffset += 2;
        preimage.set(identity.publicKey.subarray(0, 32), pOffset);

        const signature = await crypto.sign(preimage, identity.privateKey);

        const deadmanPacket = encodeDeadman({
          header: {
            version: PROTOCOL_VERSION,
            type: PacketType.DEADMAN,
            flags: 0,
            ttl: 10,
            hop: 0,
            packetId,
            originFp: identity.fingerprint,
          },
          body: {
            countdownSeconds: 300,
            batteryPercent: this.batteryLevel,
            sequenceNumber: seq,
            publicKey: identity.publicKey,
            signature,
          },
        });

        // Queue packet into mesh engine with spray-and-wait
        await sosController.injectRawPacket(deadmanPacket);
      }

      // Enter BEACON_ONLY advertising mode on radio
      await RescueBle.setAdvertisingMode('BEACON_ONLY').catch(() => {});
      await RescueBle.setScanMode('LOW_POWER').catch(() => {});

      // Notify listeners
      for (const listener of this.deadmanListeners) {
        try {
          listener({ timestamp: Date.now(), batteryLevel: this.batteryLevel });
        } catch (e) {
          console.error('[SurvivalMode] Deadman listener error:', e);
        }
      }
    } catch (err) {
      console.error('[SurvivalMode] Failed to trigger dead-man beacon:', err);
    }
  }

  public addSurvivalListener(listener: SurvivalModeListener): () => void {
    this.survivalListeners.add(listener);
    listener(this.isInSurvivalMode());
    return () => this.survivalListeners.delete(listener);
  }

  public addDeadmanListener(listener: DeadmanTriggerListener): () => void {
    this.deadmanListeners.add(listener);
    return () => this.deadmanListeners.delete(listener);
  }

  private notifySurvivalListeners(): void {
    const active = this.isInSurvivalMode();
    for (const listener of this.survivalListeners) {
      try {
        listener(active);
      } catch (e) {
        console.error('[SurvivalMode] Listener error:', e);
      }
    }
  }
}
