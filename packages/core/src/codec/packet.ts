/**
 * RescueNet Binary Packet Codec (Little Endian)
 * Zero external platform dependencies. High-efficiency binary serialization.
 */

import { ICrypto } from '../crypto/types';
import {
  CommonHeader,
  ExtensionType,
  FLAG_IMMUTABLE_MASK,
  PacketExtension,
  PacketFlags,
  PacketType,
  PROTOCOL_VERSION,
  SosPacketData,
  SosBody,
  AckPacketData,
  DeadmanPacketData,
  LocationPacketData,
  ChatPacketData,
  HelloPacketData,
  ChatReceiptPacketData,
  ClusterSummaryPacketData,
  ClusterSummaryBody,
} from './types';

export const HEADER_SIZE = 21;
export const SOS_BODY_NO_EXT_SIZE = 120; // 56 bytes body + 64 bytes signature
export const SOS_MIN_PACKET_SIZE = HEADER_SIZE + SOS_BODY_NO_EXT_SIZE; // 141 bytes

// Helper to compare two Uint8Arrays
export function areBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Encodes CommonHeader into a buffer at offset 0
 */
export function encodeHeader(view: DataView, header: CommonHeader): void {
  view.setUint8(0, header.version);
  view.setUint8(1, header.type);
  view.setUint8(2, header.flags);
  view.setUint8(3, header.ttl);
  view.setUint8(4, header.hop);

  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  u8.set(header.packetId.subarray(0, 8), 5);
  u8.set(header.originFp.subarray(0, 8), 13);
}

/**
 * Decodes CommonHeader from a buffer
 */
export function decodeHeader(view: DataView): CommonHeader {
  if (view.byteLength < HEADER_SIZE) {
    throw new Error(`Buffer too short for RescueNet header: ${view.byteLength} < ${HEADER_SIZE}`);
  }
  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return {
    version: view.getUint8(0),
    type: view.getUint8(1) as PacketType,
    flags: view.getUint8(2),
    ttl: view.getUint8(3),
    hop: view.getUint8(4),
    packetId: u8.slice(5, 13),
    originFp: u8.slice(13, 21),
  };
}

/**
 * Serializes optional extension TLVs
 */
export function serializeExtensions(extensions: PacketExtension[]): Uint8Array {
  let totalLength = 0;
  for (const ext of extensions) {
    totalLength += 2 + ext.value.length; // 1B type, 1B len, NB value
  }
  const buf = new Uint8Array(totalLength);
  let offset = 0;
  for (const ext of extensions) {
    buf[offset++] = ext.type;
    buf[offset++] = ext.value.length;
    buf.set(ext.value, offset);
    offset += ext.value.length;
  }
  return buf;
}

/**
 * Deserializes extension TLVs
 */
export function deserializeExtensions(u8: Uint8Array, offset: number): PacketExtension[] {
  const extensions: PacketExtension[] = [];
  let curr = offset;
  while (curr + 2 <= u8.length) {
    const type = u8[curr++]! as ExtensionType;
    const len = u8[curr++]!;
    if (curr + len > u8.length) {
      throw new Error(
        `Extension length overflow at byte ${curr}: requires ${len}, remaining ${u8.length - curr}`,
      );
    }
    const value = u8.slice(curr, curr + len);
    curr += len;
    extensions.push({ type, value });
  }
  return extensions;
}

/**
 * Constructs the signed preimage for an SOS packet
 */
export function getSosSigningPreimage(
  header: CommonHeader,
  body: Omit<SosBody, 'signature'>,
  serializedExtensions?: Uint8Array,
): Uint8Array {
  const extLen = serializedExtensions ? serializedExtensions.length : 0;
  // Preimage: version(1) + type(1) + flags(1) + packetId(8) + originFp(8) + bodyFields(56) + extensions(extLen) = 75 + extLen
  const preimage = new Uint8Array(19 + 56 + extLen);
  const view = new DataView(preimage.buffer, preimage.byteOffset, preimage.byteLength);

  // Common immutable header fields
  view.setUint8(0, header.version);
  view.setUint8(1, header.type);
  view.setUint8(2, header.flags & FLAG_IMMUTABLE_MASK);
  preimage.set(header.packetId.subarray(0, 8), 3);
  preimage.set(header.originFp.subarray(0, 8), 11);

  // SOS body fields (56 bytes)
  let offset = 19;
  view.setUint32(offset, body.timestamp, true);
  offset += 4;
  view.setInt32(offset, Math.round(body.latitude * 1e7), true);
  offset += 4;
  view.setInt32(offset, Math.round(body.longitude * 1e7), true);
  offset += 4;
  view.setUint16(offset, Math.min(65535, Math.max(0, Math.round(body.accuracyMeters))), true);
  offset += 2;
  view.setUint8(offset++, body.status);
  view.setUint8(offset++, Math.min(255, Math.max(1, body.peopleCount)));
  view.setUint8(offset++, body.needsMask);
  view.setUint8(offset++, Math.min(100, Math.max(0, body.batteryPercent)));
  view.setUint16(offset, body.sequenceNumber, true);
  offset += 2;
  view.setUint32(offset, body.nonce, true);
  offset += 4;
  preimage.set(body.publicKey.subarray(0, 32), offset);
  offset += 32;

  // Extensions
  if (serializedExtensions && serializedExtensions.length > 0) {
    preimage.set(serializedExtensions, offset);
  }

  return preimage;
}

/**
 * Encodes an SOS packet into binary format
 */
export function encodeSos(packet: SosPacketData): Uint8Array {
  const hasExt = packet.body.extensions && packet.body.extensions.length > 0;
  const extBytes = hasExt ? serializeExtensions(packet.body.extensions!) : new Uint8Array(0);

  const totalLen = SOS_MIN_PACKET_SIZE + extBytes.length;
  const buffer = new Uint8Array(totalLen);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Set or unset HAS_EXTENSION flag
  const headerFlags = hasExt
    ? packet.header.flags | PacketFlags.HAS_EXTENSION
    : packet.header.flags & ~PacketFlags.HAS_EXTENSION;

  const header: CommonHeader = {
    ...packet.header,
    type: PacketType.SOS,
    flags: headerFlags,
  };

  encodeHeader(view, header);

  // SOS body at offset 21
  let offset = 21;
  view.setUint32(offset, packet.body.timestamp, true);
  offset += 4;
  view.setInt32(offset, Math.round(packet.body.latitude * 1e7), true);
  offset += 4;
  view.setInt32(offset, Math.round(packet.body.longitude * 1e7), true);
  offset += 4;
  view.setUint16(
    offset,
    Math.min(65535, Math.max(0, Math.round(packet.body.accuracyMeters))),
    true,
  );
  offset += 2;
  view.setUint8(offset++, packet.body.status);
  view.setUint8(offset++, packet.body.peopleCount);
  view.setUint8(offset++, packet.body.needsMask);
  view.setUint8(offset++, packet.body.batteryPercent);
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  view.setUint32(offset, packet.body.nonce, true);
  offset += 4;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);
  offset += 64;

  if (hasExt && extBytes.length > 0) {
    buffer.set(extBytes, offset);
  }

  return buffer;
}

/**
 * Decodes a binary buffer into an SOS packet
 */
export function decodeSos(buffer: Uint8Array): SosPacketData {
  if (buffer.length < SOS_MIN_PACKET_SIZE) {
    throw new Error(`Buffer too short for SOS packet: ${buffer.length} < ${SOS_MIN_PACKET_SIZE}`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);

  if (header.type !== PacketType.SOS) {
    throw new Error(
      `Invalid packet type for SOS: expected 0x01, received 0x0${header.type.toString(16)}`,
    );
  }

  let offset = 21;
  const timestamp = view.getUint32(offset, true);
  offset += 4;
  const latitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const longitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const accuracyMeters = view.getUint16(offset, true);
  offset += 2;
  const status = view.getUint8(offset++);
  const peopleCount = view.getUint8(offset++);
  const needsMask = view.getUint8(offset++);
  const batteryPercent = view.getUint8(offset++);
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const nonce = view.getUint32(offset, true);
  offset += 4;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);
  offset += 64;

  let extensions: PacketExtension[] | undefined = undefined;
  if ((header.flags & PacketFlags.HAS_EXTENSION) !== 0 && offset < buffer.length) {
    extensions = deserializeExtensions(buffer, offset);
  }

  return {
    header,
    body: {
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
      publicKey,
      signature,
      extensions,
    },
  };
}

/**
 * Creates and signs an SOS packet
 */
export async function createAndSignSos(
  params: {
    ttl?: number;
    hop?: number;
    flags?: number;
    timestamp: number;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    status: number;
    peopleCount: number;
    needsMask: number;
    batteryPercent: number;
    sequenceNumber: number;
    nonce?: number;
    extensions?: PacketExtension[];
    keyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  },
  crypto: ICrypto,
): Promise<Uint8Array> {
  const nonce = params.nonce ?? new DataView(crypto.randomBytes(4).buffer).getUint32(0, true);
  const originFp = await crypto.blake2b(params.keyPair.publicKey, 8);

  // Determine packet_id from hash of (pubkey + timestamp + nonce + seq)
  const idPreimage = new Uint8Array(32 + 4 + 4 + 2);
  idPreimage.set(params.keyPair.publicKey, 0);
  const idView = new DataView(idPreimage.buffer, idPreimage.byteOffset, idPreimage.byteLength);
  idView.setUint32(32, params.timestamp, true);
  idView.setUint32(36, nonce, true);
  idView.setUint16(40, params.sequenceNumber, true);
  const packetId = await crypto.blake2b(idPreimage, 8);

  const hasExt = params.extensions && params.extensions.length > 0;
  const flags = (params.flags ?? PacketFlags.NONE) | (hasExt ? PacketFlags.HAS_EXTENSION : 0);

  const header: CommonHeader = {
    version: PROTOCOL_VERSION,
    type: PacketType.SOS,
    flags,
    ttl: params.ttl ?? 10,
    hop: params.hop ?? 0,
    packetId,
    originFp,
  };

  const bodyWithoutSig: Omit<SosBody, 'signature'> = {
    timestamp: params.timestamp,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracyMeters: params.accuracyMeters,
    status: params.status,
    peopleCount: params.peopleCount,
    needsMask: params.needsMask,
    batteryPercent: params.batteryPercent,
    sequenceNumber: params.sequenceNumber,
    nonce,
    publicKey: params.keyPair.publicKey,
    extensions: params.extensions,
  };

  const extBytes = hasExt ? serializeExtensions(params.extensions!) : undefined;
  const preimage = getSosSigningPreimage(header, bodyWithoutSig, extBytes);
  const signature = await crypto.sign(preimage, params.keyPair.privateKey);

  return encodeSos({
    header,
    body: {
      ...bodyWithoutSig,
      signature,
    },
  });
}

/**
 * Verifies an SOS packet's Ed25519 signature
 */
export async function verifySosPacket(packetBytes: Uint8Array, crypto: ICrypto): Promise<boolean> {
  try {
    const decoded = decodeSos(packetBytes);
    const hasExt = decoded.body.extensions && decoded.body.extensions.length > 0;
    const extBytes = hasExt ? serializeExtensions(decoded.body.extensions!) : undefined;
    const preimage = getSosSigningPreimage(decoded.header, decoded.body, extBytes);

    // Verify signature with contained public key
    const sigValid = await crypto.verify(decoded.body.signature, preimage, decoded.body.publicKey);
    if (!sigValid) return false;

    // Verify origin_fp matches BLAKE2b(pubkey)
    const expectedFp = await crypto.blake2b(decoded.body.publicKey, 8);
    return areBytesEqual(decoded.header.originFp, expectedFp);
  } catch {
    return false;
  }
}

// ==============================================================================
// ACK Packet Codec (Type 0x03)
// ==============================================================================
export const ACK_PACKET_SIZE = HEADER_SIZE + 8 + 2 + 1 + 2 + 32 + 64; // 21 + 109 = 130 bytes

export function encodeAck(packet: AckPacketData): Uint8Array {
  const buffer = new Uint8Array(ACK_PACKET_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.ACK,
  });

  let offset = HEADER_SIZE;
  buffer.set(packet.body.targetPacketId.subarray(0, 8), offset);
  offset += 8;
  view.setUint16(offset, packet.body.arrivalMinutes, true);
  offset += 2;
  view.setUint8(offset++, packet.body.status);
  view.setUint16(offset, packet.body.agencyId, true);
  offset += 2;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeAck(buffer: Uint8Array): AckPacketData {
  if (buffer.length < ACK_PACKET_SIZE) {
    throw new Error(`Buffer too short for ACK: ${buffer.length} < ${ACK_PACKET_SIZE}`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.ACK) {
    throw new Error(`Expected ACK packet type 0x03, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const targetPacketId = buffer.slice(offset, offset + 8);
  offset += 8;
  const arrivalMinutes = view.getUint16(offset, true);
  offset += 2;
  const status = view.getUint8(offset++);
  const agencyId = view.getUint16(offset, true);
  offset += 2;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      targetPacketId,
      arrivalMinutes,
      status,
      agencyId,
      publicKey,
      signature,
    },
  };
}

export async function createAndSignAck(
  params: {
    ttl?: number;
    hop?: number;
    flags?: number;
    targetPacketId: Uint8Array;
    arrivalMinutes: number;
    status: number;
    agencyId: number;
    keyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  },
  crypto: ICrypto,
  packetId?: Uint8Array,
  originFp?: Uint8Array
): Promise<Uint8Array> {
  const pId = packetId ?? crypto.randomBytes(8);
  const fp = originFp ?? (await crypto.blake2b(params.keyPair.publicKey, 8));

  const header: CommonHeader = {
    version: PROTOCOL_VERSION,
    type: PacketType.ACK,
    flags: (params.flags ?? PacketFlags.NONE) | PacketFlags.FROM_RESCUER,
    ttl: params.ttl ?? 10,
    hop: params.hop ?? 0,
    packetId: pId,
    originFp: fp,
  };

  const preimage = new Uint8Array(19 + 8 + 2 + 1 + 2 + 32);
  const view = new DataView(preimage.buffer, preimage.byteOffset, preimage.byteLength);
  view.setUint8(0, header.version);
  view.setUint8(1, header.type);
  view.setUint8(2, header.flags & FLAG_IMMUTABLE_MASK);
  preimage.set(header.packetId.subarray(0, 8), 3);
  preimage.set(header.originFp.subarray(0, 8), 11);

  let offset = 19;
  preimage.set(params.targetPacketId.subarray(0, 8), offset);
  offset += 8;
  view.setUint16(offset, params.arrivalMinutes, true);
  offset += 2;
  view.setUint8(offset++, params.status);
  view.setUint16(offset, params.agencyId, true);
  offset += 2;
  preimage.set(params.keyPair.publicKey.subarray(0, 32), offset);

  const signature = await crypto.sign(preimage, params.keyPair.privateKey);

  return encodeAck({
    header,
    body: {
      targetPacketId: params.targetPacketId,
      arrivalMinutes: params.arrivalMinutes,
      status: params.status,
      agencyId: params.agencyId,
      publicKey: params.keyPair.publicKey,
      signature,
    },
  });
}

export async function verifyAckPacket(buffer: Uint8Array, crypto: ICrypto): Promise<boolean> {
  try {
    const decoded = decodeAck(buffer);
    const preimage = new Uint8Array(19 + 8 + 2 + 1 + 2 + 32);
    const view = new DataView(preimage.buffer, preimage.byteOffset, preimage.byteLength);
    view.setUint8(0, decoded.header.version);
    view.setUint8(1, decoded.header.type);
    view.setUint8(2, decoded.header.flags & FLAG_IMMUTABLE_MASK);
    preimage.set(decoded.header.packetId.subarray(0, 8), 3);
    preimage.set(decoded.header.originFp.subarray(0, 8), 11);

    let offset = 19;
    preimage.set(decoded.body.targetPacketId.subarray(0, 8), offset);
    offset += 8;
    view.setUint16(offset, decoded.body.arrivalMinutes, true);
    offset += 2;
    view.setUint8(offset++, decoded.body.status);
    view.setUint16(offset, decoded.body.agencyId, true);
    offset += 2;
    preimage.set(decoded.body.publicKey.subarray(0, 32), offset);

    return crypto.verify(decoded.body.signature, preimage, decoded.body.publicKey);
  } catch {
    return false;
  }
}

// ==============================================================================
// DEADMAN Packet Codec (Type 0x04)
// ==============================================================================
export const DEADMAN_PACKET_SIZE = HEADER_SIZE + 4 + 1 + 2 + 32 + 64; // 21 + 103 = 124 bytes

export function encodeDeadman(packet: DeadmanPacketData): Uint8Array {
  const buffer = new Uint8Array(DEADMAN_PACKET_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.DEADMAN,
  });

  let offset = HEADER_SIZE;
  view.setUint32(offset, packet.body.countdownSeconds, true);
  offset += 4;
  view.setUint8(offset++, packet.body.batteryPercent);
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeDeadman(buffer: Uint8Array): DeadmanPacketData {
  if (buffer.length < DEADMAN_PACKET_SIZE) {
    throw new Error(`Buffer too short for DEADMAN: ${buffer.length} < ${DEADMAN_PACKET_SIZE}`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.DEADMAN) {
    throw new Error(`Expected DEADMAN packet type 0x04, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const countdownSeconds = view.getUint32(offset, true);
  offset += 4;
  const batteryPercent = view.getUint8(offset++);
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      countdownSeconds,
      batteryPercent,
      sequenceNumber,
      publicKey,
      signature,
    },
  };
}

// ==============================================================================
// LOCATION Packet Codec (Type 0x05) - Compact, references pubkey by origin_fp
// ==============================================================================
export const LOCATION_PACKET_SIZE = HEADER_SIZE + 4 + 4 + 4 + 2 + 2 + 1 + 64; // 21 + 81 = 102 bytes

export function encodeLocation(packet: LocationPacketData): Uint8Array {
  const buffer = new Uint8Array(LOCATION_PACKET_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.LOCATION,
  });

  let offset = HEADER_SIZE;
  view.setUint32(offset, packet.body.timestamp, true);
  offset += 4;
  view.setInt32(offset, Math.round(packet.body.latitude * 1e7), true);
  offset += 4;
  view.setInt32(offset, Math.round(packet.body.longitude * 1e7), true);
  offset += 4;
  view.setUint16(
    offset,
    Math.min(65535, Math.max(0, Math.round(packet.body.accuracyMeters))),
    true,
  );
  offset += 2;
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  view.setUint8(offset++, packet.body.batteryPercent);
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeLocation(buffer: Uint8Array): LocationPacketData {
  if (buffer.length < LOCATION_PACKET_SIZE) {
    throw new Error(`Buffer too short for LOCATION: ${buffer.length} < ${LOCATION_PACKET_SIZE}`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.LOCATION) {
    throw new Error(`Expected LOCATION packet type 0x05, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const timestamp = view.getUint32(offset, true);
  offset += 4;
  const latitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const longitude = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const accuracyMeters = view.getUint16(offset, true);
  offset += 2;
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const batteryPercent = view.getUint8(offset++);
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      timestamp,
      latitude,
      longitude,
      accuracyMeters,
      sequenceNumber,
      batteryPercent,
      signature,
    },
  };
}

// ==============================================================================
// CHAT Packet Codec (Type 0x02)
// ==============================================================================
export function encodeChat(packet: ChatPacketData): Uint8Array {
  const cipherLen = packet.body.ciphertext.length;
  // Header(21) + recipientFp(8) + seq(2) + len(2) + ciphertext(N) + pubkey(32) + signature(64)
  const totalLen = HEADER_SIZE + 8 + 2 + 2 + cipherLen + 32 + 64;
  const buffer = new Uint8Array(totalLen);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.CHAT,
  });

  let offset = HEADER_SIZE;
  buffer.set(packet.body.recipientFp.subarray(0, 8), offset);
  offset += 8;
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  view.setUint16(offset, cipherLen, true);
  offset += 2;
  buffer.set(packet.body.ciphertext, offset);
  offset += cipherLen;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeChat(buffer: Uint8Array): ChatPacketData {
  if (buffer.length < HEADER_SIZE + 8 + 2 + 2 + 32 + 64) {
    throw new Error(`Buffer too short for CHAT`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.CHAT) {
    throw new Error(`Expected CHAT packet type 0x02, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const recipientFp = buffer.slice(offset, offset + 8);
  offset += 8;
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const cipherLen = view.getUint16(offset, true);
  offset += 2;
  if (offset + cipherLen + 32 + 64 > buffer.length) {
    throw new Error('Malformed CHAT payload: truncated ciphertext');
  }
  const ciphertext = buffer.slice(offset, offset + cipherLen);
  offset += cipherLen;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      recipientFp,
      sequenceNumber,
      ciphertext,
      publicKey,
      signature,
    },
  };
}

// ==============================================================================
// HELLO Packet Codec (Type 0x07)
// ==============================================================================
export const HELLO_PACKET_SIZE = HEADER_SIZE + 2 + 2 + 32 + 64; // 21 + 100 = 121 bytes

export function encodeHello(packet: HelloPacketData): Uint8Array {
  const buffer = new Uint8Array(HELLO_PACKET_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.HELLO,
  });

  let offset = HEADER_SIZE;
  view.setUint16(offset, packet.body.servicesMask, true);
  offset += 2;
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeHello(buffer: Uint8Array): HelloPacketData {
  if (buffer.length < HELLO_PACKET_SIZE) {
    throw new Error(`Buffer too short for HELLO`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.HELLO) {
    throw new Error(`Expected HELLO packet type 0x07, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const servicesMask = view.getUint16(offset, true);
  offset += 2;
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      servicesMask,
      sequenceNumber,
      publicKey,
      signature,
    },
  };
}

// ==============================================================================
// CHAT_RECEIPT Packet Codec (Type 0x08)
// ==============================================================================
export const CHAT_RECEIPT_PACKET_SIZE = HEADER_SIZE + 8 + 8 + 1 + 2 + 32 + 64; // 21 + 115 = 136 bytes

export function encodeChatReceipt(packet: ChatReceiptPacketData): Uint8Array {
  const buffer = new Uint8Array(CHAT_RECEIPT_PACKET_SIZE);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.CHAT_RECEIPT,
  });

  let offset = HEADER_SIZE;
  buffer.set(packet.body.targetPacketId.subarray(0, 8), offset);
  offset += 8;
  buffer.set(packet.body.recipientFp.subarray(0, 8), offset);
  offset += 8;
  view.setUint8(offset++, packet.body.status);
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeChatReceipt(buffer: Uint8Array): ChatReceiptPacketData {
  if (buffer.length < CHAT_RECEIPT_PACKET_SIZE) {
    throw new Error(`Buffer too short for CHAT_RECEIPT`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.CHAT_RECEIPT) {
    throw new Error(`Expected CHAT_RECEIPT packet type 0x08, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const targetPacketId = buffer.slice(offset, offset + 8);
  offset += 8;
  const recipientFp = buffer.slice(offset, offset + 8);
  offset += 8;
  const status = view.getUint8(offset++);
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      targetPacketId,
      recipientFp,
      status,
      sequenceNumber,
      publicKey,
      signature,
    },
  };
}

// ==============================================================================
// CLUSTER_SUMMARY Packet Codec (Type 0x06)
// ==============================================================================
export function encodeClusterSummary(packet: ClusterSummaryPacketData): Uint8Array {
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(packet.body.clusterId);
  const memberHashesCount = packet.body.memberFingerprintHashes.length;
  // Header(21) + idLen(1) + idBytes(N) + memberCount(1) + hashes(4*M) + people(2) + lat(4) + lon(4) + rad(2) + status(1) + needs(1) + battery(1) + first(4) + last(4) + seq(2) + pubkey(32) + sig(64)
  const totalLen =
    HEADER_SIZE + 1 + idBytes.length + 1 + memberHashesCount * 4 + 2 + 4 + 4 + 2 + 1 + 1 + 1 + 4 + 4 + 2 + 32 + 64;

  const buffer = new Uint8Array(totalLen);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  encodeHeader(view, {
    ...packet.header,
    type: PacketType.CLUSTER_SUMMARY,
  });

  let offset = HEADER_SIZE;
  view.setUint8(offset++, idBytes.length);
  buffer.set(idBytes, offset);
  offset += idBytes.length;

  view.setUint8(offset++, memberHashesCount);
  for (const h of packet.body.memberFingerprintHashes) {
    buffer.set(h.subarray(0, 4), offset);
    offset += 4;
  }

  view.setUint16(offset, packet.body.peopleCount, true);
  offset += 2;
  view.setInt32(offset, Math.round(packet.body.centroidLat * 1e7), true);
  offset += 4;
  view.setInt32(offset, Math.round(packet.body.centroidLon * 1e7), true);
  offset += 4;
  view.setUint16(offset, Math.min(65535, Math.round(packet.body.radiusMeters)), true);
  offset += 2;
  view.setUint8(offset++, packet.body.maxStatus);
  view.setUint8(offset++, packet.body.needsMask);
  view.setUint8(offset++, packet.body.bestBattery);
  view.setUint32(offset, packet.body.firstSeen, true);
  offset += 4;
  view.setUint32(offset, packet.body.lastSeen, true);
  offset += 4;
  view.setUint16(offset, packet.body.sequenceNumber, true);
  offset += 2;
  buffer.set(packet.body.publicKey.subarray(0, 32), offset);
  offset += 32;
  buffer.set(packet.body.signature.subarray(0, 64), offset);

  return buffer;
}

export function decodeClusterSummary(buffer: Uint8Array): ClusterSummaryPacketData {
  if (buffer.length < HEADER_SIZE + 1 + 1 + 2 + 4 + 4 + 2 + 1 + 1 + 1 + 4 + 4 + 2 + 32 + 64) {
    throw new Error('Buffer too short for CLUSTER_SUMMARY');
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decodeHeader(view);
  if (header.type !== PacketType.CLUSTER_SUMMARY) {
    throw new Error(`Expected CLUSTER_SUMMARY packet type 0x06, got 0x0${header.type.toString(16)}`);
  }

  let offset = HEADER_SIZE;
  const idLen = view.getUint8(offset++);
  const idBytes = buffer.slice(offset, offset + idLen);
  offset += idLen;
  const decoder = new TextDecoder();
  const clusterId = decoder.decode(idBytes);

  const memberHashesCount = view.getUint8(offset++);
  const memberFingerprintHashes: Uint8Array[] = [];
  for (let i = 0; i < memberHashesCount; i++) {
    memberFingerprintHashes.push(buffer.slice(offset, offset + 4));
    offset += 4;
  }

  const peopleCount = view.getUint16(offset, true);
  offset += 2;
  const centroidLat = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const centroidLon = view.getInt32(offset, true) / 1e7;
  offset += 4;
  const radiusMeters = view.getUint16(offset, true);
  offset += 2;
  const maxStatus = view.getUint8(offset++);
  const needsMask = view.getUint8(offset++);
  const bestBattery = view.getUint8(offset++);
  const firstSeen = view.getUint32(offset, true);
  offset += 4;
  const lastSeen = view.getUint32(offset, true);
  offset += 4;
  const sequenceNumber = view.getUint16(offset, true);
  offset += 2;
  const publicKey = buffer.slice(offset, offset + 32);
  offset += 32;
  const signature = buffer.slice(offset, offset + 64);

  return {
    header,
    body: {
      clusterId,
      memberFingerprintHashes,
      peopleCount,
      centroidLat,
      centroidLon,
      radiusMeters,
      maxStatus,
      needsMask,
      bestBattery,
      firstSeen,
      lastSeen,
      sequenceNumber,
      publicKey,
      signature,
    },
  };
}

export async function createAndSignClusterSummary(
  params: {
    ttl?: number;
    hop?: number;
    clusterId: string;
    memberFingerprintHashes: Uint8Array[];
    peopleCount: number;
    centroidLat: number;
    centroidLon: number;
    radiusMeters: number;
    maxStatus: number;
    needsMask: number;
    bestBattery: number;
    firstSeen: number;
    lastSeen: number;
    sequenceNumber: number;
    keyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  },
  crypto: ICrypto,
): Promise<Uint8Array> {
  const originFp = await crypto.blake2b(params.keyPair.publicKey, 8);
  const packetId = crypto.randomBytes(8);

  const header: CommonHeader = {
    version: PROTOCOL_VERSION,
    type: PacketType.CLUSTER_SUMMARY,
    flags: PacketFlags.NONE,
    ttl: params.ttl ?? 10,
    hop: params.hop ?? 0,
    packetId,
    originFp,
  };

  const bodyWithoutSig: Omit<ClusterSummaryBody, 'signature'> = {
    clusterId: params.clusterId,
    memberFingerprintHashes: params.memberFingerprintHashes,
    peopleCount: params.peopleCount,
    centroidLat: params.centroidLat,
    centroidLon: params.centroidLon,
    radiusMeters: params.radiusMeters,
    maxStatus: params.maxStatus,
    needsMask: params.needsMask,
    bestBattery: params.bestBattery,
    firstSeen: params.firstSeen,
    lastSeen: params.lastSeen,
    sequenceNumber: params.sequenceNumber,
    publicKey: params.keyPair.publicKey,
  };

  const encoder = new TextEncoder();
  const idBytes = encoder.encode(params.clusterId);
  const preimageLen = 19 + 1 + idBytes.length + 1 + params.memberFingerprintHashes.length * 4 + 2 + 4 + 4 + 2 + 1 + 1 + 1 + 4 + 4 + 2 + 32;
  const preimage = new Uint8Array(preimageLen);
  const pView = new DataView(preimage.buffer, preimage.byteOffset, preimage.byteLength);

  pView.setUint8(0, header.version);
  pView.setUint8(1, header.type);
  pView.setUint8(2, header.flags & FLAG_IMMUTABLE_MASK);
  preimage.set(header.packetId.subarray(0, 8), 3);
  preimage.set(header.originFp.subarray(0, 8), 11);

  let pOffset = 19;
  pView.setUint8(pOffset++, idBytes.length);
  preimage.set(idBytes, pOffset);
  pOffset += idBytes.length;

  pView.setUint8(pOffset++, params.memberFingerprintHashes.length);
  for (const h of params.memberFingerprintHashes) {
    preimage.set(h.subarray(0, 4), pOffset);
    pOffset += 4;
  }

  pView.setUint16(pOffset, params.peopleCount, true);
  pOffset += 2;
  pView.setInt32(pOffset, Math.round(params.centroidLat * 1e7), true);
  pOffset += 4;
  pView.setInt32(pOffset, Math.round(params.centroidLon * 1e7), true);
  pOffset += 4;
  pView.setUint16(pOffset, Math.min(65535, Math.round(params.radiusMeters)), true);
  pOffset += 2;
  pView.setUint8(pOffset++, params.maxStatus);
  pView.setUint8(pOffset++, params.needsMask);
  pView.setUint8(pOffset++, params.bestBattery);
  pView.setUint32(pOffset, params.firstSeen, true);
  pOffset += 4;
  pView.setUint32(pOffset, params.lastSeen, true);
  pOffset += 4;
  pView.setUint16(pOffset, params.sequenceNumber, true);
  pOffset += 2;
  preimage.set(params.keyPair.publicKey.subarray(0, 32), pOffset);

  const signature = await crypto.sign(preimage, params.keyPair.privateKey);

  return encodeClusterSummary({
    header,
    body: {
      ...bodyWithoutSig,
      signature,
    },
  });
}

