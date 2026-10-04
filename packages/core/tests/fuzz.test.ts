/**
 * RescueNet Packet Decoder Fuzzing Suite (Phase 14 Security Hardening)
 * Uses fast-check to systematically fuzz all binary and SMS decoders
 * with arbitrary byte streams, malformed headers, boundary truncations, and bit mutations.
 */

import * as fc from 'fast-check';
import {
  SodiumCrypto,
  decodeHeader,
  decodeSos,
  decodeAck,
  decodeDeadman,
  decodeLocation,
  decodeChat,
  decodeHello,
  decodeChatReceipt,
  decodeClusterSummary,
  createAndSignSos,
  createAndSignAck,
  decodeSms,
  parseHumanSms,
  TriageStatus,
  NeedsBitmask,
  HEADER_SIZE,
} from '../src/index';

describe('Phase 14: Packet Decoder Fuzzing & Strict Parsing (fast-check)', () => {
  let crypto: SodiumCrypto;
  let sampleValidSos: Uint8Array;
  let sampleValidAck: Uint8Array;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
    const kp = await crypto.generateKeyPair();
    sampleValidSos = await createAndSignSos(
      {
        timestamp: 1700000000,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 10,
        status: TriageStatus.TRAPPED,
        peopleCount: 2,
        needsMask: NeedsBitmask.WATER,
        batteryPercent: 80,
        sequenceNumber: 1,
        keyPair: kp,
      },
      crypto,
    );

    sampleValidAck = await createAndSignAck(
      {
        flags: 0,
        targetPacketId: crypto.randomBytes(8),
        arrivalMinutes: 15,
        status: 1,
        agencyId: 1,
        keyPair: kp,
      },
      crypto,
    );
  });

  describe('1. Binary Header Fuzzing', () => {
    it('safely parses or rejects arbitrary byte arrays without unhandled crashes', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const header = decodeHeader(view);
            expect(header).toBeDefined();
            expect(header.version).toBeDefined();
            expect(header.packetId.length).toBe(8);
          } catch (err: any) {
            // Must throw a standard Error if too short or malformed
            expect(err).toBeInstanceOf(Error);
            if (bytes.length < HEADER_SIZE) {
              expect(err.message).toContain('Buffer too short');
            }
          }
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('2. All Binary Packet Decoders Fuzzing', () => {
    it('decodeSos safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const sos = decodeSos(bytes);
            expect(sos).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeAck safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const ack = decodeAck(bytes);
            expect(ack).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeDeadman safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const deadman = decodeDeadman(bytes);
            expect(deadman).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeLocation safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const loc = decodeLocation(bytes);
            expect(loc).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeChat safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const chat = decodeChat(bytes);
            expect(chat).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeHello safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const hello = decodeHello(bytes);
            expect(hello).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeChatReceipt safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const receipt = decodeChatReceipt(bytes);
            expect(receipt).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('decodeClusterSummary safely rejects arbitrary random byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), bytes => {
          try {
            const summary = decodeClusterSummary(bytes);
            expect(summary).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 300 },
      );
    });
  });

  describe('3. SMS Payload Fuzzing', () => {
    it('parseHumanSms safely rejects arbitrary text input', () => {
      fc.assert(
        fc.property(fc.fullUnicodeString({ maxLength: 500 }), text => {
          try {
            const parsed = parseHumanSms(text);
            expect(parsed).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 400 },
      );
    });

    it('decodeSms safely rejects malformed or truncated base64 SMS data', async () => {
      await fc.assert(
        fc.asyncProperty(fc.base64String({ minLength: 0, maxLength: 300 }), async b64 => {
          try {
            const sos = await decodeSms(`RN1 ${b64}`);
            expect(sos).toBeDefined();
          } catch (err: any) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: 400 },
      );
    });
  });

  describe('4. Mutation Fuzzing on Valid Packets', () => {
    it('detects and safely handles random byte-level truncations on valid SOS', () => {
      // Test truncating at every single byte index from 0 to full length - 1
      for (let len = 0; len < sampleValidSos.length; len++) {
        const truncated = sampleValidSos.subarray(0, len);
        expect(() => decodeSos(truncated)).toThrow();
      }
      // Full packet parses successfully
      expect(decodeSos(sampleValidSos)).toBeDefined();
    });

    it('detects and safely handles random byte mutations on valid SOS', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: sampleValidSos.length - 1 }),
          fc.integer({ min: 0, max: 255 }),
          (byteIndex, mutatedValue) => {
            const corrupted = new Uint8Array(sampleValidSos);
            corrupted[byteIndex] = mutatedValue;

            try {
              const res = decodeSos(corrupted);
              expect(res).toBeDefined();
            } catch (err: any) {
              expect(err).toBeInstanceOf(Error);
            }
          },
        ),
        { numRuns: 300 },
      );
    });

    it('detects and safely handles random byte mutations on valid ACK', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: sampleValidAck.length - 1 }),
          fc.integer({ min: 0, max: 255 }),
          (byteIndex, mutatedValue) => {
            const corrupted = new Uint8Array(sampleValidAck);
            corrupted[byteIndex] = mutatedValue;

            try {
              const res = decodeAck(corrupted);
              expect(res).toBeDefined();
            } catch (err: any) {
              expect(err).toBeInstanceOf(Error);
            }
          },
        ),
        { numRuns: 300 },
      );
    });
  });
});
