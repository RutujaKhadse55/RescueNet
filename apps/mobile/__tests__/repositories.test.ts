import { DatabaseManager } from '../src/db/DatabaseManager';
import { InMemoryKeyStore } from '../src/security/keystore';
import { SodiumCrypto } from '@rescuenet/core';
import { PacketRecord } from '../src/db/repositories/PacketRepository';

describe('Database Repositories & LRU Eviction', () => {
  let db: DatabaseManager;

  beforeEach(async () => {
    const keystore = new InMemoryKeyStore();
    const crypto = await SodiumCrypto.getInstance();
    db = await DatabaseManager.create(true, keystore, crypto);
  });

  afterEach(async () => {
    await db.close();
  });

  test('PacketRepository: insert, query, markUplinked, and incrementDeliveredCount', async () => {
    const packet: PacketRecord = {
      packet_id: '0102030405060708',
      raw_bytes: '010100aabbccdd',
      packet_type: 0x01, // SOS
      origin_fp: 'a1b2c3d4e5f60708',
      hop_count: 1,
      ttl: 6,
      received_at: new Date().toISOString(),
      from_neighbor: 'f0e1d2c3b4a59687',
      copies_left: 5,
      uplinked_at: null,
      delivered_to_count: 0,
      is_sos: 1,
      parsed_json: JSON.stringify({ urgency: 'high' }),
    };

    await db.packets.insertPacket(packet);

    const fetched = await db.packets.getPacketById('0102030405060708');
    expect(fetched).not.toBeNull();
    expect(fetched?.origin_fp).toBe('a1b2c3d4e5f60708');
    expect(fetched?.is_sos).toBe(1);
    expect(fetched?.uplinked_at).toBeNull();

    // Mark uplinked
    const nowIso = new Date().toISOString();
    await db.packets.markUplinked('0102030405060708', nowIso);
    const updated = await db.packets.getPacketById('0102030405060708');
    expect(updated?.uplinked_at).toBe(nowIso);

    // Increment delivered count
    await db.packets.incrementDeliveredCount('0102030405060708');
    const afterDelivered = await db.packets.getPacketById('0102030405060708');
    expect(afterDelivered?.delivered_to_count).toBe(1);
  });

  test('LRU Eviction STRICT GUARANTEE: Never evicts un-uplinked SOS packets', async () => {
    // 1. Insert an un-uplinked SOS packet
    const unuplinkedSos: PacketRecord = {
      packet_id: 'sos_vital_000001',
      raw_bytes: '0101001122334455',
      packet_type: 0x01,
      origin_fp: 'origin_survivor1',
      hop_count: 0,
      ttl: 7,
      received_at: '2026-10-01T10:00:00.000Z', // older
      copies_left: 6,
      uplinked_at: null, // NOT uplinked!
      delivered_to_count: 0,
      is_sos: 1,
      parsed_json: '{"vital": true}',
    };
    await db.packets.insertPacket(unuplinkedSos);

    // 2. Insert an already uplinked SOS packet
    const uplinkedSos: PacketRecord = {
      packet_id: 'sos_uplinked_0002',
      raw_bytes: '0101009988776655',
      packet_type: 0x01,
      origin_fp: 'origin_survivor2',
      hop_count: 2,
      ttl: 5,
      received_at: '2026-10-01T10:05:00.000Z',
      copies_left: 2,
      uplinked_at: '2026-10-01T10:06:00.000Z', // already uplinked
      delivered_to_count: 3,
      is_sos: 1,
      parsed_json: '{"handled": true}',
    };
    await db.packets.insertPacket(uplinkedSos);

    // 3. Insert non-SOS packets (chat / deadman)
    const chatPacket: PacketRecord = {
      packet_id: 'chat_pkt_00000003',
      raw_bytes: '0200001234567890',
      packet_type: 0x02,
      origin_fp: 'origin_peer_0003',
      hop_count: 1,
      ttl: 4,
      received_at: '2026-10-01T10:10:00.000Z',
      copies_left: 4,
      uplinked_at: null,
      delivered_to_count: 1,
      is_sos: 0, // non-SOS!
      parsed_json: '{"text": "hello"}',
    };
    await db.packets.insertPacket(chatPacket);

    expect(await db.packets.countPackets()).toBe(3);

    // Trigger LRU eviction with a tiny cap so it forces eviction
    const targetCapBytes = 200; // Small cap
    const evictionResult = await db.packets.applyLruEviction(targetCapBytes);

    expect(evictionResult.evictedCount).toBeGreaterThan(0);

    // VERIFY CRITICAL INVARIANT: The un-uplinked SOS packet MUST STILL EXIST!
    const vitalSos = await db.packets.getPacketById('sos_vital_000001');
    expect(vitalSos).not.toBeNull();
    expect(vitalSos?.packet_id).toBe('sos_vital_000001');
    expect(vitalSos?.uplinked_at).toBeNull();
  });

  test('NeighborRepository: upsert, query, and prune stale', async () => {
    await db.neighbors.upsertNeighbor({
      fp: 'neighbor_fp_0001',
      last_rssi: -72,
      last_seen: '2026-10-02T12:00:00.000Z',
      battery: 89,
      role: 'survivor',
      mac_rotating: 1,
    });

    const neighbor = await db.neighbors.getNeighbor('neighbor_fp_0001');
    expect(neighbor).not.toBeNull();
    expect(neighbor?.last_rssi).toBe(-72);
    expect(neighbor?.battery).toBe(89);

    const staleRemoved = await db.neighbors.removeStaleNeighbors('2026-10-02T13:00:00.000Z');
    expect(staleRemoved).toBe(1);

    const afterPrune = await db.neighbors.getNeighbor('neighbor_fp_0001');
    expect(afterPrune).toBeNull();
  });

  test('ClusterRepository: upsert cluster and manage members', async () => {
    await db.clusters.upsertCluster({
      cluster_id: 'cl_wayanad_001',
      centroid_lat: 11.605,
      centroid_lon: 76.083,
      radius_meters: 150,
      member_count: 12,
      priority_score: 0.85,
      state: 'new',
      updated_at: new Date().toISOString(),
    });

    const cluster = await db.clusters.getCluster('cl_wayanad_001');
    expect(cluster).not.toBeNull();
    expect(cluster?.priority_score).toBe(0.85);

    await db.clusters.addMember({
      cluster_id: 'cl_wayanad_001',
      origin_fp: 'survivor_fp_001',
      joined_at: new Date().toISOString(),
    });

    const members = await db.clusters.getMembers('cl_wayanad_001');
    expect(members.length).toBe(1);
    expect(members[0]?.origin_fp).toBe('survivor_fp_001');
  });

  test('ChatRepository: save messages, conversations, and update status', async () => {
    await db.chat.upsertConversation({
      conversation_id: 'conv_123',
      peer_fp: 'peer_fp_123',
      peer_nickname: 'Aarav',
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    });

    await db.chat.saveMessage({
      message_id: 'msg_001',
      conversation_id: 'conv_123',
      direction: 'outbound',
      sender_fp: 'me_fp',
      recipient_fp: 'peer_fp_123',
      content: 'Do you have extra water?',
      status: 'pending',
      ttl: 6,
      created_at: new Date().toISOString(),
    });

    const msgs = await db.chat.getMessagesForConversation('conv_123');
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.status).toBe('pending');

    await db.chat.updateMessageStatus('msg_001', 'delivered');
    const updatedMsgs = await db.chat.getMessagesForConversation('conv_123');
    expect(updatedMsgs[0]?.status).toBe('delivered');
  });

  test('OutboxRepository: queue uplinks and SMS fallback', async () => {
    await db.outbox.queueUplink({
      id: 'uplink_001',
      packet_id: 'pkt_001',
      payload: 'dGVzdA==',
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    });

    const pendingUplinks = await db.outbox.getPendingUplinks();
    expect(pendingUplinks.length).toBe(1);
    await db.outbox.markUplinkSent('uplink_001');
    expect(await db.outbox.getPendingUplinks()).toHaveLength(0);

    await db.outbox.queueSms({
      id: 'sms_001',
      destination_number: '+911124363260',
      encoded_sms: 'RN1 ABCDEF',
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    });

    const pendingSms = await db.outbox.getPendingSms();
    expect(pendingSms.length).toBe(1);
    await db.outbox.markSmsSent('sms_001');
    expect(await db.outbox.getPendingSms()).toHaveLength(0);
  });

  test('Settings and EventLog repositories', async () => {
    await db.settings.set('device_role', 'survivor');
    expect(await db.settings.get('device_role')).toBe('survivor');

    await db.events.logEvent('app_boot', { mode: 'offline' });
    const events = await db.events.getRecentEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.event_type).toBe('app_boot');
  });

  test('wipeAllData wipes all 12 tables and keystore secrets', async () => {
    await db.settings.set('test_key', 'test_val');
    await db.events.logEvent('test_event', 'details');

    await db.wipeAllData();

    expect(await db.settings.get('test_key')).toBeNull();
    const events = await db.events.getRecentEvents();
    expect(events.length).toBe(0);
  });
});
