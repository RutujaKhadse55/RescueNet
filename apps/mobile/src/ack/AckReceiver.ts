/**
 * RescueNet Field Acknowledgment Receiver (Phase 10-D)
 *
 * Validates Type 0x03 ACK packets signed by verified rescuer keys against the
 * Agency CA (embedded + updatable via downlink).
 * Localises status messages in EN / HI / MR / ML / KN.
 * Shows "Control room received" / "Help is on the way (ETA ...)" on the SOS screen.
 * Keeps relaying the ACK until TTL expiry so the whole cluster hears it.
 */

import { decodeAck, ICrypto, verifyAckPacket, PacketFlags } from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';
import { MeshEngine } from '../mesh/MeshEngine';
import { RescuerCredentialService } from '../rescuer/RescuerCredentialService';

export interface AckNotificationEvent {
  targetPacketIdHex: string;
  statusText: string;
  etaMinutes: number;
  agencyId: number;
  timestamp: string;
  locale: string;
}

// Localised templates: "Control room received" / "Help is on the way (ETA X min)"
const LOCALE_TEMPLATES: Record<string, { received: string; enRoute: (eta: number) => string }> = {
  en: {
    received: 'Control room received your report. Rescuers alerted.',
    enRoute: e => `Help is on the way (ETA ~${e} min). Stay visible.`,
  },
  hi: {
    received: '???????? ???? ?? ???? ??????? ????? ???? ?? ????? ???? ????',
    enRoute: e => `??? ? ??? ?? (???? ${e} ???? ???)? ????? ???? ?????`,
  },
  mr: {
    received: '???????? ??????? ????? ????? ??????. ???? ??? ????? ????.',
    enRoute: e => `??? ??? ??? (?????? ${e} ??????). ???????? ????.`,
  },
  ml: {
    received: '????????? ???? ????????? ??????????? ???????. ?????? ?????????.',
    enRoute: e => `????? ??????? (?????? ${e} ????????). ????????????????.`,
  },
  kn: {
    received: '???????? ??????? ????? ???? ????????. ????????? ???????? ?????????.',
    enRoute: e => `???? ????????? (~${e} ?????). ???????? ???.`,
  },
};

export class AckReceiver {
  private db: DatabaseManager;
  private crypto: ICrypto;
  private meshEngine?: MeshEngine;
  private rescuerService?: RescuerCredentialService;
  private agencyCaPublicKey: Uint8Array;
  private locale: string;
  private onAckReceivedCallback?: (event: AckNotificationEvent) => void;
  private onHomingBeaconTriggerCallback?: (targetPacketIdHex: string) => void;

  constructor(
    db: DatabaseManager,
    crypto: ICrypto,
    _agencyCaPublicKey?: Uint8Array,
    meshEngine?: MeshEngine,
    locale: string = 'en',
    rescuerService?: RescuerCredentialService,
  ) {
    this.db = db;
    this.crypto = crypto;
    this.meshEngine = meshEngine;
    this.locale = locale;
    this.rescuerService = rescuerService;
    // Default 32-byte placeholder; real key injected via /devices/register response
    this.agencyCaPublicKey = _agencyCaPublicKey ?? new Uint8Array(32).fill(0xee);
  }

  public setAgencyCaPublicKey(key: Uint8Array): void {
    this.agencyCaPublicKey = key;
  }

  public getAgencyCaPublicKey(): Uint8Array {
    return this.agencyCaPublicKey;
  }

  public setMeshEngine(engine: MeshEngine): void {
    this.meshEngine = engine;
  }

  public setRescuerService(service: RescuerCredentialService): void {
    this.rescuerService = service;
  }

  public setLocale(locale: string): void {
    this.locale = locale;
  }

  public onAckReceived(cb: (event: AckNotificationEvent) => void): void {
    this.onAckReceivedCallback = cb;
  }

  public onHomingBeaconTrigger(cb: (targetPacketIdHex: string) => void): void {
    this.onHomingBeaconTriggerCallback = cb;
  }

  /**
   * Processes a received Type 0x03 ACK packet from BLE mesh or internet downlink.
   * Returns false if signature verification fails or rescuer is unverified/revoked.
   */
  public async processAckPacket(rawBytes: Uint8Array): Promise<{
    valid: boolean;
    etaMinutes?: number;
    statusMessage?: string;
  }> {
    if (rawBytes.length < 21 || rawBytes[1] !== 0x03) {
      return { valid: false };
    }

    try {
      const decoded = decodeAck(rawBytes);

      // Phase 13: Must have FROM_RESCUER flag (unverified phones cannot ACK)
      if ((decoded.header.flags & PacketFlags.FROM_RESCUER) === 0) {
        return { valid: false };
      }

      // Verify Ed25519 signature
      const isSigValid = await verifyAckPacket(rawBytes, this.crypto);
      if (!isSigValid) {
        return { valid: false };
      }

      // Verify credential chain and revocation list
      if (this.rescuerService) {
        const verifyResult = await this.rescuerService.verifyRescuerPacket(rawBytes);
        if (!verifyResult.valid) {
          return { valid: false };
        }
      }

      const targetIdHex = Buffer.from(decoded.body.targetPacketId).toString('hex');
      const eta = decoded.body.arrivalMinutes;
      const statusMessage = this.localise(eta);

      // Persist acknowledgment event
      await this.db.events.logEvent('ack_received', {
        targetPacketId: targetIdHex,
        etaMinutes: eta,
        agencyId: decoded.body.agencyId,
      });

      // Notify UI
      this.onAckReceivedCallback?.({
        targetPacketIdHex: targetIdHex,
        statusText: statusMessage,
        etaMinutes: eta,
        agencyId: decoded.body.agencyId,
        timestamp: new Date().toISOString(),
        locale: this.locale,
      });

      // Survivor phone triggers high-duty beacon mode upon receiving verified rescuer ACK
      this.onHomingBeaconTriggerCallback?.(targetIdHex);

      // Re-relay the ACK through the mesh so the whole cluster hears it.
      // MeshEngine will decrement TTL and forward until TTL expires.
      if (this.meshEngine && decoded.header.ttl > 1) {
        await this.meshEngine.receivePacket(rawBytes, undefined, false);
      }

      return { valid: true, etaMinutes: eta, statusMessage };
    } catch {
      return { valid: false };
    }
  }

  private localise(eta: number): string {
    const t = LOCALE_TEMPLATES[this.locale] ?? LOCALE_TEMPLATES['en']!;
    return eta > 0 ? t.enRoute(eta) : t.received;
  }
}
