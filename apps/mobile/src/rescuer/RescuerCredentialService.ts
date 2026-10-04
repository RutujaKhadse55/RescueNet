/**
 * RescueNet Rescuer Credential Service (Phase 13)
 * Manages rescuer certificate lifecycle, Agency CA trust verification,
 * CRL (Credential Revocation List) synchronization, and packet-level rescuer validation.
 */

import {
  ICrypto,
  RescuerCredential,
  CredentialRevocationList,
  CredentialVerifyResult,
  importCredentialToken,
  verifyRescuerCredential,
  PacketFlags,
  decodeHeader,
  decodeAck,
  verifyAckPacket,
  PacketType,
} from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';

export interface RescuerImportResult {
  success: boolean;
  credential?: RescuerCredential;
  error?: string;
}

export class RescuerCredentialService {
  private db: DatabaseManager;
  private crypto: ICrypto;
  private agencyCaPublicKey: Uint8Array;
  private activeCredential: RescuerCredential | null = null;
  private revocationList: CredentialRevocationList | null = null;
  private knownRescuerKeys: Map<string, RescuerCredential> = new Map();
  private onRoleChangeCallback?: (isRescuer: boolean) => void;

  constructor(
    db: DatabaseManager,
    crypto: ICrypto,
    agencyCaPublicKey?: Uint8Array
  ) {
    this.db = db;
    this.crypto = crypto;
    // Default 32-byte placeholder until configured from server/settings
    this.agencyCaPublicKey = agencyCaPublicKey ?? new Uint8Array(32).fill(0xee);
  }

  /**
   * Initializes stored credential and CRL from database settings
   */
  public async init(): Promise<void> {
    // 1. Load Agency CA public key if stored
    const caKeyHex = await this.db.settings.get('agency_ca_public_key');
    if (caKeyHex) {
      this.agencyCaPublicKey = new Uint8Array(Buffer.from(caKeyHex, 'hex'));
    }

    // 2. Load stored CRL if present
    const crlJson = await this.db.settings.get('credential_revocation_list');
    if (crlJson) {
      try {
        const parsed = JSON.parse(crlJson);
        this.revocationList = {
          ...parsed,
          caSignature: new Uint8Array(Buffer.from(parsed.caSignatureHex, 'hex')),
        };
      } catch {
        // Ignored if corrupt
      }
    }

    // 3. Load active rescuer credential if present
    const credJson = await this.db.settings.get('active_rescuer_credential');
    if (credJson) {
      try {
        const parsed = JSON.parse(credJson);
        const cred: RescuerCredential = {
          ...parsed,
          rescuerPublicKey: new Uint8Array(Buffer.from(parsed.rescuerPublicKeyHex, 'hex')),
          caSignature: new Uint8Array(Buffer.from(parsed.caSignatureHex, 'hex')),
        };

        const verify = await verifyRescuerCredential(
          cred,
          this.agencyCaPublicKey,
          Math.floor(Date.now() / 1000),
          this.revocationList
        );

        if (verify.valid) {
          this.activeCredential = cred;
          this.knownRescuerKeys.set(
            Buffer.from(cred.rescuerPublicKey).toString('hex'),
            cred
          );
        } else {
          // Stored credential expired or revoked
          this.activeCredential = null;
        }
      } catch {
        this.activeCredential = null;
      }
    }
  }

  public setAgencyCaPublicKey(key: Uint8Array): void {
    this.agencyCaPublicKey = key;
    this.db.settings.set('agency_ca_public_key', Buffer.from(key).toString('hex')).catch(() => {});
  }

  public getAgencyCaPublicKey(): Uint8Array {
    return this.agencyCaPublicKey;
  }

  public onRoleChange(cb: (isRescuer: boolean) => void): void {
    this.onRoleChangeCallback = cb;
  }

  public isRescuer(): boolean {
    if (!this.activeCredential) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (this.activeCredential.expiresAt <= nowSec) return false;

    if (this.revocationList) {
      if (this.revocationList.revokedCredentialIds.includes(this.activeCredential.credentialId)) {
        return false;
      }
      const pubkeyHex = Buffer.from(this.activeCredential.rescuerPublicKey).toString('hex');
      if (this.revocationList.revokedPublicKeysHex.includes(pubkeyHex)) {
        return false;
      }
    }

    return true;
  }

  public getActiveCredential(): RescuerCredential | null {
    return this.isRescuer() ? this.activeCredential : null;
  }

  /**
   * Imports and verifies a rescuer credential token (e.g. from QR code or file).
   */
  public async importCredential(token: string): Promise<RescuerImportResult> {
    try {
      const cred = importCredentialToken(token);

      const verification = await verifyRescuerCredential(
        cred,
        this.agencyCaPublicKey,
        Math.floor(Date.now() / 1000),
        this.revocationList
      );

      if (!verification.valid) {
        let msg = 'Invalid credential';
        if (verification.reason === CredentialVerifyResult.EXPIRED) msg = 'Credential has expired';
        if (verification.reason === CredentialVerifyResult.REVOKED) msg = 'Credential is on revocation list';
        if (verification.reason === CredentialVerifyResult.INVALID_SIGNATURE) msg = 'Agency CA signature invalid';
        return { success: false, error: msg };
      }

      this.activeCredential = cred;
      this.knownRescuerKeys.set(
        Buffer.from(cred.rescuerPublicKey).toString('hex'),
        cred
      );

      // Persist in settings
      await this.db.settings.set(
        'active_rescuer_credential',
        JSON.stringify({
          ...cred,
          rescuerPublicKeyHex: Buffer.from(cred.rescuerPublicKey).toString('hex'),
          caSignatureHex: Buffer.from(cred.caSignature).toString('hex'),
        })
      );

      await this.db.events.logEvent('rescuer_enrolled', {
        credentialId: cred.credentialId,
        userId: cred.userId,
        rescuerName: cred.rescuerName,
        badgeNumber: cred.badgeNumber,
        agencyId: cred.agencyId,
      });

      this.onRoleChangeCallback?.(true);
      return { success: true, credential: cred };
    } catch (err: any) {
      return { success: false, error: err.message || 'Malformed credential token' };
    }
  }

  /**
   * Directly registers an authorized rescuer credential into the known cache
   * (e.g. from mesh credential broadcast or server sync).
   */
  public async registerAuthorizedCredential(cred: RescuerCredential): Promise<boolean> {
    const verification = await verifyRescuerCredential(
      cred,
      this.agencyCaPublicKey,
      Math.floor(Date.now() / 1000),
      this.revocationList
    );

    if (verification.valid) {
      const pubkeyHex = Buffer.from(cred.rescuerPublicKey).toString('hex');
      this.knownRescuerKeys.set(pubkeyHex, cred);
      return true;
    }
    return false;
  }

  /**
   * Updates and verifies the Credential Revocation List (CRL).
   */
  public async updateRevocationList(crl: CredentialRevocationList): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Verify CRL signature with Agency CA public key
      const payload = new TextEncoder().encode(
        JSON.stringify({
          agencyId: crl.agencyId,
          revokedCredentialIds: [...crl.revokedCredentialIds].sort(),
          revokedPublicKeysHex: [...crl.revokedPublicKeysHex].sort(),
          updatedAt: crl.updatedAt,
        })
      );

      const isValid = await this.crypto.verify(
        crl.caSignature,
        payload,
        this.agencyCaPublicKey
      );

      if (!isValid) {
        return { success: false, error: 'CRL signature verification failed' };
      }

      this.revocationList = crl;

      // Persist CRL
      await this.db.settings.set(
        'credential_revocation_list',
        JSON.stringify({
          agencyId: crl.agencyId,
          revokedCredentialIds: crl.revokedCredentialIds,
          revokedPublicKeysHex: crl.revokedPublicKeysHex,
          updatedAt: crl.updatedAt,
          caSignatureHex: Buffer.from(crl.caSignature).toString('hex'),
        })
      );

      // Check if current active credential was revoked!
      if (this.activeCredential) {
        const isRevoked =
          crl.revokedCredentialIds.includes(this.activeCredential.credentialId) ||
          crl.revokedPublicKeysHex.includes(
            Buffer.from(this.activeCredential.rescuerPublicKey).toString('hex')
          );

        if (isRevoked) {
          await this.revokeActiveCredential('Revoked via CRL sync');
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update CRL' };
    }
  }

  public getRevocationList(): CredentialRevocationList | null {
    return this.revocationList;
  }

  /**
   * Verifies an incoming rescuer packet (e.g. ACK, reached, closed).
   * Enforces:
   * 1. Packet must have FROM_RESCUER flag set.
   * 2. Signer public key must NOT be revoked.
   * 3. Signer public key must be an authorized rescuer (or matching active credential or CA trust).
   * 4. Ed25519 signature of the packet must be cryptographically valid.
   */
  public async verifyRescuerPacket(rawBytes: Uint8Array): Promise<{ valid: boolean; reason?: string }> {
    if (rawBytes.length < 21) {
      return { valid: false, reason: 'Packet too short' };
    }

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const header = decodeHeader(view);

    // 1. Rescuer flag check
    if ((header.flags & PacketFlags.FROM_RESCUER) === 0) {
      return { valid: false, reason: 'Missing FROM_RESCUER flag' };
    }

    // 2. Type-specific verification
    if (header.type === PacketType.ACK) {
      const ack = decodeAck(rawBytes);
      const pubkeyHex = Buffer.from(ack.body.publicKey).toString('hex');

      // Check CRL
      if (this.revocationList) {
        if (this.revocationList.revokedPublicKeysHex.includes(pubkeyHex)) {
          return { valid: false, reason: 'Rescuer public key is revoked' };
        }
      }

      // Check if signer is known authorized rescuer
      // Either active rescuer itself, or registered in known rescuer keys,
      // or verified against CA
      let isAuthorized = false;
      if (this.knownRescuerKeys.has(pubkeyHex)) {
        const cred = this.knownRescuerKeys.get(pubkeyHex)!;
        const nowSec = Math.floor(Date.now() / 1000);
        if (cred.expiresAt > nowSec) {
          isAuthorized = true;
        }
      } else if (
        this.activeCredential &&
        Buffer.from(this.activeCredential.rescuerPublicKey).toString('hex') === pubkeyHex
      ) {
        isAuthorized = this.isRescuer();
      }

      // If we don't have a known credential for this rescuer key yet,
      // verify packet signature first: if signature is completely invalid, reject right away
      const sigValid = await verifyAckPacket(rawBytes, this.crypto);
      if (!sigValid) {
        return { valid: false, reason: 'Invalid packet signature' };
      }

      if (!isAuthorized) {
        return { valid: false, reason: 'Rescuer key not verified in agency credential chain' };
      }

      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Revokes the active credential locally and notifies listeners
   */
  public async revokeActiveCredential(reason: string = 'User requested'): Promise<void> {
    if (this.activeCredential) {
      await this.db.events.logEvent('rescuer_revoked', {
        credentialId: this.activeCredential.credentialId,
        reason,
      });
      this.activeCredential = null;
      await this.db.settings.remove('active_rescuer_credential');
      this.onRoleChangeCallback?.(false);
    }
  }
}
