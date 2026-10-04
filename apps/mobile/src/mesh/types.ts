/**
 * RescueNet Store-and-Forward Mesh Engine Types & Interfaces
 */

export type MeshRole = 'survivor' | 'rescuer' | 'gateway';

export interface MeshPolicy {
  // Duty cycle intervals (ms)
  scanActiveMs: number; // e.g. 5000 ms
  scanIntervalMs: number; // e.g. 30000 ms
  scanActiveActiveMs: number; // e.g. 10000 ms when urgent packets exist
  scanIntervalActiveMs: number; // e.g. 15000 ms when urgent packets exist
  scanIntervalLowBatteryMs: number; // e.g. 60000 ms when battery <= 20%

  // Contact budgets (bytes)
  baseContactBudgetBytes: number; // 16 KB (16384 bytes)
  lowBatteryBudgetBytes: number; // 4 KB (4096 bytes)
  carrierBudgetBytes: number; // 64 KB (65536 bytes)

  // Rate limiting & backoff
  samePeerCooldownMs: number; // 60,000 ms
  maxPacketsPerOriginPerMinute: number; // 10
  maxLowTrustPacketsPerOriginPerMinute: number; // 2

  // Queue limits
  maxQueueCapacity: number; // 1000 packets
  congestionThresholdRatio: number; // 0.70 (70% full)

  // Retention windows (seconds)
  sosRetentionSeconds: number; // 72 hours (259,200 s)
  chatRetentionSeconds: number; // 6 hours (21,600 s)
  locationRetentionSeconds: number; // 30 minutes (1,800 s)
  otherRetentionSeconds: number; // 24 hours (86,400 s)
}

export const DEFAULT_MESH_POLICY: MeshPolicy = {
  scanActiveMs: 5_000,
  scanIntervalMs: 30_000,
  scanActiveActiveMs: 10_000,
  scanIntervalActiveMs: 15_000,
  scanIntervalLowBatteryMs: 60_000,

  baseContactBudgetBytes: 16_384,
  lowBatteryBudgetBytes: 4_096,
  carrierBudgetBytes: 65_536,

  samePeerCooldownMs: 60_000,
  maxPacketsPerOriginPerMinute: 10,
  maxLowTrustPacketsPerOriginPerMinute: 2,

  maxQueueCapacity: 1_000,
  congestionThresholdRatio: 0.70,

  sosRetentionSeconds: 72 * 3600,
  chatRetentionSeconds: 6 * 3600,
  locationRetentionSeconds: 30 * 60,
  otherRetentionSeconds: 24 * 3600,
};

export type PacketRejectionReason =
  | 'bad_version'
  | 'future_timestamp'
  | 'expired_timestamp'
  | 'invalid_signature'
  | 'replay_seq'
  | 'replay_nonce'
  | 'rate_limit_exceeded'
  | 'ttl_exhausted'
  | 'hop_limit_reached'
  | 'corrupted_packet';

export interface PacketValidationResult {
  valid: boolean;
  lowTrust: boolean; // True for unsigned or unverifiable SOS from unknown origin (Rule 3)
  reason?: PacketRejectionReason;
}

export interface MeshMetrics {
  packetsSeen: number;
  packetsForwarded: number;
  packetsDeduplicated: number;
  packetsRejected: number;
  rejectionCounts: Record<PacketRejectionReason, number>;
  bytesSent: number;
  bytesReceived: number;
  contactsCount: number;
  contactsPerHour: number;
  estimatedBatteryMah: number;
}

export interface HourlyMetricRecord {
  hourTimestamp: number; // Unix hour timestamp
  packetsSeen: number;
  packetsForwarded: number;
  bytesSent: number;
  bytesReceived: number;
  contacts: number;
  batteryDropPercent: number;
}

export interface PeerHandshakeControl {
  protocolVersion: number;
  role: MeshRole;
  batteryPercent: number;
  isCharging: boolean;
  negotiatedMtu: number;
  capabilitiesMask: number;
  clockOffsetMs: number;
}
