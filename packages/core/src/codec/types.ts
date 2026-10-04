/**
 * RescueNet Binary Packet Header & Body Types
 */

export const PROTOCOL_VERSION = 1;

export enum PacketType {
  SOS = 0x01,
  CHAT = 0x02,
  ACK = 0x03,
  DEADMAN = 0x04,
  LOCATION = 0x05,
  CLUSTER_SUMMARY = 0x06,
  HELLO = 0x07,
  CHAT_RECEIPT = 0x08,
}

export enum PacketFlags {
  NONE = 0x00,
  HAS_EXTENSION = 1 << 0, // 0x01
  ENCRYPTED = 1 << 1, // 0x02
  FROM_RESCUER = 1 << 2, // 0x04
  TEST_DRILL = 1 << 3, // 0x08
  SMS_PROFILE = 1 << 4, // 0x10
}

export const FLAG_IMMUTABLE_MASK = 0x1f; // Bits 0-4 are immutable; bits 5-7 reserved mutable

export enum TriageStatus {
  SAFE = 0,
  INJURED = 1,
  TRAPPED = 2,
  CRITICAL = 3,
}

export enum NeedsBitmask {
  NONE = 0x00,
  MEDICAL = 1 << 0, // 0x01
  WATER = 1 << 1, // 0x02
  FOOD = 1 << 2, // 0x04
  SHELTER = 1 << 3, // 0x08
  EVACUATION = 1 << 4, // 0x10
  MEDICINE = 1 << 5, // 0x20
  CHILD_OR_ELDERLY = 1 << 6, // 0x40
  MOBILITY_ISSUE = 1 << 7, // 0x80
}

export enum ExtensionType {
  ALTITUDE_METERS = 0x01, // 2B int16
  SHORT_NOTE = 0x02, // UTF-8 string <= 24 bytes
  WIFI_BSSID = 0x03, // 6B MAC address
}

export interface PacketExtension {
  type: ExtensionType;
  value: Uint8Array;
}

export interface CommonHeader {
  version: number; // 1B uint8
  type: PacketType; // 1B uint8
  flags: number; // 1B uint8
  ttl: number; // 1B uint8 (mutable)
  hop: number; // 1B uint8 (mutable)
  packetId: Uint8Array; // 8B
  originFp: Uint8Array; // 8B
}

export interface SosBody {
  timestamp: number; // 4B uint32 (unix seconds)
  latitude: number; // 4B int32 (degrees * 1e7)
  longitude: number; // 4B int32 (degrees * 1e7)
  accuracyMeters: number; // 2B uint16
  status: TriageStatus; // 1B uint8
  peopleCount: number; // 1B uint8 (1-255)
  needsMask: number; // 1B uint8 bitmask
  batteryPercent: number; // 1B uint8 (0-100)
  sequenceNumber: number; // 2B uint16
  nonce: number; // 4B uint32
  publicKey: Uint8Array; // 32B Ed25519 public key
  signature: Uint8Array; // 64B Ed25519 signature
  extensions?: PacketExtension[];
}

export interface SosPacketData {
  header: CommonHeader;
  body: SosBody;
}

export interface AckBody {
  targetPacketId: Uint8Array; // 8B
  arrivalMinutes: number; // 2B uint16
  status: number; // 1B uint8 (e.g. 1 Dispatched, 2 Enroute, 3 OnScene, 4 Resolved)
  agencyId: number; // 2B uint16
  publicKey: Uint8Array; // 32B Ed25519 public key
  signature: Uint8Array; // 64B Ed25519 signature
}

export interface AckPacketData {
  header: CommonHeader;
  body: AckBody;
}

export interface DeadmanBody {
  countdownSeconds: number; // 4B uint32
  batteryPercent: number; // 1B uint8
  sequenceNumber: number; // 2B uint16
  publicKey: Uint8Array; // 32B
  signature: Uint8Array; // 64B
}

export interface DeadmanPacketData {
  header: CommonHeader;
  body: DeadmanBody;
}

export interface LocationBody {
  timestamp: number; // 4B uint32
  latitude: number; // 4B int32 (* 1e7)
  longitude: number; // 4B int32 (* 1e7)
  accuracyMeters: number; // 2B uint16
  sequenceNumber: number; // 2B uint16
  batteryPercent: number; // 1B uint8
  signature: Uint8Array; // 64B (verified against known cached pubkey for originFp)
}

export interface LocationPacketData {
  header: CommonHeader;
  body: LocationBody;
}

export interface ChatBody {
  recipientFp: Uint8Array; // 8B
  sequenceNumber: number; // 2B uint16
  ciphertext: Uint8Array; // variable length
  publicKey: Uint8Array; // 32B
  signature: Uint8Array; // 64B
}

export interface ChatPacketData {
  header: CommonHeader;
  body: ChatBody;
}

export interface HelloBody {
  servicesMask: number; // 2B uint16
  sequenceNumber: number; // 2B uint16
  publicKey: Uint8Array; // 32B
  signature: Uint8Array; // 64B
}

export interface HelloPacketData {
  header: CommonHeader;
  body: HelloBody;
}

export interface ChatReceiptBody {
  targetPacketId: Uint8Array; // 8B
  recipientFp: Uint8Array; // 8B
  status: number; // 1B uint8 (1=received, 2=read)
  sequenceNumber: number; // 2B uint16
  publicKey: Uint8Array; // 32B
  signature: Uint8Array; // 64B
}

export interface ChatReceiptPacketData {
  header: CommonHeader;
  body: ChatReceiptBody;
}

export interface ClusterSummaryBody {
  clusterId: string; // e.g. CL_4a9b2c8f1e7d3a01_1820
  memberFingerprintHashes: Uint8Array[]; // list of 4B member hashes
  peopleCount: number; // 2B uint16
  centroidLat: number; // 4B int32 (* 1e7)
  centroidLon: number; // 4B int32 (* 1e7)
  radiusMeters: number; // 2B uint16
  maxStatus: number; // 1B uint8
  needsMask: number; // 1B uint8
  bestBattery: number; // 1B uint8
  firstSeen: number; // 4B uint32
  lastSeen: number; // 4B uint32
  sequenceNumber: number; // 2B uint16
  publicKey: Uint8Array; // 32B
  signature: Uint8Array; // 64B
}

export interface ClusterSummaryPacketData {
  header: CommonHeader;
  body: ClusterSummaryBody;
}
