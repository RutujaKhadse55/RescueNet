/**
 * RescueNet SMS Fallback Profile
 * Compact binary Base64URL encoding ("RN1 <base64url>") and Human-readable fallback.
 */

import { ICrypto } from '../crypto/types';
import { NeedsBitmask, PROTOCOL_VERSION, TriageStatus } from '../codec/types';

export const SMS_PAYLOAD_SIZE = 41;
export const SMS_HMAC_TAG_SIZE = 8;
export const SMS_TOTAL_BINARY_SIZE = SMS_PAYLOAD_SIZE + SMS_HMAC_TAG_SIZE; // 49 bytes
export const SMS_PREFIX = 'RN1 ';

export interface SmsSosData {
  version: number;
  originFp: Uint8Array; // 8 bytes
  timestamp: number; // unix seconds
  latitude: number; // degrees
  longitude: number; // degrees
  accuracyMeters: number; // meters
  status: TriageStatus; // 0 Safe, 1 Injured, 2 Trapped, 3 Critical
  peopleCount: number; // 1-255
  needsMask: number; // NeedsBitmask bitwise flags
  batteryPercent: number; // 0-100
  sequenceNumber: number; // sequence number
  nonce: number; // 4B random
  altitudeMeters: number; // meters
  hmacTag: Uint8Array; // 8 bytes
  isRegistered?: boolean;
  lowTrust?: boolean;
}

// Helper: base64url encode and decode
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary =
    typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes SMS data into binary buffer (49 bytes)
 */
export async function encodeSmsBinary(
  data: Omit<SmsSosData, 'hmacTag'>,
  deviceSecret: Uint8Array | null,
  crypto: ICrypto,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(SMS_TOTAL_BINARY_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  view.setUint8(offset++, data.version || PROTOCOL_VERSION);
  buffer.set(data.originFp.subarray(0, 8), offset);
  offset += 8;
  view.setUint32(offset, data.timestamp, true);
  offset += 4;
  view.setInt32(offset, Math.round(data.latitude * 1e7), true);
  offset += 4;
  view.setInt32(offset, Math.round(data.longitude * 1e7), true);
  offset += 4;
  view.setUint16(offset, Math.min(65535, Math.max(0, Math.round(data.accuracyMeters))), true);
  offset += 2;
  view.setUint8(offset++, data.status);
  view.setUint8(offset++, Math.min(255, Math.max(1, data.peopleCount)));
  view.setUint8(offset++, data.needsMask);
  view.setUint8(offset++, Math.min(100, Math.max(0, data.batteryPercent)));
  view.setUint16(offset, data.sequenceNumber, true);
  offset += 2;
  view.setUint32(offset, data.nonce, true);
  offset += 4;
  view.setInt16(offset, Math.round(data.altitudeMeters || 0), true);
  offset += 2;
  // 6 reserved bytes
  buffer.fill(0, offset, offset + 6);
  offset += 6;

  // Compute 8-byte HMAC tag
  if (deviceSecret && deviceSecret.length > 0) {
    const payloadBytes = buffer.slice(0, SMS_PAYLOAD_SIZE);
    const fullHmac = await crypto.hmacSha256(deviceSecret, payloadBytes);
    buffer.set(fullHmac.subarray(0, SMS_HMAC_TAG_SIZE), SMS_PAYLOAD_SIZE);
  } else {
    // Unregistered: tag is 8 zeros
    buffer.fill(0, SMS_PAYLOAD_SIZE, SMS_PAYLOAD_SIZE + SMS_HMAC_TAG_SIZE);
  }

  return buffer;
}

/**
 * Encodes SMS data into the standard "RN1 <base64url>" string (~70 characters)
 */
export async function encodeSms(
  data: Omit<SmsSosData, 'hmacTag'>,
  deviceSecret: Uint8Array | null,
  crypto: ICrypto,
): Promise<string> {
  const binary = await encodeSmsBinary(data, deviceSecret, crypto);
  return `${SMS_PREFIX}${uint8ArrayToBase64Url(binary)}`;
}

/**
 * Decodes "RN1 <base64url>" string
 */
export async function decodeSms(
  smsString: string,
  deviceSecretLookup?: (originFp: Uint8Array) => Promise<Uint8Array | null>,
  crypto?: ICrypto,
): Promise<SmsSosData> {
  const trimmed = smsString.trim();
  if (!trimmed.startsWith(SMS_PREFIX)) {
    throw new Error(`Invalid SMS prefix: expected "${SMS_PREFIX}"`);
  }

  const base64Url = trimmed.substring(SMS_PREFIX.length).trim();
  const buffer = base64UrlToUint8Array(base64Url);

  if (buffer.length < SMS_TOTAL_BINARY_SIZE) {
    throw new Error(`Decoded SMS payload too short: ${buffer.length} < ${SMS_TOTAL_BINARY_SIZE}`);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  const version = view.getUint8(offset++);
  const originFp = buffer.slice(offset, offset + 8);
  offset += 8;
  const timestamp = view.getUint32(offset, true);
  offset += 4;
  const latitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const longitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const accuracyMeters = view.getUint16(offset, true);
  offset += 2;
  const status = view.getUint8(offset++) as TriageStatus;
  const peopleCount = view.getUint8(offset++);
  const needsMask = view.getUint8(offset++);
  const batteryPercent = view.getUint8(offset++);
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const nonce = view.getUint32(offset, true);
  offset += 4;
  const altitudeMeters = view.getInt16(offset, true);
  offset += 2;
  // skip 6 reserved bytes
  offset += 6;

  const hmacTag = buffer.slice(offset, offset + 8);

  // Check if HMAC tag is all zeros
  let isZeros = true;
  for (let i = 0; i < 8; i++) {
    if (hmacTag[i] !== 0) {
      isZeros = false;
      break;
    }
  }

  let isRegistered = false;
  let lowTrust = true;

  if (isZeros) {
    isRegistered = false;
    lowTrust = true;
  } else if (deviceSecretLookup && crypto) {
    const secret = await deviceSecretLookup(originFp);
    if (secret) {
      const payloadBytes = buffer.slice(0, SMS_PAYLOAD_SIZE);
      const computedHmac = await crypto.hmacSha256(secret, payloadBytes);
      let match = true;
      for (let i = 0; i < 8; i++) {
        if (computedHmac[i] !== hmacTag[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        isRegistered = true;
        lowTrust = false;
      } else {
        throw new Error('HMAC tag verification failed for registered device');
      }
    } else {
      // Secret not found for tag
      lowTrust = true;
    }
  }

  return {
    version,
    originFp,
    timestamp,
    latitude,
    longitude,
    accuracyMeters,
    status,
    peopleCount,
    needsMask,
    batteryPercent,
    sequenceNumber,
    nonce,
    altitudeMeters,
    hmacTag,
    isRegistered,
    lowTrust,
  };
}

// ==============================================================================
// Human-Readable SMS Fallback
// Example: "RN SOS 18.5204,73.8567 +-20m P4 CRIT MED,WTR"
// ==============================================================================

const STATUS_MAP_REVERSE: Record<string, TriageStatus> = {
  SAFE: TriageStatus.SAFE,
  INJ: TriageStatus.INJURED,
  TRAP: TriageStatus.TRAPPED,
  CRIT: TriageStatus.CRITICAL,
};

const STATUS_MAP_FORWARD: Record<TriageStatus, string> = {
  [TriageStatus.SAFE]: 'SAFE',
  [TriageStatus.INJURED]: 'INJ',
  [TriageStatus.TRAPPED]: 'TRAP',
  [TriageStatus.CRITICAL]: 'CRIT',
};

const NEED_TOKENS: { token: string; mask: NeedsBitmask }[] = [
  { token: 'MED', mask: NeedsBitmask.MEDICAL },
  { token: 'WTR', mask: NeedsBitmask.WATER },
  { token: 'FOOD', mask: NeedsBitmask.FOOD },
  { token: 'SHEL', mask: NeedsBitmask.SHELTER },
  { token: 'EVAC', mask: NeedsBitmask.EVACUATION },
  { token: 'RX', mask: NeedsBitmask.MEDICINE },
  { token: 'ELD', mask: NeedsBitmask.CHILD_OR_ELDERLY },
  { token: 'MOB', mask: NeedsBitmask.MOBILITY_ISSUE },
];

export interface HumanSmsData {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  peopleCount: number;
  status: TriageStatus;
  needsMask: number;
}

/**
 * Formats data into standard human-readable SMS
 */
export function formatHumanSms(data: HumanSmsData): string {
  const statusStr = STATUS_MAP_FORWARD[data.status] || 'CRIT';
  const needsParts: string[] = [];
  for (const item of NEED_TOKENS) {
    if ((data.needsMask & item.mask) !== 0) {
      needsParts.push(item.token);
    }
  }
  const needsStr = needsParts.length > 0 ? ` ${needsParts.join(',')}` : '';
  return `RN SOS ${data.latitude.toFixed(4)},${data.longitude.toFixed(4)} +-${Math.round(data.accuracyMeters)}m P${data.peopleCount} ${statusStr}${needsStr}`;
}

/**
 * Parses human-readable SMS fallback
 */
export function parseHumanSms(text: string): HumanSmsData {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^RN\s+SOS\s+([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s+\+-(\d+)m\s+P(\d+)\s+([A-Z]+)(?:\s+([A-Z,]+))?/i,
  );

  if (!match) {
    throw new Error(`Unable to parse human-readable SMS: "${text}"`);
  }

  const latitude = parseFloat(match[1]!);
  const longitude = parseFloat(match[2]!);
  const accuracyMeters = parseInt(match[3]!, 10);
  const peopleCount = Math.max(1, parseInt(match[4]!, 10));
  const statusToken = match[5]!.toUpperCase();
  const status = STATUS_MAP_REVERSE[statusToken] ?? TriageStatus.CRITICAL;

  let needsMask = 0;
  if (match[6]) {
    const tokens = match[6].toUpperCase().split(',');
    for (const t of tokens) {
      const trimmedToken = t.trim();
      for (const item of NEED_TOKENS) {
        if (item.token === trimmedToken) {
          needsMask |= item.mask;
        }
      }
    }
  }

  return {
    latitude,
    longitude,
    accuracyMeters,
    peopleCount,
    status,
    needsMask,
  };
}
