import {
  SodiumCrypto,
  createAndSignSos,
  PacketType,
  ClusterMember,
  splitCluster,
  DEFAULT_CLUSTER_EPS_METERS,
} from '@rescuenet/core';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { InMemoryKeyStore } from '../src/security/keystore';
import { MeshClusterer } from '../src/clustering/MeshClusterer';

describe('Phase 8: On-Device Clustering Engine', () => {
  let crypto: SodiumCrypto;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
  });

  async function createClustererInstance() {
    const keystore = new InMemoryKeyStore();
    const db = await DatabaseManager.create(true, keystore, crypto);
    const clusterer = new MeshClusterer(db, crypto);
    return { clusterer, db, keystore };
  }

  test('10 simulated devices around 3 positions produce 3 clusters on every device with identical cluster_ids', async () => {
    // 3 distinct centers separated by > 500m
    // Center 1: Pune Station (18.5284, 73.8743) - 4 devices
    // Center 2: Deccan Gymkhana (18.5167, 73.8415) - 3 devices
    // Center 3: Shivaji Nagar (18.5314, 73.8446) - 3 devices

    const positions = [
      // Cluster 1 (4 devices within 20m of center 1)
      { lat: 18.5284, lon: 73.8743, people: 2, status: 2 },
      { lat: 18.5285, lon: 73.8744, people: 1, status: 1 },
      { lat: 18.5283, lon: 73.8742, people: 3, status: 3 },
      { lat: 18.5286, lon: 73.8741, people: 1, status: 1 },

      // Cluster 2 (3 devices within 20m of center 2)
      { lat: 18.5167, lon: 73.8415, people: 1, status: 2 },
      { lat: 18.5168, lon: 73.8416, people: 2, status: 1 },
      { lat: 18.5166, lon: 73.8414, people: 1, status: 3 },

      // Cluster 3 (3 devices within 20m of center 3)
      { lat: 18.5314, lon: 73.8446, people: 4, status: 1 },
      { lat: 18.5315, lon: 73.8447, people: 1, status: 2 },
      { lat: 18.5313, lon: 73.8445, people: 2, status: 2 },
    ];

    // Generate deterministic fixed keys & fingerprints for the 10 devices
    const deviceData: Array<{
      rawSos: Uint8Array;
      originFpHex: string;
    }> = [];

    const baseTimestamp = 1760000000; // Fixed timestamp within a deterministic 15-min bucket

    for (let i = 0; i < 10; i++) {
      const keyPair = await crypto.generateKeyPair();
      const originFp = new Uint8Array(8);
      // Give fixed deterministic fingerprint prefix: e.g. 0x01, 0x02...
      originFp[0] = i + 1;
      const originFpHex = Array.from(originFp)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const pos = positions[i]!;
      const sos = await createAndSignSos(
        {
          ttl: 6,
          hop: 0,
          timestamp: baseTimestamp + i * 5,
          latitude: pos.lat,
          longitude: pos.lon,
          accuracyMeters: 8,
          status: pos.status,
          peopleCount: pos.people,
          needsMask: 0x03,
          batteryPercent: 80 - i,
          sequenceNumber: 1,
          keyPair,
        },
        crypto,
        crypto.randomBytes(8),
        originFp,
      );

      deviceData.push({ rawSos: sos, originFpHex });
    }

    // Now instantiate 2 independent phones/clusterers (e.g. Phone A and Phone B)
    // After exchanging and ingesting the 10 SOS packets, both independently compute clusters
    const phoneA = await createClustererInstance();
    const phoneB = await createClustererInstance();

    // Ingest all 10 packets on Phone A
    for (const d of deviceData) {
      await phoneA.clusterer.onPacketAccepted(d.rawSos, PacketType.SOS, d.originFpHex);
    }

    // Ingest all 10 packets on Phone B
    for (const d of deviceData) {
      await phoneB.clusterer.onPacketAccepted(d.rawSos, PacketType.SOS, d.originFpHex);
    }

    // Run full DBSCAN recluster on both phones
    const clustersA = await phoneA.clusterer.runFullRecluster();
    const clustersB = await phoneB.clusterer.runFullRecluster();

    // Verify both produce exactly 3 clusters
    expect(clustersA.length).toBe(3);
    expect(clustersB.length).toBe(3);

    // Verify identical cluster_id values
    const idsA = clustersA.map(c => c.clusterId).sort();
    const idsB = clustersB.map(c => c.clusterId).sort();
    expect(idsA).toEqual(idsB);

    // Verify survivor count totals
    const totalSurvivors = clustersA.reduce((sum, c) => sum + c.declaredPeople, 0);
    // 2+1+3+1 + 1+2+1 + 4+1+2 = 18 survivors
    expect(totalSurvivors).toBe(18);

    await phoneA.db.close();
    await phoneB.db.close();
  });

  test('Moving one device 100m away splits it out within 5 minutes', async () => {
    const { clusterer, db } = await createClustererInstance();
    const now = Math.floor(Date.now() / 1000);

    // Member 1 at baseline position
    const m1: ClusterMember = {
      originFpHex: '0100000000000000',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 1,
      status: 1,
      needsMask: 1,
      batteryPercent: 90,
      timestamp: now,
    };

    // Member 2 originally 15m away (same cluster)
    const m2Original: ClusterMember = {
      originFpHex: '0200000000000000',
      latitude: 18.5205,
      longitude: 73.8568,
      accuracyMeters: 5,
      peopleCount: 1,
      status: 1,
      needsMask: 1,
      batteryPercent: 90,
      timestamp: now,
    };

    // Ingest both
    const keyPair1 = await crypto.generateKeyPair();
    const keyPair2 = await crypto.generateKeyPair();

    const sos1 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: now,
        latitude: m1.latitude,
        longitude: m1.longitude,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 1,
        keyPair: keyPair1,
      },
      crypto,
      crypto.randomBytes(8),
      new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    );

    const sos2 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: now,
        latitude: m2Original.latitude,
        longitude: m2Original.longitude,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 1,
        keyPair: keyPair2,
      },
      crypto,
      crypto.randomBytes(8),
      new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]),
    );

    await clusterer.onPacketAccepted(sos1, PacketType.SOS, m1.originFpHex);
    await clusterer.onPacketAccepted(sos2, PacketType.SOS, m2Original.originFpHex);

    const initialClusters = await clusterer.runFullRecluster();
    expect(initialClusters.length).toBe(1);
    expect(initialClusters[0]?.memberFingerprints.length).toBe(2);

    // Now member 2 moves 100m away (lat shift approx +0.0009 degrees = ~100m)
    // and 301 seconds have elapsed (> 5 minutes drift)
    const futureTime = now + 305;
    const sos2Moved = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: futureTime,
        latitude: 18.5204 + 0.001, // ~110m away
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 85,
        sequenceNumber: 2,
        keyPair: keyPair2,
      },
      crypto,
      crypto.randomBytes(8),
      new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]),
    );

    await clusterer.onPacketAccepted(sos2Moved, PacketType.SOS, m2Original.originFpHex);

    // Run full recluster
    const reclustered = await clusterer.runFullRecluster();
    // Acceptance criterion: moving one device 100m away splits it out within 5 minutes
    expect(reclustered.length).toBe(2);

    await db.close();
  });

  test('CLUSTER_SUMMARY packet ingestion merges into database', async () => {
    const { clusterer, db } = await createClustererInstance();
    const keyPair = await crypto.generateKeyPair();

    // Create a local cluster
    const m1: ClusterMember = {
      originFpHex: '0100000000000000',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5,
      peopleCount: 2,
      status: 2,
      needsMask: 3,
      batteryPercent: 90,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const sos1 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: m1.timestamp,
        latitude: m1.latitude,
        longitude: m1.longitude,
        accuracyMeters: 5,
        status: 2,
        peopleCount: 2,
        needsMask: 3,
        batteryPercent: 90,
        sequenceNumber: 1,
        keyPair,
      },
      crypto,
      crypto.randomBytes(8),
      new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    );

    await clusterer.onPacketAccepted(sos1, PacketType.SOS, m1.originFpHex);
    const clusters = await clusterer.runFullRecluster();
    expect(clusters.length).toBe(1);

    // Generate signed CLUSTER_SUMMARY packet
    const summaryPacket = await clusterer.createClusterSummaryPacket(
      clusters[0]!.clusterId,
      keyPair,
      1,
    );
    expect(summaryPacket).not.toBeNull();

    // Ingest summary on another fresh clusterer instance
    const remoteNode = await createClustererInstance();
    await remoteNode.clusterer.ingestClusterSummary(summaryPacket!);

    const remoteClusterDb = await remoteNode.db.clusters.getClusterById(clusters[0]!.clusterId);
    expect(remoteClusterDb).not.toBeNull();
    expect(remoteClusterDb?.cluster_id).toBe(clusters[0]!.clusterId);

    await db.close();
    await remoteNode.db.close();
  });
});
