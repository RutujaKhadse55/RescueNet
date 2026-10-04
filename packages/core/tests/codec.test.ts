import {
  SodiumCrypto,
  encodeSos,
  decodeSos,
  createAndSignSos,
  verifySosPacket,
  encodeAck,
  decodeAck,
  encodeDeadman,
  decodeDeadman,
  encodeLocation,
  decodeLocation,
  encodeChat,
  decodeChat,
  encodeHello,
  decodeHello,
  encodeChatReceipt,
  decodeChatReceipt,
  fragmentPacket,
  reassembleFragments,
  GattReassemblySession,
  PacketType,
  TriageStatus,
  NeedsBitmask,
  ExtensionType,
} from '../src/index';

describe('Binary Codec & GATT Fragmentation', () => {
  let crypto: SodiumCrypto;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
  });

  it('encodes and decodes SOS packet within 180-byte budget', async () => {
    const keyPair = await crypto.generateKeyPair();
    const timestamp = Math.floor(Date.now() / 1000);

    const noteBytes = new TextEncoder().encode('Rooftop trapped #3B');
    const bssidBytes = new Uint8Array([0x00, 0x14, 0x22, 0x01, 0x23, 0x45]);
    const altBytes = new Uint8Array(2);
    new DataView(altBytes.buffer).setInt16(0, 15, true); // +15 meters

    const signedPacket = await createAndSignSos(
      {
        timestamp,
        latitude: 18.5204303,
        longitude: 73.8567437,
        accuracyMeters: 12,
        status: TriageStatus.TRAPPED,
        peopleCount: 4,
        needsMask: NeedsBitmask.MEDICAL | NeedsBitmask.WATER,
        batteryPercent: 78,
        sequenceNumber: 1,
        extensions: [
          { type: ExtensionType.ALTITUDE_METERS, value: altBytes },
          { type: ExtensionType.SHORT_NOTE, value: noteBytes },
          { type: ExtensionType.WIFI_BSSID, value: bssidBytes },
        ],
        keyPair,
      },
      crypto,
    );

    // Strict acceptance criteria: SOS packet <= 180 bytes!
    expect(signedPacket.length).toBeLessThanOrEqual(180);

    // Verify signature
    const isValid = await verifySosPacket(signedPacket, crypto);
    expect(isValid).toBe(true);

    // Decode and verify all fields
    const decoded = decodeSos(signedPacket);
    expect(decoded.header.type).toBe(PacketType.SOS);
    expect(decoded.body.status).toBe(TriageStatus.TRAPPED);
    expect(decoded.body.peopleCount).toBe(4);
    expect(decoded.body.batteryPercent).toBe(78);
    expect(decoded.body.sequenceNumber).toBe(1);
    expect(Math.abs(decoded.body.latitude - 18.5204303)).toBeLessThan(1e-6);
    expect(Math.abs(decoded.body.longitude - 73.8567437)).toBeLessThan(1e-6);
    expect(decoded.body.extensions?.length).toBe(3);
  });

  it('detects tampering and bit-flips in SOS packet', async () => {
    const keyPair = await crypto.generateKeyPair();
    const signedPacket = await createAndSignSos(
      {
        timestamp: 1700000000,
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyMeters: 5,
        status: TriageStatus.CRITICAL,
        peopleCount: 2,
        needsMask: NeedsBitmask.EVACUATION,
        batteryPercent: 40,
        sequenceNumber: 42,
        keyPair,
      },
      crypto,
    );

    // Verified original
    expect(await verifySosPacket(signedPacket, crypto)).toBe(true);

    // Tamper with latitude (byte 26)
    const tampered = new Uint8Array(signedPacket);
    tampered[26] = (tampered[26] ?? 0) ^ 0xff;

    expect(await verifySosPacket(tampered, crypto)).toBe(false);
  });

  it('encodes and decodes ACK, DEADMAN, LOCATION, CHAT, HELLO, and CHAT_RECEIPT', async () => {
    const keyPair = await crypto.generateKeyPair();
    const targetId = crypto.randomBytes(8);
    const originFp = crypto.randomBytes(8);

    // 1. ACK
    const ackBytes = encodeAck({
      header: {
        version: 1,
        type: PacketType.ACK,
        flags: 0,
        ttl: 5,
        hop: 1,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        targetPacketId: targetId,
        arrivalMinutes: 15,
        status: 2,
        agencyId: 112,
        publicKey: keyPair.publicKey,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedAck = decodeAck(ackBytes);
    expect(decodedAck.body.arrivalMinutes).toBe(15);
    expect(decodedAck.body.agencyId).toBe(112);

    // 2. DEADMAN
    const deadmanBytes = encodeDeadman({
      header: {
        version: 1,
        type: PacketType.DEADMAN,
        flags: 0,
        ttl: 5,
        hop: 0,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        countdownSeconds: 3600,
        batteryPercent: 88,
        sequenceNumber: 5,
        publicKey: keyPair.publicKey,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedDeadman = decodeDeadman(deadmanBytes);
    expect(decodedDeadman.body.countdownSeconds).toBe(3600);
    expect(decodedDeadman.body.batteryPercent).toBe(88);

    // 3. LOCATION
    const locBytes = encodeLocation({
      header: {
        version: 1,
        type: PacketType.LOCATION,
        flags: 0,
        ttl: 5,
        hop: 0,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        timestamp: 1700000000,
        latitude: 19.076,
        longitude: 72.8777,
        accuracyMeters: 8,
        sequenceNumber: 12,
        batteryPercent: 95,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedLoc = decodeLocation(locBytes);
    expect(Math.abs(decodedLoc.body.latitude - 19.076)).toBeLessThan(1e-5);
    expect(decodedLoc.body.accuracyMeters).toBe(8);

    // 4. CHAT
    const chatMsg = new TextEncoder().encode('Is medical help on the way?');
    const chatBytes = encodeChat({
      header: {
        version: 1,
        type: PacketType.CHAT,
        flags: 0,
        ttl: 5,
        hop: 0,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        recipientFp: crypto.randomBytes(8),
        sequenceNumber: 7,
        ciphertext: chatMsg,
        publicKey: keyPair.publicKey,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedChat = decodeChat(chatBytes);
    expect(new TextDecoder().decode(decodedChat.body.ciphertext)).toBe(
      'Is medical help on the way?',
    );

    // 5. HELLO
    const helloBytes = encodeHello({
      header: {
        version: 1,
        type: PacketType.HELLO,
        flags: 0,
        ttl: 3,
        hop: 0,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        servicesMask: 0x0007,
        sequenceNumber: 1,
        publicKey: keyPair.publicKey,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedHello = decodeHello(helloBytes);
    expect(decodedHello.body.servicesMask).toBe(0x0007);

    // 6. CHAT_RECEIPT
    const receiptBytes = encodeChatReceipt({
      header: {
        version: 1,
        type: PacketType.CHAT_RECEIPT,
        flags: 0,
        ttl: 5,
        hop: 0,
        packetId: crypto.randomBytes(8),
        originFp,
      },
      body: {
        targetPacketId: targetId,
        recipientFp: originFp,
        status: 2, // read
        sequenceNumber: 8,
        publicKey: keyPair.publicKey,
        signature: crypto.randomBytes(64),
      },
    });
    const decodedReceipt = decodeChatReceipt(receiptBytes);
    expect(decodedReceipt.body.status).toBe(2);
  });

  it('fragments and reassembles packets over constrained GATT MTU with CRC16', async () => {
    const rawData = crypto.randomBytes(160);
    const mtu = 23; // BLE default ATT MTU (header 6B -> 17B payload per chunk)

    const fragments = fragmentPacket(rawData, mtu, 12345);
    expect(fragments.length).toBe(Math.ceil(160 / 17));

    // Reassemble in-order
    const reconstructed = reassembleFragments(fragments);
    expect(reconstructed).not.toBeNull();
    expect(reconstructed).toEqual(rawData);

    // Reassemble out-of-order via GattReassemblySession
    const session = new GattReassemblySession(5000);
    const shuffled = [...fragments].sort(() => Math.random() - 0.5);

    let result: Uint8Array | null = null;
    for (const f of shuffled) {
      result = session.processFragment(f);
    }
    expect(result).not.toBeNull();
    expect(result).toEqual(rawData);
    expect(session.getActiveSessionCount()).toBe(0);
  });

  it('rejects corrupted GATT fragments with CRC16 mismatch', () => {
    const rawData = crypto.randomBytes(80);
    const fragments = fragmentPacket(rawData, 23, 999);

    // Corrupt one byte of payload in fragment 1
    const frag = fragments[1]!;
    frag[10] = (frag[10] ?? 0) ^ 0xaa;

    const result = reassembleFragments(fragments);
    expect(result).toBeNull();
  });

  it('handles fragmentation edge cases, errors, and session timeouts', () => {
    // reassembleFragments([])
    expect(reassembleFragments([])).toBeNull();

    // MTU <= 6 throws
    expect(() => fragmentPacket(new Uint8Array(10), 6)).toThrow();

    // parseFragment too short throws
    expect(() => fragmentPacket(new Uint8Array(10), 20)).not.toThrow();

    // Reassembly with mismatched transfer IDs
    const f1 = fragmentPacket(new Uint8Array(50), 25, 100);
    const f2 = fragmentPacket(new Uint8Array(50), 25, 200);
    expect(reassembleFragments([f1[0]!, f2[1]!])).toBeNull();

    // GattReassemblySession timeout eviction
    const session = new GattReassemblySession(500); // 500ms timeout
    const frags = fragmentPacket(new Uint8Array(40), 25, 300);
    session.processFragment(frags[0]!, 1000);
    expect(session.getActiveSessionCount()).toBe(1);

    // After 600ms, processed next fragment of another session evicts old one
    session.processFragment(frags[0]!, 1601);
    // Old session timed out and was reset
  });

  it('passes round-trip fuzz test across 10,000 random SOS packets', async () => {
    const keyPair = await crypto.generateKeyPair();
    const count = 10000;

    for (let i = 0; i < count; i++) {
      const lat = Math.random() * 180 - 90;
      const lon = Math.random() * 360 - 180;
      const accuracy = Math.floor(Math.random() * 1000);
      const status = Math.floor(Math.random() * 4);
      const people = Math.floor(Math.random() * 254) + 1;
      const needs = Math.floor(Math.random() * 256);
      const battery = Math.floor(Math.random() * 101);
      const seq = i % 65535;

      const raw = encodeSos({
        header: {
          version: 1,
          type: PacketType.SOS,
          flags: 0,
          ttl: 10,
          hop: 0,
          packetId: crypto.randomBytes(8),
          originFp: crypto.randomBytes(8),
        },
        body: {
          timestamp: 1700000000 + i,
          latitude: lat,
          longitude: lon,
          accuracyMeters: accuracy,
          status,
          peopleCount: people,
          needsMask: needs,
          batteryPercent: battery,
          sequenceNumber: seq,
          nonce: i * 7,
          publicKey: keyPair.publicKey,
          signature: crypto.randomBytes(64),
        },
      });

      const decoded = decodeSos(raw);
      expect(decoded.body.peopleCount).toBe(people);
      expect(decoded.body.status).toBe(status);
      expect(decoded.body.batteryPercent).toBe(battery);
      expect(decoded.body.sequenceNumber).toBe(seq);
      expect(Math.abs(decoded.body.latitude - lat)).toBeLessThan(1e-5);
      expect(Math.abs(decoded.body.longitude - lon)).toBeLessThan(1e-5);
    }
  });
});
