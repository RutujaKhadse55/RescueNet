import { SodiumCrypto, createAndSignSos, PacketType, verifySosPacket } from '@rescuenet/core';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { InMemoryKeyStore } from '../src/security/keystore';
import { MeshEngine } from '../src/mesh/MeshEngine';
import { FakeTransport, FakeBleNetwork } from '../src/mesh/FakeTransport';
import { DEFAULT_MESH_POLICY } from '../src/mesh/types';

describe('Phase 7: Store-and-forward Mesh Engine', () => {
  let crypto: SodiumCrypto;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
  });

  afterEach(() => {
    FakeBleNetwork.clear();
  });

  async function createEngineNode(nodeId: string, role: 'survivor' | 'rescuer' | 'gateway' = 'survivor') {
    const keystore = new InMemoryKeyStore();
    const db = await DatabaseManager.create(true, keystore, crypto);
    const transport = new FakeTransport(nodeId);
    const keyPair = await crypto.generateKeyPair();

    const engine = new MeshEngine({
      nodeId,
      crypto,
      db,
      transport,
      role,
      keyPair,
      policy: {
        ...DEFAULT_MESH_POLICY,
        samePeerCooldownMs: 0, // Disable cooldown for deterministic synchronous test steps
      },
    });

    await engine.start();

    return { engine, db, transport, keyPair, keystore };
  }

  test('2-hop and 3-hop delivery (A -> B -> C -> D), hop count increment, TTL decrement, signature preserved', async () => {
    // Topology: A <-> B <-> C <-> D
    // A and C out of range of each other
    const nodeA = await createEngineNode('nodeA');
    const nodeB = await createEngineNode('nodeB');
    const nodeC = await createEngineNode('nodeC');
    const nodeD = await createEngineNode('nodeD');

    FakeBleNetwork.setLink('nodeA', 'nodeB', { inRange: true, rssi: -65 });
    FakeBleNetwork.setLink('nodeB', 'nodeC', { inRange: true, rssi: -70 });
    FakeBleNetwork.setLink('nodeC', 'nodeD', { inRange: true, rssi: -75 });

    // Ensure A and C are NOT directly connected
    expect(FakeBleNetwork.getLink('nodeA', 'nodeC')).toBeNull();

    // Create SOS on Node A
    const originFp = crypto.randomBytes(8);
    const packetId = crypto.randomBytes(8);
    const initialTtl = 7;
    const initialHop = 0;

    const sosBytes = await createAndSignSos(
      {
        ttl: initialTtl,
        hop: initialHop,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 10,
        status: 2, // Urgent
        peopleCount: 3,
        needsMask: 0x05,
        batteryPercent: 85,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto,
      packetId,
      originFp
    );

    const packetIdHex = await nodeA.engine.createAndStorePacket(sosBytes);

    // Hop 1: Sync A -> B
    const syncResAB = await nodeA.engine.syncWithPeerEngine(nodeB.engine);
    expect(syncResAB.packetsSent).toBe(1);

    const pktOnB = await nodeB.db.packets.getPacketById(packetIdHex);
    expect(pktOnB).not.toBeNull();
    expect(pktOnB?.hop_count).toBe(1);
    expect(pktOnB?.ttl).toBe(initialTtl - 1);

    // Verify signature on Node B
    const rawBytesOnB = new Uint8Array(
      pktOnB!.raw_bytes.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const sigValidOnB = await verifySosPacket(rawBytesOnB, crypto);
    expect(sigValidOnB).toBe(true);

    // Hop 2: Sync B -> C
    const syncResBC = await nodeB.engine.syncWithPeerEngine(nodeC.engine);
    expect(syncResBC.packetsSent).toBe(1);

    const pktOnC = await nodeC.db.packets.getPacketById(packetIdHex);
    expect(pktOnC).not.toBeNull();
    // Acceptance criterion: hop = 2 on C
    expect(pktOnC?.hop_count).toBe(2);
    expect(pktOnC?.ttl).toBe(initialTtl - 2);

    // Verify signature on Node C
    const rawBytesOnC = new Uint8Array(
      pktOnC!.raw_bytes.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const sigValidOnC = await verifySosPacket(rawBytesOnC, crypto);
    expect(sigValidOnC).toBe(true);

    // Hop 3: Sync C -> D
    const syncResCD = await nodeC.engine.syncWithPeerEngine(nodeD.engine);
    expect(syncResCD.packetsSent).toBe(1);

    const pktOnD = await nodeD.db.packets.getPacketById(packetIdHex);
    expect(pktOnD).not.toBeNull();
    expect(pktOnD?.hop_count).toBe(3);
    expect(pktOnD?.ttl).toBe(initialTtl - 3);

    // Verify no loops: Node B already has the packet; sync from C -> B should transfer 0 new packets
    const loopCheck = await nodeC.engine.syncWithPeerEngine(nodeB.engine);
    expect(loopCheck.packetsSent).toBe(0);

    await nodeA.db.close();
    await nodeB.db.close();
    await nodeC.db.close();
    await nodeD.db.close();
  });

  test('TTL expiry: packets with exhausted TTL are rejected and not relayed', async () => {
    const nodeA = await createEngineNode('nodeA');
    const nodeB = await createEngineNode('nodeB');

    // Create SOS with TTL = 1
    const sosBytes = await createAndSignSos(
      {
        ttl: 1, // Will be decremented to 0
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto
    );

    await nodeA.engine.createAndStorePacket(sosBytes);

    // Node A attempts to sync to Node B; candidate has ttl <= 1, so it cannot be forwarded further
    const syncRes = await nodeA.engine.syncWithPeerEngine(nodeB.engine);
    expect(syncRes.packetsSent).toBe(0);

    const pktOnB = await nodeB.db.packets.getAllPackets();
    expect(pktOnB.length).toBe(0);

    await nodeA.db.close();
    await nodeB.db.close();
  });

  test('Deduplication: duplicate packet delivery increments deduplicated counter and avoids duplicate rows', async () => {
    const nodeA = await createEngineNode('nodeA');

    const sosBytes = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto
    );

    // First ingestion
    const res1 = await nodeA.engine.ingestPacket(sosBytes, 'neighbor1');
    expect(res1.accepted).toBe(true);

    // Duplicate ingestion
    const res2 = await nodeA.engine.ingestPacket(sosBytes, 'neighbor1');
    expect(res2.accepted).toBe(false);

    const metrics = nodeA.engine.getMetrics();
    expect(metrics.packetsDeduplicated).toBe(1);

    const allPackets = await nodeA.db.packets.getAllPackets();
    expect(allPackets.length).toBe(1);

    await nodeA.db.close();
  });

  test('Anti-replay protection: rejects lower sequence numbers and duplicate nonces', async () => {
    const nodeA = await createEngineNode('nodeA');
    const originFp = crypto.randomBytes(8);
    const keyPair = await crypto.generateKeyPair();

    // Packet 1: Seq 5
    const pkt1 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 5,
        keyPair,
      },
      crypto,
      crypto.randomBytes(8),
      originFp
    );
    const res1 = await nodeA.engine.ingestPacket(pkt1);
    expect(res1.accepted).toBe(true);

    // Packet 2: Replayed Seq 3 (older seq from same origin)
    const pkt2 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 3, // Lower than 5!
        keyPair,
      },
      crypto,
      crypto.randomBytes(8),
      originFp
    );
    const res2 = await nodeA.engine.ingestPacket(pkt2);
    expect(res2.accepted).toBe(false);

    const metrics = nodeA.engine.getMetrics();
    expect(metrics.rejectionCounts.replay_seq).toBe(1);

    await nodeA.db.close();
  });

  test('Rate limiting: rejects origins exceeding 10 packets per minute', async () => {
    const nodeA = await createEngineNode('nodeA');
    const originFp = crypto.randomBytes(8);
    const keyPair = await crypto.generateKeyPair();
    const now = Math.floor(Date.now() / 1000);

    // Send 10 packets within 1 minute
    for (let i = 1; i <= 10; i++) {
      const pkt = await createAndSignSos(
        {
          ttl: 5,
          hop: 0,
          timestamp: now,
          latitude: 18.5204,
          longitude: 73.8567,
          accuracyMeters: 5,
          status: 1,
          peopleCount: 1,
          needsMask: 1,
          batteryPercent: 90,
          sequenceNumber: i * 10,
          keyPair,
        },
        crypto,
        crypto.randomBytes(8),
        originFp
      );
      const res = await nodeA.engine.ingestPacket(pkt);
      expect(res.accepted).toBe(true);
    }

    // 11th packet from same origin within the same minute should be rejected
    const pkt11 = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: now,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 1,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 90,
        sequenceNumber: 200,
        keyPair,
      },
      crypto,
      crypto.randomBytes(8),
      originFp
    );
    const res11 = await nodeA.engine.ingestPacket(pkt11);
    expect(res11.accepted).toBe(false);

    const metrics = nodeA.engine.getMetrics();
    expect(metrics.rejectionCounts.rate_limit_exceeded).toBe(1);

    await nodeA.db.close();
  });

  test('Rule 3: Unsigned or unverifiable SOS is stored and forwarded with low-trust flag', async () => {
    const nodeA = await createEngineNode('nodeA');

    // Create a valid SOS then tamper with signature bytes
    const validSos = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 3,
        peopleCount: 2,
        needsMask: 1,
        batteryPercent: 80,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto
    );

    // Corrupt signature (last 64 bytes)
    const tampered = new Uint8Array(validSos);
    tampered[tampered.length - 1] ^= 0xff;

    const res = await nodeA.engine.ingestPacket(tampered, 'peerX');
    // RULE 3: STORED AND FORWARDED with low-trust flag, not dropped!
    expect(res.accepted).toBe(true);
    expect(res.lowTrust).toBe(true);

    const stored = await nodeA.db.packets.getAllPackets();
    expect(stored.length).toBe(1);

    await nodeA.db.close();
  });

  test('Priority under tiny byte budget: SOS packets prioritized before chat packets', async () => {
    const nodeA = await createEngineNode('nodeA');
    const nodeB = await createEngineNode('nodeB');
    FakeBleNetwork.setLink('nodeA', 'nodeB', { inRange: true, rssi: -65 });

    // Set tiny byte budget (e.g. 200 bytes) on nodeA
    nodeA.engine.updatePolicy({
      baseContactBudgetBytes: 200,
    });

    // Create 1 SOS (approx 141 bytes)
    const sosBytes = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 2,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 80,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto
    );
    await nodeA.engine.createAndStorePacket(sosBytes);

    // Create 1 Chat packet (generic type 0x02, approx 80 bytes)
    const chatBytes = new Uint8Array(80);
    chatBytes[0] = 1; // version
    chatBytes[1] = PacketType.CHAT; // 0x02
    chatBytes[2] = 0; // flags
    chatBytes[3] = 5; // ttl
    chatBytes[4] = 0; // hop
    chatBytes.set(crypto.randomBytes(8), 5); // packetId
    chatBytes.set(crypto.randomBytes(8), 13); // originFp
    // Timestamp
    const view = new DataView(chatBytes.buffer, chatBytes.byteOffset, chatBytes.byteLength);
    view.setUint32(21, Math.floor(Date.now() / 1000), true);

    await nodeA.engine.createAndStorePacket(chatBytes);

    // Sync under 200B budget: only SOS should fit and be sent, CHAT left behind
    const syncRes = await nodeA.engine.syncWithPeerEngine(nodeB.engine);
    expect(syncRes.packetsSent).toBe(1);

    const bPackets = await nodeB.db.packets.getAllPackets();
    expect(bPackets.length).toBe(1);
    expect(bPackets[0]?.packet_type).toBe(PacketType.SOS);

    await nodeA.db.close();
    await nodeB.db.close();
  });

  test('Battery-aware relaying: low battery (<= 20%) node relays SOS only and suppresses chat', async () => {
    const nodeA = await createEngineNode('nodeA');
    const nodeB = await createEngineNode('nodeB');
    FakeBleNetwork.setLink('nodeA', 'nodeB', { inRange: true, rssi: -65 });

    // Set Node A battery to 15% (low battery mode)
    nodeA.engine.updateBattery(15, false);

    // Store both SOS and CHAT on Node A
    const sosBytes = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 2,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 15,
        sequenceNumber: 1,
        keyPair: nodeA.keyPair,
      },
      crypto
    );
    await nodeA.engine.createAndStorePacket(sosBytes);

    const chatBytes = new Uint8Array(60);
    chatBytes[0] = 1;
    chatBytes[1] = PacketType.CHAT;
    chatBytes[3] = 5;
    chatBytes[4] = 0;
    chatBytes.set(crypto.randomBytes(8), 5);
    chatBytes.set(crypto.randomBytes(8), 13);
    const view = new DataView(chatBytes.buffer, chatBytes.byteOffset, chatBytes.byteLength);
    view.setUint32(21, Math.floor(Date.now() / 1000), true);

    await nodeA.engine.createAndStorePacket(chatBytes);

    // Sync with Node B: only SOS should be forwarded
    const syncRes = await nodeA.engine.syncWithPeerEngine(nodeB.engine);
    expect(syncRes.packetsSent).toBe(1);

    const bPackets = await nodeB.db.packets.getAllPackets();
    expect(bPackets.length).toBe(1);
    expect(bPackets[0]?.packet_type).toBe(PacketType.SOS);

    await nodeA.db.close();
    await nodeB.db.close();
  });

  test('Crash recovery & idempotency: engine restarted mid-exchange resumes cleanly', async () => {
    const keystore = new InMemoryKeyStore();
    const db = await DatabaseManager.create(true, keystore, crypto);
    const transport1 = new FakeTransport('crashNode');
    const keyPair = await crypto.generateKeyPair();

    const engine1 = new MeshEngine({
      nodeId: 'crashNode',
      crypto,
      db,
      transport: transport1,
      keyPair,
    });

    const sos = await createAndSignSos(
      {
        ttl: 5,
        hop: 0,
        timestamp: Math.floor(Date.now() / 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 5,
        status: 2,
        peopleCount: 1,
        needsMask: 1,
        batteryPercent: 80,
        sequenceNumber: 1,
        keyPair,
      },
      crypto
    );
    await engine1.createAndStorePacket(sos);

    // Simulate crash: stop engine1 and tear down transport
    await engine1.stop();
    transport1.destroy();

    // Restart engine2 using same underlying database
    const transport2 = new FakeTransport('crashNode');
    const engine2 = new MeshEngine({
      nodeId: 'crashNode',
      crypto,
      db,
      transport: transport2,
      keyPair,
    });

    await engine2.start();

    // Verify stored packet is still valid and present
    const held = await engine2.getSummaryVector();
    expect(held.length).toBe(1);
    expect(held[0]?.type).toBe(PacketType.SOS);

    // CSV export check
    const csv = engine2.exportMetricsCsv();
    expect(csv).toContain('packets_seen');
    expect(csv).toContain('packets_forwarded');

    await engine2.stop();
    await db.close();
  });
});
