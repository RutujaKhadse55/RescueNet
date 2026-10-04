/**
 * RescueNet Rescuer Cryptographic Credentials & Chain of Trust (Phase 13)
 * Agency CA-signed credentials authorizing field responders to issue ACKs,
 * mark reached/closed states, and act as high-capacity mesh relays.
 */

import { SodiumCrypto } from '../crypto/sodium';

export type RescuerPermission =
  | 'ack_cluster'
  | 'mark_reached'
  | 'mark_closed'
  | 'priority_override'
  | 'gateway_relay';

export interface RescuerCredential {
  credentialId: string;
  userId: string;
  rescuerName: string;
  badgeNumber: string;
  agencyId: string;
  rescuerPublicKey: Uint8Array; // 32-byte Ed25519 public key
  issuedAt: number; // Unix seconds
  expiresAt: number; // Unix seconds
  permissions: RescuerPermission[];
  caSignature: Uint8Array; // 64-byte Ed25519 signature from Agency CA
}

export interface CredentialRevocationList {
  agencyId: string;
  revokedCredentialIds: string[];
  revokedPublicKeysHex: string[];
  updatedAt: number; // Unix seconds
  caSignature: Uint8Array; // 64-byte Ed25519 signature from Agency CA
}

export enum CredentialVerifyResult {
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MALFORMED = 'MALFORMED',
}

/**
 * Deterministically serializes credential metadata into canonical bytes for CA signing.
 */
export function serializeCredentialCanonicalPayload(
  cred: Omit<RescuerCredential, 'caSignature'>
): Uint8Array {
  const encoder = new TextEncoder();
  // Order keys deterministically: agencyId, badgeNumber, credentialId, expiresAt, issuedAt, permissions, pubkey, userId
  const canonicalString = JSON.stringify({
    agencyId: cred.agencyId,
    badgeNumber: cred.badgeNumber,
    credentialId: cred.credentialId,
    expiresAt: cred.expiresAt,
    issuedAt: cred.issuedAt,
    permissions: [...cred.permissions].sort(),
    pubkeyHex: Buffer.from(cred.rescuerPublicKey).toString('hex'),
    rescuerName: cred.rescuerName,
    userId: cred.userId,
  });

  return encoder.encode(canonicalString);
}

/**
 * Issues an Agency CA-signed Rescuer Credential.
 */
export async function issueRescuerCredential(
  data: {
    credentialId: string;
    userId: string;
    rescuerName: string;
    badgeNumber: string;
    agencyId: string;
    rescuerPublicKey: Uint8Array;
    validitySeconds?: number;
    permissions?: RescuerPermission[];
  },
  caPrivateKey: Uint8Array
): Promise<RescuerCredential> {
  const crypto = await SodiumCrypto.getInstance();
  const issuedAt = Math.floor(Date.now() / 1000);
  const validity = data.validitySeconds ?? 86400 * 7; // Default 7 days
  const expiresAt = issuedAt + validity;

  const unsigned: Omit<RescuerCredential, 'caSignature'> = {
    credentialId: data.credentialId,
    userId: data.userId,
    rescuerName: data.rescuerName,
    badgeNumber: data.badgeNumber,
    agencyId: data.agencyId,
    rescuerPublicKey: data.rescuerPublicKey,
    issuedAt,
    expiresAt,
    permissions: data.permissions || [
      'ack_cluster',
      'mark_reached',
      'mark_closed',
      'gateway_relay',
    ],
  };

  const payload = serializeCredentialCanonicalPayload(unsigned);
  const caSignature = await crypto.sign(payload, caPrivateKey);

  return {
    ...unsigned,
    caSignature,
  };
}

/**
 * Verifies a Rescuer Credential against the Agency CA root public key, expiration, and CRL.
 */
export async function verifyRescuerCredential(
  cred: RescuerCredential,
  caPublicKey: Uint8Array,
  currentTimestampSec: number = Math.floor(Date.now() / 1000),
  revocationList?: CredentialRevocationList | null
): Promise<{ valid: boolean; reason: CredentialVerifyResult }> {
  // 1. Basic structural checks
  if (
    !cred ||
    !cred.credentialId ||
    !cred.rescuerPublicKey ||
    cred.rescuerPublicKey.length !== 32 ||
    !cred.caSignature ||
    cred.caSignature.length !== 64
  ) {
    return { valid: false, reason: CredentialVerifyResult.MALFORMED };
  }

  // 2. Expiration check
  if (cred.expiresAt <= currentTimestampSec) {
    return { valid: false, reason: CredentialVerifyResult.EXPIRED };
  }

  // 3. Revocation check
  if (revocationList) {
    const isIdRevoked = revocationList.revokedCredentialIds.includes(cred.credentialId);
    const pubkeyHex = Buffer.from(cred.rescuerPublicKey).toString('hex');
    const isKeyRevoked = revocationList.revokedPublicKeysHex.includes(pubkeyHex);

    if (isIdRevoked || isKeyRevoked) {
      return { valid: false, reason: CredentialVerifyResult.REVOKED };
    }
  }

  // 4. Cryptographic signature check against Agency CA root
  const crypto = await SodiumCrypto.getInstance();
  const canonicalPayload = serializeCredentialCanonicalPayload(cred);
  const signatureOk = await crypto.verify(cred.caSignature, canonicalPayload, caPublicKey);

  if (!signatureOk) {
    return { valid: false, reason: CredentialVerifyResult.INVALID_SIGNATURE };
  }

  return { valid: true, reason: CredentialVerifyResult.VALID };
}

/**
 * Encodes credential into Base64 JSON token suitable for QR codes and file imports.
 */
export function exportCredentialToken(cred: RescuerCredential): string {
  const json = JSON.stringify({
    id: cred.credentialId,
    uid: cred.userId,
    name: cred.rescuerName,
    badge: cred.badgeNumber,
    aid: cred.agencyId,
    pk: Buffer.from(cred.rescuerPublicKey).toString('base64'),
    iat: cred.issuedAt,
    exp: cred.expiresAt,
    perms: cred.permissions,
    sig: Buffer.from(cred.caSignature).toString('base64'),
  });

  return `RESCUER-V1:${Buffer.from(json).toString('base64')}`;
}

/**
 * Parses and reconstructs RescuerCredential from QR string or exported token.
 */
export function importCredentialToken(token: string): RescuerCredential {
  const clean = token.trim();
  const rawBase64 = clean.startsWith('RESCUER-V1:')
    ? clean.slice('RESCUER-V1:'.length)
    : clean;

  const jsonStr = Buffer.from(rawBase64, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonStr);

  if (!parsed.id || !parsed.pk || !parsed.sig) {
    throw new Error('Malformed rescuer credential token');
  }

  return {
    credentialId: parsed.id,
    userId: parsed.uid,
    rescuerName: parsed.name,
    badgeNumber: parsed.badge,
    agencyId: parsed.aid,
    rescuerPublicKey: new Uint8Array(Buffer.from(parsed.pk, 'base64')),
    issuedAt: parsed.iat,
    expiresAt: parsed.exp,
    permissions: parsed.perms || [],
    caSignature: new Uint8Array(Buffer.from(parsed.sig, 'base64')),
  };
}

/**
 * Creates and signs a Credential Revocation List (CRL).
 */
export async function createSignedRevocationList(
  agencyId: string,
  revokedIds: string[],
  revokedKeysHex: string[],
  caPrivateKey: Uint8Array
): Promise<CredentialRevocationList> {
  const crypto = await SodiumCrypto.getInstance();
  const updatedAt = Math.floor(Date.now() / 1000);

  const payload = new TextEncoder().encode(
    JSON.stringify({
      agencyId,
      revokedCredentialIds: [...revokedIds].sort(),
      revokedPublicKeysHex: [...revokedKeysHex].sort(),
      updatedAt,
    })
  );

  const caSignature = await crypto.sign(payload, caPrivateKey);

  return {
    agencyId,
    revokedCredentialIds: revokedIds,
    revokedPublicKeysHex: revokedKeysHex,
    updatedAt,
    caSignature,
  };
}
