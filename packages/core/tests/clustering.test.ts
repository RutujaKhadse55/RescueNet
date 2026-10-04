import * as fc from 'fast-check';
import {
  haversineDistanceMeters,
  IncrementalClusterer,
  dbscanClustering,
  buildClusterRecord,
  mergeClusters,
  splitCluster,
  computeCentroidAndRadius,
  ClusterMember,
  TriageStatus,
  NeedsBitmask,
} from '../src/index';

describe('Spatial Clustering Engine', () => {
  it('computes accurate Haversine distances', () => {
    // Distance between 2 points in Pune, India ~1.1 km
    const p1 = { latitude: 18.5204, longitude: 73.8567 };
    const p2 = { latitude: 18.5304, longitude: 73.8567 };

    const dist = haversineDistanceMeters(p1, p2);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1200);

    // Distance to same point is 0
    expect(haversineDistanceMeters(p1, p1)).toBe(0);
  });

  it('clusters nearby members incrementally with accuracy-weighted centroid', () => {
    const clusterer = new IncrementalClusterer(40); // 40m eps

    // Member 1
    const m1: ClusterMember = {
      originFpHex: '0102030405060708',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 3,
      status: TriageStatus.INJURED,
      needsMask: NeedsBitmask.WATER,
      batteryPercent: 80,
      timestamp: 1700000000,
    };

    // Member 2 (~10m away from Member 1)
    const m2: ClusterMember = {
      originFpHex: 'aabbccddeeff0011',
      latitude: 18.52048,
      longitude: 73.8567,
      accuracyMeters: 10,
      peopleCount: 2,
      status: TriageStatus.CRITICAL,
      needsMask: NeedsBitmask.MEDICAL,
      batteryPercent: 90,
      timestamp: 1700000050,
    };

    const c1 = clusterer.addMember(m1);
    expect(clusterer.getClusters().length).toBe(1);
    expect(c1.declaredPeople).toBe(3);

    const c2 = clusterer.addMember(m2);
    expect(clusterer.getClusters().length).toBe(1); // Joined same cluster!
    expect(c2.declaredPeople).toBe(5);
    expect(c2.maxSeverity).toBe(TriageStatus.CRITICAL);
    expect(c2.bestBattery).toBe(90);
    expect(c2.aggregateNeedsMask).toBe(NeedsBitmask.WATER | NeedsBitmask.MEDICAL);
    expect(c2.memberFingerprints.length).toBe(2);

    // Member 3 (500m away, should start a new cluster)
    const m3: ClusterMember = {
      originFpHex: '9988776655443322',
      latitude: 18.525,
      longitude: 73.8567,
      accuracyMeters: 10,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 99,
      timestamp: 1700000100,
    };

    clusterer.addMember(m3);
    expect(clusterer.getClusters().length).toBe(2);
  });

  it('separates members across floor levels if altitude differs by > 3m', () => {
    const clusterer = new IncrementalClusterer(40);

    const groundFloor: ClusterMember = {
      originFpHex: '0000000000000001',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 2,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 80,
      altitudeMeters: 10,
      timestamp: 1700000000,
    };

    const topFloor: ClusterMember = {
      originFpHex: '0000000000000002',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 2,
      status: TriageStatus.TRAPPED,
      needsMask: NeedsBitmask.EVACUATION,
      batteryPercent: 75,
      altitudeMeters: 25, // Delta = 15m > 3m
      timestamp: 1700000010,
    };

    clusterer.addMember(groundFloor);
    clusterer.addMember(topFloor);

    // Must be in separate clusters despite same lat/lon!
    expect(clusterer.getClusters().length).toBe(2);
  });

  it('splits clusters when members drift apart over 5 minutes', () => {
    const m1: ClusterMember = {
      originFpHex: '1111111111111111',
      latitude: 18.52,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 80,
      timestamp: 1700000000,
    };
    // 200m away (drift > 2*eps = 80m)
    const m2: ClusterMember = {
      originFpHex: '2222222222222222',
      latitude: 18.522,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 80,
      timestamp: 1700000400, // 400s > 300s (5 mins)
    };

    const cluster = buildClusterRecord([m1, m2]);
    const splitResult = splitCluster(cluster, 40, 300, 1700000400);

    expect(splitResult.length).toBe(2);
    expect(splitResult[0]!.memberFingerprints).toContain('1111111111111111');
    expect(splitResult[1]!.memberFingerprints).toContain('2222222222222222');
  });

  it('handles edge cases for empty centroid, empty build, and cluster clear', () => {
    const clusterer = new IncrementalClusterer(40);
    clusterer.addMember({
      originFpHex: '0101010101010101',
      latitude: 10,
      longitude: 20,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 50,
      timestamp: 100,
    });
    expect(clusterer.getClusters().length).toBe(1);
    clusterer.clear();
    expect(clusterer.getClusters().length).toBe(0);

    // Empty build throws
    expect(() => buildClusterRecord([])).toThrow();

    // Single member split returns original
    const single = buildClusterRecord([
      {
        originFpHex: '0101010101010101',
        latitude: 10,
        longitude: 20,
        accuracyMeters: 5,
        peopleCount: 1,
        status: TriageStatus.SAFE,
        needsMask: 0,
        batteryPercent: 50,
        timestamp: 100,
      },
    ]);
    expect(splitCluster(single)).toEqual([single]);

    // Empty DBSCAN
    expect(dbscanClustering([])).toEqual([]);

    // DBSCAN with minPts=2 separating isolated noise points
    const p1: ClusterMember = {
      originFpHex: '0000000000000001',
      latitude: 10,
      longitude: 20,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 50,
      timestamp: 100,
    };
    const p2: ClusterMember = {
      originFpHex: '0000000000000002',
      latitude: 10.0001,
      longitude: 20,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 50,
      timestamp: 100,
    };
    const pIsolated: ClusterMember = {
      originFpHex: '0000000000000003',
      latitude: 11,
      longitude: 21,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 50,
      timestamp: 100,
    };
    const clusters = dbscanClustering([p1, p2, pIsolated], 40, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.memberFingerprints).toContain('0000000000000001');
    expect(clusters[0]!.memberFingerprints).toContain('0000000000000002');

    // computeCentroidAndRadius([]) empty check
    const emptyCentroid = computeCentroidAndRadius([]);
    expect(emptyCentroid.boundingRadiusMeters).toBe(0);

    // splitCluster with altitude delta > 3m
    const mAlt1: ClusterMember = {
      originFpHex: '00000000000000aa',
      latitude: 18.52,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 80,
      altitudeMeters: 5,
      timestamp: 1700000000,
    };
    const mAlt2: ClusterMember = {
      originFpHex: '00000000000000bb',
      latitude: 18.52,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 1,
      status: TriageStatus.SAFE,
      needsMask: 0,
      batteryPercent: 80,
      altitudeMeters: 20, // Delta 15m > 3m
      timestamp: 1700000400,
    };
    const altCluster = buildClusterRecord([mAlt1, mAlt2]);
    const altSplit = splitCluster(altCluster, 40, 300, 1700000400);
    expect(altSplit.length).toBe(2);

    // splitCluster where time elapsed < driftTimeSeconds (returns [cluster] without splitting)
    const mQuick1: ClusterMember = { ...mAlt1, timestamp: 1700000000 };
    const mQuick2: ClusterMember = { ...mAlt2, latitude: 18.53, timestamp: 1700000050 }; // 50s < 300s
    const quickCluster = buildClusterRecord([mQuick1, mQuick2]);
    const quickSplit = splitCluster(quickCluster, 40, 300, 1700000050);
    expect(quickSplit.length).toBe(1);
  });

  describe('Property-Based Testing (fast-check)', () => {
    const memberArbitrary = fc.record<ClusterMember>({
      originFpHex: fc.hexaString({ minLength: 16, maxLength: 16 }),
      latitude: fc.float({ min: -85, max: 85, noNaN: true }),
      longitude: fc.float({ min: -175, max: 175, noNaN: true }),
      accuracyMeters: fc.integer({ min: 1, max: 100 }),
      peopleCount: fc.integer({ min: 1, max: 20 }),
      status: fc.constantFrom(
        TriageStatus.SAFE,
        TriageStatus.INJURED,
        TriageStatus.TRAPPED,
        TriageStatus.CRITICAL,
      ),
      needsMask: fc.integer({ min: 0, max: 255 }),
      batteryPercent: fc.integer({ min: 0, max: 100 }),
      timestamp: fc.integer({ min: 1700000000, max: 1700050000 }),
    });

    it('merge is commutative: merge(A, B) === merge(B, A)', () => {
      fc.assert(
        fc.property(
          fc.array(memberArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(memberArbitrary, { minLength: 1, maxLength: 5 }),
          (mList1, mList2) => {
            const cA = buildClusterRecord(mList1);
            const cB = buildClusterRecord(mList2);

            const mergedAB = mergeClusters(cA, cB);
            const mergedBA = mergeClusters(cB, cA);

            expect(mergedAB.clusterId).toBe(mergedBA.clusterId);
            expect(mergedAB.declaredPeople).toBe(mergedBA.declaredPeople);
            expect(mergedAB.maxSeverity).toBe(mergedBA.maxSeverity);
            expect(mergedAB.memberFingerprints).toEqual(mergedBA.memberFingerprints);
            expect(mergedAB.centroid.latitude).toBeCloseTo(mergedBA.centroid.latitude, 6);
            expect(mergedAB.centroid.longitude).toBeCloseTo(mergedBA.centroid.longitude, 6);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('merge is idempotent: merge(A, A) === A', () => {
      fc.assert(
        fc.property(fc.array(memberArbitrary, { minLength: 1, maxLength: 5 }), members => {
          const cA = buildClusterRecord(members);
          const mergedAA = mergeClusters(cA, cA);

          expect(mergedAA.clusterId).toBe(cA.clusterId);
          expect(mergedAA.declaredPeople).toBe(cA.declaredPeople);
          expect(mergedAA.maxSeverity).toBe(cA.maxSeverity);
          expect(mergedAA.memberFingerprints).toEqual(cA.memberFingerprints);
          expect(mergedAA.centroid.latitude).toBeCloseTo(cA.centroid.latitude, 6);
          expect(mergedAA.centroid.longitude).toBeCloseTo(cA.centroid.longitude, 6);
        }),
        { numRuns: 100 },
      );
    });

    it('batch DBSCAN is order-independent for deterministic inputs', () => {
      const p1: ClusterMember = {
        originFpHex: '0000000000000001',
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        peopleCount: 1,
        status: TriageStatus.SAFE,
        needsMask: 0,
        batteryPercent: 90,
        timestamp: 1700000000,
      };
      const p2: ClusterMember = {
        originFpHex: '0000000000000002',
        latitude: 18.5205,
        longitude: 73.8567,
        accuracyMeters: 5,
        peopleCount: 2,
        status: TriageStatus.CRITICAL,
        needsMask: NeedsBitmask.MEDICAL,
        batteryPercent: 80,
        timestamp: 1700000010,
      };

      const res1 = dbscanClustering([p1, p2], 40);
      const res2 = dbscanClustering([p2, p1], 40);

      expect(res1.length).toBe(1);
      expect(res2.length).toBe(1);
      expect(res1[0]!.memberFingerprints).toEqual(res2[0]!.memberFingerprints);
      expect(res1[0]!.declaredPeople).toBe(res2[0]!.declaredPeople);
    });
  });
});
