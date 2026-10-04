/**
 * Spatial Clustering Engine (Incremental & DBSCAN)
 * Groups nearby disaster survivors, creates deterministic cluster IDs, and handles merges/splits.
 */

import { haversineDistanceMeters } from './haversine';
import { TriageStatus } from '../codec/types';

export interface ClusterMember {
  originFpHex: string; // 16 hex chars (8 bytes)
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  peopleCount: number;
  status: TriageStatus;
  needsMask: number;
  batteryPercent: number;
  altitudeMeters?: number;
  timestamp: number; // unix seconds
}

export interface ClusterRecord {
  clusterId: string;
  memberFingerprints: string[];
  members: ClusterMember[];
  declaredPeople: number;
  centroid: {
    latitude: number;
    longitude: number;
  };
  boundingRadiusMeters: number;
  firstSeen: number;
  lastSeen: number;
  maxSeverity: TriageStatus;
  aggregateNeedsMask: number;
  bestBattery: number;
  floorHint?: number; // average altitude
}

export const DEFAULT_CLUSTER_EPS_METERS = 40; // 40m proximity threshold
export const TIME_BUCKET_SECONDS = 900; // 15-minute bucket for deterministic ID

/**
 * Computes deterministic cluster ID from earliest member fingerprint and time bucket
 */
export function generateDeterministicClusterId(
  earliestOriginFpHex: string,
  timestamp: number,
): string {
  const bucket = Math.floor(timestamp / TIME_BUCKET_SECONDS);
  return `CL_${earliestOriginFpHex.toLowerCase()}_${bucket}`;
}

/**
 * Computes accuracy-weighted centroid and bounding radius for a group of members
 */
export function computeCentroidAndRadius(members: ClusterMember[]): {
  centroid: { latitude: number; longitude: number };
  boundingRadiusMeters: number;
} {
  if (members.length === 0) {
    return { centroid: { latitude: 0, longitude: 0 }, boundingRadiusMeters: 0 };
  }
  if (members.length === 1) {
    const m = members[0]!;
    return {
      centroid: { latitude: m.latitude, longitude: m.longitude },
      boundingRadiusMeters: m.accuracyMeters,
    };
  }

  let totalWeight = 0;
  let weightedLatSum = 0;
  let weightedLonSum = 0;

  for (const m of members) {
    const weight = 1 / Math.max(1, m.accuracyMeters);
    totalWeight += weight;
    weightedLatSum += m.latitude * weight;
    weightedLonSum += m.longitude * weight;
  }

  const centroid = {
    latitude: weightedLatSum / totalWeight,
    longitude: weightedLonSum / totalWeight,
  };

  let maxDist = 0;
  for (const m of members) {
    const dist = haversineDistanceMeters(centroid, {
      latitude: m.latitude,
      longitude: m.longitude,
    });
    if (dist > maxDist) {
      maxDist = dist;
    }
  }

  return { centroid, boundingRadiusMeters: maxDist };
}

/**
 * Builds a ClusterRecord from an array of members
 */
export function buildClusterRecord(members: ClusterMember[]): ClusterRecord {
  if (members.length === 0) {
    throw new Error('Cannot create empty cluster record');
  }

  // Sort members by timestamp to find earliest
  const sorted = [...members].sort((a, b) => a.timestamp - b.timestamp);
  const earliest = sorted[0]!;
  const clusterId = generateDeterministicClusterId(earliest.originFpHex, earliest.timestamp);

  const { centroid, boundingRadiusMeters } = computeCentroidAndRadius(members);

  let declaredPeople = 0;
  let maxSeverity: TriageStatus = TriageStatus.SAFE;
  let aggregateNeedsMask = 0;
  let bestBattery = 0;
  let firstSeen = members[0]!.timestamp;
  let lastSeen = members[0]!.timestamp;
  let altitudeSum = 0;
  let altitudeCount = 0;

  const fps = new Set<string>();

  for (const m of members) {
    fps.add(m.originFpHex);
    declaredPeople += m.peopleCount;
    if (m.status > maxSeverity) {
      maxSeverity = m.status;
    }
    aggregateNeedsMask |= m.needsMask;
    if (m.batteryPercent > bestBattery) {
      bestBattery = m.batteryPercent;
    }
    if (m.timestamp < firstSeen) firstSeen = m.timestamp;
    if (m.timestamp > lastSeen) lastSeen = m.timestamp;
    if (m.altitudeMeters !== undefined) {
      altitudeSum += m.altitudeMeters;
      altitudeCount++;
    }
  }

  return {
    clusterId,
    memberFingerprints: Array.from(fps).sort(),
    members: sorted,
    declaredPeople,
    centroid,
    boundingRadiusMeters,
    firstSeen,
    lastSeen,
    maxSeverity,
    aggregateNeedsMask,
    bestBattery,
    floorHint: altitudeCount > 0 ? Math.round((altitudeSum / altitudeCount) * 10) / 10 : undefined,
  };
}

/**
 * Merges two clusters deterministically
 * Commutative: merge(A, B) produces equivalent record as merge(B, A)
 * Idempotent: merge(A, A) produces equivalent record as A
 */
export function mergeClusters(c1: ClusterRecord, c2: ClusterRecord): ClusterRecord {
  // Deduplicate members by originFpHex, retaining latest telemetry per member
  const memberMap = new Map<string, ClusterMember>();
  for (const m of [...c1.members, ...c2.members]) {
    const existing = memberMap.get(m.originFpHex);
    if (!existing || m.timestamp >= existing.timestamp) {
      memberMap.set(m.originFpHex, m);
    }
  }

  const combinedMembers = Array.from(memberMap.values());
  const merged = buildClusterRecord(combinedMembers);

  // Deterministic cluster ID resolution: choose the lex minimum of c1.clusterId and c2.clusterId
  // or the deterministic ID from earliest member
  const chosenId = [c1.clusterId, c2.clusterId, merged.clusterId].sort()[0]!;
  merged.clusterId = chosenId;

  return merged;
}

/**
 * Splits a cluster when members drift apart by > 2*eps for longer than driftTimeSeconds
 * Also splits if altitude differs by > 3 meters
 */
export function splitCluster(
  cluster: ClusterRecord,
  epsMeters: number = DEFAULT_CLUSTER_EPS_METERS,
  driftTimeSeconds: number = 300, // 5 minutes
  nowSeconds?: number,
): ClusterRecord[] {
  if (cluster.members.length <= 1) {
    return [cluster];
  }

  const now = nowSeconds ?? Math.max(...cluster.members.map(m => m.timestamp));
  const driftThreshold = 2 * epsMeters;

  // Group members using connected components based on distance and altitude
  const visited = new Set<number>();
  const subClusters: ClusterMember[][] = [];

  for (let i = 0; i < cluster.members.length; i++) {
    if (visited.has(i)) continue;

    const component: ClusterMember[] = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const currIdx = queue.shift()!;
      const curr = cluster.members[currIdx]!;
      component.push(curr);

      for (let j = 0; j < cluster.members.length; j++) {
        if (!visited.has(j)) {
          const other = cluster.members[j]!;
          const dist = haversineDistanceMeters(
            { latitude: curr.latitude, longitude: curr.longitude },
            { latitude: other.latitude, longitude: other.longitude },
          );

          // Floor separation check: split if altitude differs by > 3 meters
          let altitudeOk = true;
          if (curr.altitudeMeters !== undefined && other.altitudeMeters !== undefined) {
            if (Math.abs(curr.altitudeMeters - other.altitudeMeters) > 3) {
              altitudeOk = false;
            }
          }

          // Distance check
          if (dist <= driftThreshold && altitudeOk) {
            visited.add(j);
            queue.push(j);
          }
        }
      }
    }

    subClusters.push(component);
  }

  // If there's only 1 component, no split needed
  if (subClusters.length <= 1) {
    return [cluster];
  }

  // Only perform split if the drift condition has persisted for > driftTimeSeconds
  const timeSpan = cluster.lastSeen - cluster.firstSeen;
  if (timeSpan < driftTimeSeconds && now - cluster.firstSeen < driftTimeSeconds) {
    return [cluster];
  }

  return subClusters.map(members => buildClusterRecord(members));
}

/**
 * Incremental Clusterer: Adds members one by one to nearest cluster within eps
 */
export class IncrementalClusterer {
  private clusters: Map<string, ClusterRecord> = new Map();

  constructor(private readonly epsMeters: number = DEFAULT_CLUSTER_EPS_METERS) {}

  public addMember(member: ClusterMember): ClusterRecord {
    let nearestCluster: ClusterRecord | null = null;
    let minDist = Infinity;

    for (const cluster of this.clusters.values()) {
      const dist = haversineDistanceMeters(cluster.centroid, {
        latitude: member.latitude,
        longitude: member.longitude,
      });

      // Altitude check: if both have altitude, reject if delta > 3m
      let altDeltaOk = true;
      if (member.altitudeMeters !== undefined && cluster.floorHint !== undefined) {
        if (Math.abs(member.altitudeMeters - cluster.floorHint) > 3) {
          altDeltaOk = false;
        }
      }

      if (dist <= this.epsMeters && altDeltaOk && dist < minDist) {
        minDist = dist;
        nearestCluster = cluster;
      }
    }

    if (nearestCluster) {
      // Update existing cluster
      const existingMembers = nearestCluster.members.filter(
        m => m.originFpHex !== member.originFpHex,
      );
      existingMembers.push(member);
      const updated = buildClusterRecord(existingMembers);
      // Retain original cluster ID for stability
      updated.clusterId = nearestCluster.clusterId;
      this.clusters.set(updated.clusterId, updated);
      return updated;
    } else {
      // Start a new cluster
      const newCluster = buildClusterRecord([member]);
      this.clusters.set(newCluster.clusterId, newCluster);
      return newCluster;
    }
  }

  public getClusters(): ClusterRecord[] {
    return Array.from(this.clusters.values());
  }

  public clear(): void {
    this.clusters.clear();
  }
}

/**
 * Batch DBSCAN Clustering
 * eps: neighborhood radius in meters (default 40m)
 * minPts: minimum points to form a core cluster (default 1)
 */
export function dbscanClustering(
  members: ClusterMember[],
  epsMeters: number = DEFAULT_CLUSTER_EPS_METERS,
  minPts: number = 1,
): ClusterRecord[] {
  if (members.length === 0) return [];

  const visited = new Set<number>();
  const clusters: ClusterMember[][] = [];

  function regionQuery(pIdx: number): number[] {
    const neighbors: number[] = [];
    const p = members[pIdx]!;
    for (let i = 0; i < members.length; i++) {
      const other = members[i]!;
      const dist = haversineDistanceMeters(
        { latitude: p.latitude, longitude: p.longitude },
        { latitude: other.latitude, longitude: other.longitude },
      );

      let altOk = true;
      if (p.altitudeMeters !== undefined && other.altitudeMeters !== undefined) {
        if (Math.abs(p.altitudeMeters - other.altitudeMeters) > 3) {
          altOk = false;
        }
      }

      if (dist <= epsMeters && altOk) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < members.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      // In minPts=1, every point is a core point.
      continue;
    }

    const currentCluster: ClusterMember[] = [members[i]!];

    const queue = [...neighbors.filter(n => n !== i)];
    for (let q = 0; q < queue.length; q++) {
      const neighborIdx = queue[q]!;
      if (!visited.has(neighborIdx)) {
        visited.add(neighborIdx);
        const subNeighbors = regionQuery(neighborIdx);
        if (subNeighbors.length >= minPts) {
          for (const sn of subNeighbors) {
            if (!queue.includes(sn) && sn !== i) {
              queue.push(sn);
            }
          }
        }
      }

      if (!currentCluster.some(m => m.originFpHex === members[neighborIdx]!.originFpHex)) {
        currentCluster.push(members[neighborIdx]!);
      }
    }

    clusters.push(currentCluster);
  }

  return clusters.map(c => buildClusterRecord(c));
}
