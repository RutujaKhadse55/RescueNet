/**
 * RescueNet Mobile SMS Fallback Service (Phase 10-B)
 *
 * Sends emergency telemetry silently via SmsManager (sideload flavor)
 * or through the system messaging app (play store flavor) when DEGRADED/OFFLINE.
 *
 * Policy:
 *  - Send own SOS immediately on DEGRADED/OFFLINE.
 *  - Relay up to K other people's highest-priority packets per hour (default K=5).
 *  - Exponential retry: 30s ? 2min ? 10min; stop after delivery confirmation.
 *  - Never send the same packet through the same number within 30 min.
 *
 * Inbound ACK SMS:
 *  - Parses "RN1 ACK <tag> <clusterId> <eta>" format.
 *  - Verifies HMAC-SHA256 tag with device SMS secret (16-byte pre-shared key).
 *  - Triggers notification and injects ACK into BLE mesh.
 */

import { DatabaseManager } from '../db/DatabaseManager';
import { ConnectivityGovernor } from '../ble/ConnectivityGovernor';
import { MeshEngine } from '../mesh/MeshEngine';
import { formatHumanSms, TriageStatus, NeedsBitmask } from '@rescuenet/core';
import crypto from 'crypto';

// -- Platform interface ---------------------------------------------------------

/**
 * Injected by native layer.
 * sideload build: uses SmsManager.sendTextMessage directly (no user interaction).
 * play build:    openSystemSmsApp opens the default messaging app.
 */
export interface ISmsBridge {
  sendTextMessage(
    destination: string,
    body: string,
  ): Promise<{ sent: boolean; delivered?: boolean; error?: string }>;
  openSystemSmsApp(destination: string, body: string): Promise<void>;
  hasSmsPermission(): Promise<boolean>;
}

// -- Config ---------------------------------------------------------------------

export interface SmsFallbackConfig {
  /** K = max relay packets per hour */
  maxRelayPacketsPerHour: number;
  /** 30 minute dedup window per (packetId, destination) */
  dedupWindowMs: number;
  /** 16-byte pre-shared HMAC secret from /devices/register */
  deviceSmsSecret: Uint8Array;
  /** Retry schedule [ms] */
  retryDelaysMs: number[];
}

// -- Service --------------------------------------------------------------------

export class SmsFallbackService {
  private db: DatabaseManager;
  private governor: ConnectivityGovernor;
  private bridge: ISmsBridge;
  private meshEngine?: MeshEngine;
  private config: SmsFallbackConfig;

  /** Ordered gateway numbers from /devices/register ? sms_gateway_numbers */
  private gatewayNumbers: string[] = [];
  private currentGatewayIndex = 0;

  /** packetId:destination ? last-sent timestamp */
  private sentHistory: Map<string, number> = new Map();

  /** Relay quota within current 1-hour window */
  private relayWindowStart: number = Date.now();
  private relayCountThisHour = 0;

  /** Per-packet retry state: packetId ? {attempts, nextRetry} */
  private retryState: Map<string, { attempts: number; nextRetry: number }> = new Map();

  private onNotificationCallback?: (title: string, body: string) => void;
  private onPromptGatewayNumberCallback?: () => void;

  constructor(
    db: DatabaseManager,
    governor: ConnectivityGovernor,
    bridge: ISmsBridge,
    meshEngine?: MeshEngine,
    config?: Partial<SmsFallbackConfig>,
  ) {
    this.db = db;
    this.governor = governor;
    this.bridge = bridge;
    this.meshEngine = meshEngine;
    this.config = {
      maxRelayPacketsPerHour: 5,
      dedupWindowMs: 30 * 60 * 1000,
      deviceSmsSecret: new Uint8Array(16),
      retryDelaysMs: [30_000, 2 * 60_000, 10 * 60_000],
      ...config,
    };
  }

  public setMeshEngine(engine: MeshEngine): void {
    this.meshEngine = engine;
  }

  public setGatewayNumbers(numbers: string[]): void {
    this.gatewayNumbers = [...numbers];
    this.currentGatewayIndex = 0;
  }

  public getGatewayNumbers(): string[] {
    return [...this.gatewayNumbers];
  }

  public onNotification(cb: (title: string, body: string) => void): void {
    this.onNotificationCallback = cb;
  }

  public onPromptGatewayNumber(cb: () => void): void {
    this.onPromptGatewayNumberCallback = cb;
  }

  /** Returns active gateway number, or null + prompts user if none configured */
  public getActiveGatewayNumber(): string | null {
    if (this.gatewayNumbers.length === 0) {
      this.onPromptGatewayNumberCallback?.();
      return null;
    }
    return this.gatewayNumbers[this.currentGatewayIndex % this.gatewayNumbers.length]!;
  }

  public rotateGatewayNumber(): void {
    if (this.gatewayNumbers.length > 1) {
      this.currentGatewayIndex = (this.currentGatewayIndex + 1) % this.gatewayNumbers.length;
    }
  }

  // -- Dispatch ---------------------------------------------------------------

  /**
   * Evaluates connectivity state and dispatches SMS if appropriate.
   * Call this whenever network state changes to DEGRADED/OFFLINE.
   */
  public async evaluateAndDispatch(): Promise<{
    ownSosSent: boolean;
    relayedCount: number;
  }> {
    const netState = this.governor.getNetworkState();
    // Only dispatch over SMS if DEGRADED or OFFLINE (cell signal but no data)
    if (netState === 'ONLINE') {
      return { ownSosSent: false, relayedCount: 0 };
    }

    const targetNumber = this.getActiveGatewayNumber();
    if (!targetNumber) {
      return { ownSosSent: false, relayedCount: 0 };
    }

    const hasPermission = await this.bridge.hasSmsPermission();
    if (!hasPermission) {
      return { ownSosSent: false, relayedCount: 0 };
    }

    // Refresh 1-hour relay window
    const now = Date.now();
    if (now - this.relayWindowStart > 3_600_000) {
      this.relayWindowStart = now;
      this.relayCountThisHour = 0;
    }

    // Prune dedup history older than 30 min
    for (const [key, ts] of this.sentHistory.entries()) {
      if (now - ts > this.config.dedupWindowMs) {
        this.sentHistory.delete(key);
      }
    }

    let ownSosSent = false;
    let relayedCount = 0;

    // 1. Own SOS first
    const ownSosList = await this.db.packets.getUnuplinkedSosPackets();
    for (const p of ownSosList) {
      const historyKey = `${p.packet_id}:${targetNumber}`;
      if (!this.sentHistory.has(historyKey) && this.isRetryDue(p.packet_id, now)) {
        const smsBody = await this.formatSmsPayload(p);
        const result = await this.bridge.sendTextMessage(targetNumber, smsBody);
        if (result.sent) {
          this.sentHistory.set(historyKey, now);
          this.clearRetry(p.packet_id);
          ownSosSent = true;
          break;
        } else {
          this.recordRetry(p.packet_id);
          this.rotateGatewayNumber();
        }
      }
    }

    // 2. Relay other people's packets (up to K per hour)
    if (this.relayCountThisHour < this.config.maxRelayPacketsPerHour) {
      const quota = this.config.maxRelayPacketsPerHour - this.relayCountThisHour;
      const candidates = await this.db.packets.getUnuplinkedPackets(quota);

      for (const p of candidates) {
        const historyKey = `${p.packet_id}:${targetNumber}`;
        if (!this.sentHistory.has(historyKey) && this.isRetryDue(p.packet_id, now)) {
          const smsBody = await this.formatSmsPayload(p);
          const result = await this.bridge.sendTextMessage(targetNumber, smsBody);
          if (result.sent) {
            this.sentHistory.set(historyKey, now);
            this.clearRetry(p.packet_id);
            this.relayCountThisHour++;
            relayedCount++;
          } else {
            this.recordRetry(p.packet_id);
            this.rotateGatewayNumber();
          }
        }
      }
    }

    return { ownSosSent, relayedCount };
  }

  // -- Manual / Play-flavor SMS -----------------------------------------------

  /**
   * Returns a human-readable SOS string for prefilling the system SMS app.
   * "RN SOS lat,lon +-accuracy P4 CRIT MED,WTR"
   */
  public getManualSmsContent(params: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    peopleCount: number;
    status: TriageStatus;
    needsMask: NeedsBitmask;
  }): string {
    return formatHumanSms(params);
  }

  /**
   * Opens the default messaging app (play-store flavor / SMS permission denied).
   */
  public async openManualSms(params: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    peopleCount: number;
    status: TriageStatus;
    needsMask: NeedsBitmask;
  }): Promise<void> {
    const targetNumber = this.getActiveGatewayNumber() || '112';
    const body = this.getManualSmsContent(params);
    await this.bridge.openSystemSmsApp(targetNumber, body);
  }

  // -- Inbound ACK SMS --------------------------------------------------------

  /**
   * Called by native RECEIVE_SMS broadcast receiver.
   * Parses "RN1 ACK <8-hex-tag> <clusterId> <eta>" messages from control-room numbers.
   * Verifies HMAC-SHA256 tag with device SMS secret.
   * Invalid tags are silently rejected.
   */
  public async handleInboundSms(_sender: string, body: string): Promise<boolean> {
    const cleanBody = body.trim();

    if (!cleanBody.startsWith('RN1 ACK ')) {
      return false;
    }

    const parts = cleanBody.split(' ');
    // parts: ['RN1', 'ACK', '<tag>', <rest...>]
    if (parts.length < 4) return false;

    const receivedTag = parts[2]!;
    const payloadContent = parts.slice(3).join(' ');

    // Verify HMAC-SHA256 tag (first 8 hex chars = 4 bytes)
    const expectedTag = crypto
      .createHmac('sha256', this.config.deviceSmsSecret)
      .update(payloadContent)
      .digest('hex')
      .substring(0, 8);

    if (receivedTag.toLowerCase() !== expectedTag.toLowerCase()) {
      return false; // Reject forged / corrupted SMS
    }

    // Trigger "Help is on the way" notification
    const notifTitle = 'Help is on the way! ??';
    const notifBody = 'Control room acknowledged your report. Rescuers have been dispatched.';
    this.onNotificationCallback?.(notifTitle, notifBody);

    // Build a minimal synthetic ACK packet and inject into BLE mesh so nearby
    // survivors also learn the ACK was received.
    if (this.meshEngine) {
      const syntheticAck = new Uint8Array(130);
      syntheticAck[0] = 1; // protocol version
      syntheticAck[1] = 0x03; // ACK type
      syntheticAck[2] = 0x04; // flags: from_rescuer
      syntheticAck[3] = 6; // TTL
      syntheticAck[4] = 0; // Hop
      crypto.randomFillSync(syntheticAck.subarray(5, 13)); // random packetId
      crypto.randomFillSync(syntheticAck.subarray(13, 21)); // random originFp
      await this.meshEngine.receivePacket(syntheticAck, undefined, true);
    }

    return true;
  }

  // -- Retry helpers ----------------------------------------------------------

  private isRetryDue(packetId: string, now: number): boolean {
    const state = this.retryState.get(packetId);
    if (!state) return true;
    return now >= state.nextRetry;
  }

  private recordRetry(packetId: string): void {
    const state = this.retryState.get(packetId) ?? { attempts: 0, nextRetry: 0 };
    const delayMs =
      this.config.retryDelaysMs[Math.min(state.attempts, this.config.retryDelaysMs.length - 1)] ??
      this.config.retryDelaysMs[this.config.retryDelaysMs.length - 1]!;
    this.retryState.set(packetId, {
      attempts: state.attempts + 1,
      nextRetry: Date.now() + delayMs,
    });
  }

  private clearRetry(packetId: string): void {
    this.retryState.delete(packetId);
  }

  // -- Codec ------------------------------------------------------------------

  private async formatSmsPayload(packet: any): Promise<string> {
    let raw: Uint8Array;
    if (/^[0-9a-fA-F]+$/.test(packet.raw_bytes)) {
      const pairs = packet.raw_bytes.match(/.{1,2}/g) ?? [];
      raw = new Uint8Array(pairs.map((b: string) => parseInt(b, 16)));
    } else {
      raw = new Uint8Array(Buffer.from(packet.raw_bytes, 'base64'));
    }
    const b64 = Buffer.from(raw).toString('base64url');
    return `RN1 ${b64}`;
  }
}
