import {
  InMemoryMeshStore,
  diffSummaryVectors,
  selectToSend,
  MeshRateLimiter,
  ReplayFilter,
  evaluateRelayPolicy,
  RelayPolicyMode,
  PacketType,
  SummaryVector,
} from '../src/index';

describe('Mesh Synchronization Engine', () => {
  it('diffs SummaryVectors accurately', () => {
    const local: SummaryVector = [
      {
        packetIdHex: 'p1',
        type: PacketType.SOS,
        priorityScore: 0.9,
        ageSeconds: 10,
        copiesLeft: 6,
        sizeBytes: 140,
      },
      {
        packetIdHex: 'p2',
        type: PacketType.ACK,
        priorityScore: 0.8,
        ageSeconds: 20,
        copiesLeft: 3,
        sizeBytes: 120,
      },
    ];
    const remote: SummaryVector = [
      {
        packetIdHex: 'p2',
        type: PacketType.ACK,
        priorityScore: 0.8,
        ageSeconds: 20,
        copiesLeft: 3,
        sizeBytes: 120,
      },
      {
        packetIdHex: 'p3',
        type: PacketType.CHAT,
        priorityScore: 0.2,
        ageSeconds: 5,
        copiesLeft: 6,
        sizeBytes: 80,
      },
    ];

    const diff = diffSummaryVectors(local, remote);
    expect(diff.localNeeds).toEqual(['p3']);
    expect(diff.remoteNeeds).toEqual(['p1']);
  });

  it('selects packets strictly adhering to priority order SOS > ACK > DEADMAN > LOCATION > CHAT', () => {
    const store = new InMemoryMeshStore();

    // Insert Chat (type 0x02)
    store.put({
      packetIdHex: 'chat1',
      type: PacketType.CHAT,
      originFpHex: 'origin1',
      rawBytes: new Uint8Array(80),
      sizeBytes: 80,
      priorityScore: 0.5,
      createdAt: 100,
      hop: 0,
      ttl: 5,
      copiesLeft: 6,
      sequenceNumber: 1,
    });

    // Insert SOS (type 0x01)
    store.put({
      packetIdHex: 'sos1',
      type: PacketType.SOS,
      originFpHex: 'origin2',
      rawBytes: new Uint8Array(140),
      sizeBytes: 140,
      priorityScore: 0.9,
      createdAt: 100,
      hop: 0,
      ttl: 10,
      copiesLeft: 6,
      isCriticalSos: true,
      sequenceNumber: 2,
    });

    // Insert Location (type 0x05)
    store.put({
      packetIdHex: 'loc1',
      type: PacketType.LOCATION,
      originFpHex: 'origin3',
      rawBytes: new Uint8Array(100),
      sizeBytes: 100,
      priorityScore: 0.3,
      createdAt: 100,
      hop: 0,
      ttl: 5,
      copiesLeft: 4,
      sequenceNumber: 3,
    });

    // Remote knows nothing
    const remoteSummary: SummaryVector = [];

    // Select with budget for all 3
    const selected = selectToSend(store, remoteSummary, 500, 150);

    expect(selected.length).toBe(3);
    // Highest priority must be first: SOS, then Location, then Chat
    expect(selected[0]!.packet.packetIdHex).toBe('sos1');
    expect(selected[1]!.packet.packetIdHex).toBe('loc1');
    expect(selected[2]!.packet.packetIdHex).toBe('chat1');

    // Test budget constraint: budget only allows 1 packet (150 bytes)
    const constrained = selectToSend(store, remoteSummary, 150, 150);
    expect(constrained.length).toBe(1);
    expect(constrained[0]!.packet.packetIdHex).toBe('sos1');
  });

  it('applies epidemic fast-path for critical SOS in first 3 hops, then Spray-and-Wait', () => {
    const store = new InMemoryMeshStore();

    // Critical SOS at hop 1
    store.put({
      packetIdHex: 'sos_crit',
      type: PacketType.SOS,
      originFpHex: 'orig1',
      rawBytes: new Uint8Array(140),
      sizeBytes: 140,
      priorityScore: 0.95,
      createdAt: 100,
      hop: 1, // < 3
      ttl: 10,
      copiesLeft: 6,
      isCriticalSos: true,
      sequenceNumber: 1,
    });

    // Non-critical SOS at hop 1 (binary halving)
    store.put({
      packetIdHex: 'sos_norm',
      type: PacketType.SOS,
      originFpHex: 'orig2',
      rawBytes: new Uint8Array(140),
      sizeBytes: 140,
      priorityScore: 0.4,
      createdAt: 100,
      hop: 1,
      ttl: 10,
      copiesLeft: 6,
      isCriticalSos: false,
      sequenceNumber: 2,
    });

    const selected = selectToSend(store, [], 1000, 150);
    const critRes = selected.find(s => s.packet.packetIdHex === 'sos_crit')!;
    const normRes = selected.find(s => s.packet.packetIdHex === 'sos_norm')!;

    // Epidemic: sends all copies, keeps all copies
    expect(critRes.allocatedCopies).toBe(6);
    expect(critRes.remainingLocalCopies).toBe(6);

    // Standard Spray-and-wait: halves copies (ceil(6/2)=3, floor(6/2)=3)
    expect(normRes.allocatedCopies).toBe(3);
    expect(normRes.remainingLocalCopies).toBe(3);
  });

  it('enforces per-origin rate limiting (max 6 SOS/hr, 60 location/hr)', () => {
    const limiter = new MeshRateLimiter(6, 60);
    const origin = 'deadbeef12345678';
    const baseTime = 1700000000;

    // Send 6 SOS within the hour: all allowed
    for (let i = 0; i < 6; i++) {
      expect(limiter.isAllowed(origin, PacketType.SOS, baseTime + i * 60)).toBe(true);
    }

    // 7th SOS within the hour must be blocked!
    expect(limiter.isAllowed(origin, PacketType.SOS, baseTime + 7 * 60)).toBe(false);

    // After 1 hour has elapsed, new SOS is allowed
    expect(limiter.isAllowed(origin, PacketType.SOS, baseTime + 3601)).toBe(true);
  });

  it('rejects replayed sequence numbers and nonces', () => {
    const filter = new ReplayFilter();
    const origin = 'aabbccddeeff0011';

    expect(filter.isDuplicate(origin, 1, 1001)).toBe(false);
    filter.record(origin, 1, 1001);

    // Duplicate sequence number
    expect(filter.isDuplicate(origin, 1, 2002)).toBe(true);

    // Duplicate nonce
    expect(filter.isDuplicate(origin, 2, 1001)).toBe(true);

    // New unique sequence and nonce
    expect(filter.isDuplicate(origin, 2, 2002)).toBe(false);
  });

  it('evaluates battery-aware relay policy properly', () => {
    // Charging: always full relay
    expect(evaluateRelayPolicy(10, true)).toBe(RelayPolicyMode.RELAY_FULL);

    // Critical battery (< 15%): SLEEP
    expect(evaluateRelayPolicy(12, false)).toBe(RelayPolicyMode.SLEEP);

    // Normal battery (>= 40%): RELAY_FULL
    expect(evaluateRelayPolicy(60, false)).toBe(RelayPolicyMode.RELAY_FULL);

    // Low battery (25%) with healthy neighbors: RELAY_SOS_ONLY
    expect(evaluateRelayPolicy(25, false, [70, 80])).toBe(RelayPolicyMode.RELAY_SOS_ONLY);
  });
});
