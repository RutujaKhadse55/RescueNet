/**
 * RescueNet Core Shared Library
 * Pure TypeScript, platform-agnostic protocol definitions, codecs, and algorithms.
 */

// Cryptography
export * from './crypto/types';
export * from './crypto/sodium';

// Binary Codec & Types
export * from './codec/types';
export * from './codec/packet';
export * from './codec/fragmentation';

// SMS Profile
export * from './sms/smsCodec';

// Priority Scoring
export * from './priority/scoring';

// Spatial Clustering
export * from './clustering/haversine';
export * from './clustering/clusterer';

// Mesh Synchronization Logic
export * from './mesh/sync';

// Trust Scoring Inputs
export * from './trust/trustScore';

// Rescuer Credentials & Homing Mode (Phase 13)
export * from './rescuer/credentials';
export * from './rescuer/homing';

/**
 * Validates protocol version compatibility
 */
export function isVersionCompatible(version: number): boolean {
  return version === 1;
}
