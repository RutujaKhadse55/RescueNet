/**
 * RescueNet Packet Validation Pipeline
 * Enforces cryptographic validity, timestamp freshness, replay protection,
 * TTL/hop constraints, origin rate limiting, and Rule 3 low-trust SOS handling.
 */

import {
  ICrypto,
  PacketType,
  PacketFlags,
  PROTOCOL_VERSION,
  decodeHeader,
  decodeSos,
  verifySosPacket,
  HEADER_SIZE,
} from '@rescuenet/core';
import { MeshPolicy, PacketValidationResult, PacketRejectionReason } from './types';
import { DatabaseManager } from '../db/DatabaseManager';
import { RescuerCredentialService } from '../rescuer/RescuerCredentialService';

export class PacketValidator {
  private crypto: ICrypto;
  private db: DatabaseManager;
  private policy: MeshPolicy;
  private rescuerService?: RescuerCredentialService;
  private serverTimeOffsetSeconds: number = 0;
  private bannedPublicKeys: Set<string> = new Set();
  private floodTimestamps: number[] = [];
  private isCircuitBreakerTripped: boolean = false;
  private readonly floodThresholdPerMinute: number = 120; // 2 pkts/sec sustained

  // In-memory sliding windows and anti-replay tables
  private seenPacketIds: Set<string> = new Set();
  private seenNonces: Set<number> = new Set();
  private originHighestSeq: Map<string, number> = new Map();
  private originRateWindows: Map<string, number[]> = new Map();

  constructor(
    crypto: ICrypto,
    db: DatabaseManager,
    policy: MeshPolicy,
    rescuerService?: RescuerCredentialService,
  ) {
    this.crypto = crypto;
    this.db = db;
    this.policy = policy;
    this.rescuerService = rescuerService;
  }

  public setRescuerService(service: RescuerCredentialService): void {
    this.rescuerService = service;
  }

  public setServerTimeOffset(offsetSeconds: number): void {
    this.serverTimeOffsetSeconds = offsetSeconds;
  }

  public getServerTimeOffset(): number {
    return this.serverTimeOffsetSeconds;
  }

  public banKey(pubkeyHex: string): void {
    this.bannedPublicKeys.add(pubkeyHex.toLowerCase());
  }

  public unbanKey(pubkeyHex: string): void {
    this.bannedPublicKeys.delete(pubkeyHex.toLowerCase());
  }

  public isKeyBanned(pubkeyHex: string): boolean {
    return this.bannedPublicKeys.has(pubkeyHex.toLowerCase());
  }

  public isCircuitBreakerActive(): boolean {
    return this.isCircuitBreakerTripped;
  }

  /**
   * Validates a raw packet according to the strict validation pipeline
   */
  public async validatePacket(
    rawBytes: Uint8Array,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): Promise<PacketValidationResult> {
    const effectiveNow = nowSeconds + this.serverTimeOffsetSeconds;
    if (rawBytes.length < HEADER_SIZE) {
      await this.logRejection('corrupted_packet', 'packet_too_short');
      return { valid: false, lowTrust: false, reason: 'corrupted_packet' };
    }

    let header;
    try {
      const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
      header = decodeHeader(view);
    } catch {
      await this.logRejection('corrupted_packet', 'header_parse_failure');
      return { valid: false, lowTrust: false, reason: 'corrupted_packet' };
    }

    // 1. Version check
    if (header.version !== PROTOCOL_VERSION) {
      await this.logRejection('bad_version', `version_${header.version}`);
      return { valid: false, lowTrust: false, reason: 'bad_version' };
    }

    // 2. TTL and Hop check
    if (header.ttl <= 0) {
      await this.logRejection('ttl_exhausted', `ttl_${header.ttl}`);
      return { valid: false, lowTrust: false, reason: 'ttl_exhausted' };
    }
    if (header.hop > 10) {
      await this.logRejection('hop_limit_reached', `hop_${header.hop}`);
      return { valid: false, lowTrust: false, reason: 'hop_limit_reached' };
    }

    const packetIdHex = Array.from(header.packetId)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(header.originFp)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 2.1 Check if origin key is banned
    if (this.bannedPublicKeys.has(originFpHex.toLowerCase())) {
      await this.logRejection('invalid_signature', 'origin_key_banned');
      return { valid: false, lowTrust: false, reason: 'invalid_signature' };
    }

    // 2.2 Update flood window and circuit breaker
    this.floodTimestamps.push(effectiveNow);
    const cutoff = effectiveNow - 60;
    this.floodTimestamps = this.floodTimestamps.filter(t => t >= cutoff);
    this.isCircuitBreakerTripped = this.floodTimestamps.length > this.floodThresholdPerMinute;

    // 3. Deduplication by packet_id
    if (this.seenPacketIds.has(packetIdHex)) {
      return { valid: false, lowTrust: false }; // Deduplicated, silent ignore
    }

    // Check DB deduplication as well
    const alreadyStored = await this.db.packets.getPacketById(packetIdHex);
    if (alreadyStored) {
      this.seenPacketIds.add(packetIdHex);
      return { valid: false, lowTrust: false };
    }

    // 4. Packet-type specific validation and timestamp checks
    let packetTimestamp = effectiveNow;
    let sequenceNumber = 0;
    let packetNonce: number | undefined = undefined;
    const isSos = header.type === PacketType.SOS;

    if (isSos) {
      try {
        const sos = decodeSos(rawBytes);
        packetTimestamp = sos.body.timestamp;
        sequenceNumber = sos.body.sequenceNumber;
        packetNonce = sos.body.nonce;
      } catch {
        await this.logRejection('corrupted_packet', 'sos_body_decode_failed');
        return { valid: false, lowTrust: false, reason: 'corrupted_packet' };
      }
    } else if (header.type === PacketType.ACK) {
      // ACK packets do not embed a separate timestamp; bounded by TTL and retention
      packetTimestamp = effectiveNow;
    } else {
      // For generic packets, extract timestamp if available in first 4 bytes of body
      if (rawBytes.length >= HEADER_SIZE + 4) {
        const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
        packetTimestamp = view.getUint32(HEADER_SIZE, true);
      }
    }

    // 5. Timestamp validation: reject > 5 min in future or older than retention
    if (packetTimestamp > effectiveNow + 300) {
      await this.logRejection(
        'future_timestamp',
        `timestamp_${packetTimestamp}_vs_${effectiveNow}`,
      );
      return { valid: false, lowTrust: false, reason: 'future_timestamp' };
    }

    const retentionLimit = this.getRetentionWindow(header.type);
    if (effectiveNow - packetTimestamp > retentionLimit) {
      await this.logRejection('expired_timestamp', `age_${effectiveNow - packetTimestamp}`);
      return { valid: false, lowTrust: false, reason: 'expired_timestamp' };
    }

    // 6. Anti-replay checks: sequence number & nonce
    if (sequenceNumber > 0) {
      const highestSeen = this.originHighestSeq.get(originFpHex) ?? 0;
      if (sequenceNumber <= highestSeen) {
        await this.logRejection('replay_seq', `seq_${sequenceNumber}_highest_${highestSeen}`);
        return { valid: false, lowTrust: false, reason: 'replay_seq' };
      }
    }

    if (packetNonce !== undefined) {
      if (this.seenNonces.has(packetNonce)) {
        await this.logRejection('replay_nonce', `nonce_${packetNonce}`);
        return { valid: false, lowTrust: false, reason: 'replay_nonce' };
      }
    }

    // 7. Signature verification & Rule 3 (Unsigned/Unverifiable SOS from unknown origin)
    let isLowTrust = false;
    if (isSos) {
      const sigValid = await verifySosPacket(rawBytes, this.crypto);
      if (!sigValid) {
        // RULE 3: Store and forward with low-trust flag, do not drop!
        isLowTrust = true;
        await this.db.events.logEvent('packet_low_trust_forward', {
          packetIdHex,
          originFpHex,
          reason: 'unverifiable_signature',
        });
      }
    }

    // 7.0 Circuit breaker defense: drop unverified low-trust packets during active flood
    if (this.isCircuitBreakerTripped && isLowTrust) {
      await this.logRejection('rate_limit_exceeded', 'circuit_breaker_flood_defense');
      return { valid: false, lowTrust: true, reason: 'rate_limit_exceeded' };
    }

    // 7.1 Rescuer credential validation (Phase 13)
    // An ACK packet MUST have FROM_RESCUER flag, and if rescuerService is present,
    // must pass cryptographic credential chain & revocation checks.
    if (header.type === PacketType.ACK) {
      if ((header.flags & PacketFlags.FROM_RESCUER) === 0) {
        await this.logRejection('invalid_signature', 'ack_missing_rescuer_flag');
        return { valid: false, lowTrust: false, reason: 'invalid_signature' };
      }
    }

    if (this.rescuerService && (header.flags & PacketFlags.FROM_RESCUER) !== 0) {
      const rescuerVerify = await this.rescuerService.verifyRescuerPacket(rawBytes);
      if (!rescuerVerify.valid) {
        await this.logRejection(
          'invalid_signature',
          rescuerVerify.reason || 'rescuer_credential_unverified',
        );
        return { valid: false, lowTrust: false, reason: 'invalid_signature' };
      }
    }

    // 8. Rate limiting per origin
    const rateLimit = isLowTrust
      ? this.policy.maxLowTrustPacketsPerOriginPerMinute
      : this.policy.maxPacketsPerOriginPerMinute;

    const rateExceeded = this.checkRateLimit(originFpHex, nowSeconds, rateLimit);
    if (rateExceeded) {
      await this.logRejection('rate_limit_exceeded', `origin_${originFpHex}`);
      return { valid: false, lowTrust: isLowTrust, reason: 'rate_limit_exceeded' };
    }

    // Success: register in state caches
    this.seenPacketIds.add(packetIdHex);
    if (packetNonce !== undefined) {
      this.seenNonces.add(packetNonce);
    }
    if (sequenceNumber > 0) {
      this.originHighestSeq.set(originFpHex, sequenceNumber);
    }

    return {
      valid: true,
      lowTrust: isLowTrust,
    };
  }

  public isAlreadySeen(packetIdHex: string): boolean {
    return this.seenPacketIds.has(packetIdHex.toLowerCase());
  }

  public markSeen(packetIdHex: string): void {
    this.seenPacketIds.add(packetIdHex.toLowerCase());
  }

  private checkRateLimit(originFpHex: string, nowSeconds: number, maxPerMinute: number): boolean {
    let window = this.originRateWindows.get(originFpHex);
    if (!window) {
      window = [];
      this.originRateWindows.set(originFpHex, window);
    }

    // Filter out timestamps older than 60 seconds
    const oneMinAgo = nowSeconds - 60;
    const active = window.filter(t => t > oneMinAgo);

    if (active.length >= maxPerMinute) {
      this.originRateWindows.set(originFpHex, active);
      return true; // Limit exceeded
    }

    active.push(nowSeconds);
    this.originRateWindows.set(originFpHex, active);
    return false;
  }

  private getRetentionWindow(type: PacketType): number {
    switch (type) {
      case PacketType.SOS:
        return this.policy.sosRetentionSeconds;
      case PacketType.CHAT:
      case PacketType.CHAT_RECEIPT:
        return this.policy.chatRetentionSeconds;
      case PacketType.LOCATION:
        return this.policy.locationRetentionSeconds;
      default:
        return this.policy.otherRetentionSeconds;
    }
  }

  private async logRejection(reason: PacketRejectionReason, detail: string): Promise<void> {
    await this.db.events.logEvent('packet_validation_rejected', {
      reason,
      detail,
    });
  }
}
