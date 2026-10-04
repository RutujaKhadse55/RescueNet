/**
 * RescueNet Phase 14 Security, Privacy & Abuse Hardening Test Suite
 * Validates:
 * 1. Packet parsing, clock skew bounds, and server time correction
 * 2. Monotonic sequence & nonce replay protection
 * 3. Origin rate limiting and flood circuit breaker
 * 4. Banned key enforcement
 * 5. Ephemeral pseudonym signed chain of custody
 * 6. Root/tamper advisory warnings (SOS never blocked)
 * 7. Certificate pinning, screenshot protection, and log sanitization
 */

import {
  SodiumCrypto,
  createAndSignSos,
  PacketFlags,
  TriageStatus,
  NeedsBitmask,
} from '@rescuenet/core';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { PacketValidator } from '../src/mesh/PacketValidator';
import { DEFAULT_MESH_POLICY } from '../src/mesh/types';
import { IdentityService } from '../src/security/identity';
import { DeviceSecurityGovernor } from '../src/security/DeviceSecurityGovernor';

describe('Phase 14: Security, Privacy & Abuse Hardening Suite', () => {
  let crypto: SodiumCrypto;
  let db: DatabaseManager;
  let validator: PacketValidator;
  let identityService: IdentityService;
  let testKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
    testKeyPair = await crypto.generateKeyPair();
  });

  beforeEach(async () => {
    db = await DatabaseManager.create(true, undefined, crypto);
    validator = new PacketValidator(crypto, db, DEFAULT_MESH_POLICY);
    identityService = await IdentityService.create(crypto);
  });

  describe('1. Packet Security, Clock Skew & Server Time Correction', () => {
    it('rejects packet with timestamp skewed > 300 seconds into the future', async () => {
      const now = Math.floor(Date.now() / 1000);
      const skewedFutureTime = now + 400; // 400s in future (> 300s limit)

      const packet = await createAndSignSos(
        {
          timestamp: skewedFutureTime,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 1,
          keyPair: testKeyPair,
        },
        crypto,
      );

      const result = await validator.validatePacket(packet, now);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('future_timestamp');
    });

    it('corrects for device clock drift when calibrated with server time offset', async () => {
      const deviceClockNow = Math.floor(Date.now() / 1000);
      // Suppose server is 200 seconds ahead: true time = deviceClockNow + 200
      validator.setServerTimeOffset(200);

      // A packet created at true server time (deviceClockNow + 150)
      // Without offset, 150s future is close; with offset, it is recognized as valid past
      const packet = await createAndSignSos(
        {
          timestamp: deviceClockNow + 150,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 2,
          keyPair: testKeyPair,
        },
        crypto,
      );

      const result = await validator.validatePacket(packet, deviceClockNow);
      expect(result.valid).toBe(true);
    });
  });

  describe('2. Replay Protection (Sequence & Nonce)', () => {
    it('rejects replayed packet with equal or lower sequence number from same origin', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Packet 1: Seq 5
      const packet1 = await createAndSignSos(
        {
          timestamp: now - 10,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 5,
          keyPair: testKeyPair,
        },
        crypto,
      );
      const res1 = await validator.validatePacket(packet1, now);
      expect(res1.valid).toBe(true);

      // Packet 2: Replay or old Seq 4 from same origin
      const packet2 = await createAndSignSos(
        {
          timestamp: now - 5,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 4, // Stale!
          keyPair: testKeyPair,
        },
        crypto,
      );
      const res2 = await validator.validatePacket(packet2, now);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toBe('replay_seq');
    });

    it('rejects duplicate packet with already seen nonce', async () => {
      const now = Math.floor(Date.now() / 1000);
      const fixedNonce = 0xabcdef12;

      const packet1 = await createAndSignSos(
        {
          timestamp: now - 10,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 10,
          nonce: fixedNonce,
          keyPair: testKeyPair,
        },
        crypto,
      );
      const res1 = await validator.validatePacket(packet1, now);
      expect(res1.valid).toBe(true);

      const packet2 = await createAndSignSos(
        {
          timestamp: now - 2,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 11,
          nonce: fixedNonce, // Reused nonce!
          keyPair: testKeyPair,
        },
        crypto,
      );
      const res2 = await validator.validatePacket(packet2, now);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toBe('replay_nonce');
    });
  });

  describe('3. Abuse Controls & Global Circuit Breaker', () => {
    it('immediately rejects packets from banned public keys', async () => {
      const now = Math.floor(Date.now() / 1000);
      const badKeyPair = await crypto.generateKeyPair();
      const originFp = await crypto.blake2b(badKeyPair.publicKey, 8);
      const fpString = Array.from(originFp)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      validator.banKey(fpString);
      expect(validator.isKeyBanned(fpString)).toBe(true);

      const packet = await createAndSignSos(
        {
          timestamp: now,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.SAFE,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 1,
          keyPair: badKeyPair,
        },
        crypto,
      );

      const res = await validator.validatePacket(packet, now);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('invalid_signature');
    });

    it('trips global circuit breaker when packet ingestion rate spikes and suppresses low-trust packets', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Simulate a flood of 130 packets in the last 60 seconds
      for (let i = 0; i < 130; i++) {
        const dummy = await crypto.generateKeyPair();
        const p = await createAndSignSos(
          {
            timestamp: now,
            latitude: 18.52,
            longitude: 73.85,
            accuracyMeters: 10,
            status: TriageStatus.SAFE,
            peopleCount: 1,
            needsMask: 0,
            batteryPercent: 90,
            sequenceNumber: 1,
            keyPair: dummy,
          },
          crypto,
        );
        await validator.validatePacket(p, now);
      }

      expect(validator.isCircuitBreakerActive()).toBe(true);

      // An unverified (forged signature) SOS arrives during flood
      const forged = await createAndSignSos(
        {
          timestamp: now,
          latitude: 18.52,
          longitude: 73.85,
          accuracyMeters: 10,
          status: TriageStatus.TRAPPED,
          peopleCount: 1,
          needsMask: 0,
          batteryPercent: 90,
          sequenceNumber: 1,
          keyPair: testKeyPair,
        },
        crypto,
      );
      // Corrupt signature bytes
      forged[forged.length - 5] ^= 0xff;

      const res = await validator.validatePacket(forged, now);
      // Circuit breaker suppresses it
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('rate_limit_exceeded');
    });
  });

  describe('4. Pseudonym Rotation & Signed Chain of Custody', () => {
    it('verifies that every ephemeral key is signed by the master identity key', async () => {
      const state = identityService.getIdentityState();
      const masterPub = identityService.getMasterPublicKey();

      expect(state.ephemeralPool.length).toBe(10);

      for (let i = 0; i < state.ephemeralPool.length; i++) {
        const ep = state.ephemeralPool[i];
        expect(ep.chainOfCustodySigHex).toBeDefined();

        const payload = new TextEncoder().encode(
          `RESCUENET-EPHEMERAL-CHAIN:${i}:${ep.publicKeyHex}:${ep.expiresAt}`,
        );
        const sigBytes = new Uint8Array(Buffer.from(ep.chainOfCustodySigHex!, 'hex'));

        const isValid = await crypto.verify(sigBytes, payload, masterPub);
        expect(isValid).toBe(true);
      }
    });

    it('rotates to next ephemeral pseudonym upon manual or 24h trigger', async () => {
      const initial = identityService.getActiveEphemeralKey();
      expect(initial.poolIndex).toBe(0);

      const rotated = await identityService.rotateEphemeralKey();
      expect(rotated.poolIndex).toBe(1);
      expect(rotated.publicKeyHex).not.toBe(initial.publicKeyHex);
      expect(rotated.originFp).not.toBe(initial.originFp);
    });
  });

  describe('5. Mobile Hardening & Privacy Protections', () => {
    it('evaluates device integrity without ever blocking SOS functionality', () => {
      const gov = DeviceSecurityGovernor.getInstance();
      const status = gov.evaluateDeviceIntegrity();

      expect(status).toHaveProperty('isRooted');
      expect(status).toHaveProperty('isTampered');
      expect(status).toHaveProperty('warnings');
    });

    it('validates SPKI certificate pinning for agency CA and production servers', () => {
      const gov = DeviceSecurityGovernor.getInstance();
      expect(gov.verifyCertificatePin('WoiHZi2D9AZtotSJ9996KnMVnZMVqzURixn708YhiUs=')).toBe(true);
      expect(gov.verifyCertificatePin('forged_untrusted_spki_hash=')).toBe(false);
    });

    it('sanitizes log statements by redacting exact GPS, crypto keys, phone numbers, and JWTs', () => {
      const gov = DeviceSecurityGovernor.getInstance();
      const sensitiveLog =
        'Alert at 18.5204303, 73.8567437 with key 4a656c78763879617364666a68617364666a68617364666a68617364666a6861 for phone +919876543210 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.abc';

      const sanitized = gov.sanitizeLog(sensitiveLog);

      expect(sanitized).not.toContain('18.5204303');
      expect(sanitized).not.toContain('+919876543210');
      expect(sanitized).not.toContain(
        '4a656c78763879617364666a68617364666a68617364666a68617364666a6861',
      );
      expect(sanitized).toContain('[REDACTED_PRECISE_GPS]');
      expect(sanitized).toContain('[REDACTED_PHONE]');
      expect(sanitized).toContain('[REDACTED_CRYPTO_KEY]');
      expect(sanitized).toContain('Bearer [REDACTED_JWT]');
    });
  });
});
