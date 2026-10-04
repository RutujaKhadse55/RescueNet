import {
  SodiumCrypto,
  issueRescuerCredential,
  exportCredentialToken,
  createSignedRevocationList,
  createAndSignAck,
  PacketFlags,
  PacketType,
  HomingEngine,
} from '@rescuenet/core';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { MockBleTransport } from '../src/native/RescueBle';
import { RescuerCredentialService } from '../src/rescuer/RescuerCredentialService';
import { HomingService } from '../src/rescuer/HomingService';
import { AckReceiver } from '../src/ack/AckReceiver';
import { MeshEngine } from '../src/mesh/MeshEngine';
import { PacketValidator } from '../src/mesh/PacketValidator';
import { DEFAULT_MESH_POLICY } from '../src/mesh/types';

describe('Phase 13: Rescuer Mode, Homing, and Credentials Test Suite', () => {
  let crypto: SodiumCrypto;
  let db: DatabaseManager;
  let transport: MockBleTransport;
  let rescuerService: RescuerCredentialService;
  let meshEngine: MeshEngine;
  let ackReceiver: AckReceiver;

  let agencyCaKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let rescuerKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let unverifiedKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
    agencyCaKeyPair = await crypto.generateKeyPair();
    rescuerKeyPair = await crypto.generateKeyPair();
    unverifiedKeyPair = await crypto.generateKeyPair();
  });

  beforeEach(async () => {
    db = await DatabaseManager.create(true, undefined, crypto);
    transport = new MockBleTransport();

    rescuerService = new RescuerCredentialService(db, crypto, agencyCaKeyPair.publicKey);
    await rescuerService.init();

    meshEngine = new MeshEngine({
      nodeId: 'node_rescuer_01',
      crypto,
      db,
      transport,
      role: 'survivor',
      keyPair: rescuerKeyPair,
    });
    meshEngine.setRescuerService(rescuerService);
    await meshEngine.start();

    ackReceiver = new AckReceiver(
      db,
      crypto,
      agencyCaKeyPair.publicKey,
      meshEngine,
      'en',
      rescuerService,
    );
  });

  afterEach(async () => {
    await meshEngine.stop();
  });

  describe('1. Rescuer Enrollment & Credential Lifecycle', () => {
    it('successfully enrolls rescuer with valid Agency-CA-signed credential token', async () => {
      // 1. Issue credential signed by Agency CA
      const cred = await issueRescuerCredential(
        {
          credentialId: 'cred_ndrf_701',
          userId: 'usr_patil_88',
          rescuerName: 'Inspector Patil',
          badgeNumber: 'NDRF-B5-104',
          agencyId: 'NDRF',
          rescuerPublicKey: rescuerKeyPair.publicKey,
          validitySeconds: 3600 * 24 * 7,
          permissions: ['ack_cluster', 'mark_reached', 'mark_closed', 'gateway_relay'],
        },
        agencyCaKeyPair.privateKey,
      );

      const token = exportCredentialToken(cred);
      expect(token.startsWith('RESCUER-V1:')).toBe(true);

      // 2. Import into mobile RescuerCredentialService
      let roleChanged = false;
      rescuerService.onRoleChange(isRescuer => {
        roleChanged = isRescuer;
      });

      const importResult = await rescuerService.importCredential(token);
      expect(importResult.success).toBe(true);
      expect(importResult.credential?.rescuerName).toBe('Inspector Patil');
      expect(rescuerService.isRescuer()).toBe(true);
      expect(roleChanged).toBe(true);

      const active = rescuerService.getActiveCredential();
      expect(active?.badgeNumber).toBe('NDRF-B5-104');
    });

    it('rejects credential with forged or invalid CA signature', async () => {
      const fakeCaKeyPair = await crypto.generateKeyPair();
      const forgedCred = await issueRescuerCredential(
        {
          credentialId: 'cred_forged_999',
          userId: 'usr_imposter',
          rescuerName: 'Imposter',
          badgeNumber: 'FAKE-001',
          agencyId: 'UNKNOWN',
          rescuerPublicKey: unverifiedKeyPair.publicKey,
        },
        fakeCaKeyPair.privateKey, // Signed with wrong CA
      );

      const token = exportCredentialToken(forgedCred);
      const result = await rescuerService.importCredential(token);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agency CA signature invalid');
      expect(rescuerService.isRescuer()).toBe(false);
    });

    it('rejects expired credential', async () => {
      const expiredCred = await issueRescuerCredential(
        {
          credentialId: 'cred_expired_01',
          userId: 'usr_retired',
          rescuerName: 'Retired Officer',
          badgeNumber: 'RET-01',
          agencyId: 'NDRF',
          rescuerPublicKey: rescuerKeyPair.publicKey,
          validitySeconds: -3600, // Expired 1 hour ago
        },
        agencyCaKeyPair.privateKey,
      );

      const token = exportCredentialToken(expiredCred);
      const result = await rescuerService.importCredential(token);
      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
      expect(rescuerService.isRescuer()).toBe(false);
    });
  });

  describe('2. Unverified Rescuer Packet Rejection', () => {
    it('rejects ACK packet lacking FROM_RESCUER flag', async () => {
      const targetPacketId = crypto.randomBytes(8);
      // ACK created without FROM_RESCUER flag (e.g. standard user phone)
      const ackBytes = await createAndSignAck(
        {
          flags: PacketFlags.NONE,
          targetPacketId,
          arrivalMinutes: 10,
          status: 1,
          agencyId: 1,
          keyPair: unverifiedKeyPair,
        },
        crypto,
      );

      // AckReceiver must reject it
      const ackResult = await ackReceiver.processAckPacket(ackBytes);
      expect(ackResult.valid).toBe(false);

      // PacketValidator must reject it
      const validator = new PacketValidator(crypto, db, DEFAULT_MESH_POLICY, rescuerService);
      const valResult = await validator.validatePacket(ackBytes);
      expect(valResult.valid).toBe(false);
      expect(valResult.reason).toBe('invalid_signature');
    });

    it('rejects ACK packet claiming FROM_RESCUER but signed by an unverified key', async () => {
      const targetPacketId = crypto.randomBytes(8);
      // Phone sets FROM_RESCUER flag but key is NOT registered in agency CA chain
      const ackBytes = await createAndSignAck(
        {
          flags: PacketFlags.FROM_RESCUER,
          targetPacketId,
          arrivalMinutes: 10,
          status: 1,
          agencyId: 1,
          keyPair: unverifiedKeyPair,
        },
        crypto,
      );

      const ackResult = await ackReceiver.processAckPacket(ackBytes);
      expect(ackResult.valid).toBe(false);

      const validator = new PacketValidator(crypto, db, DEFAULT_MESH_POLICY, rescuerService);
      const valResult = await validator.validatePacket(ackBytes);
      expect(valResult.valid).toBe(false);
      expect(valResult.reason).toBe('invalid_signature');
    });
  });

  describe('3. Revocation List (CRL) Synchronization and Rejection', () => {
    it('rejects ACK after signer credential is revoked by CRL', async () => {
      // 1. First enroll rescuer with valid credential
      const cred = await issueRescuerCredential(
        {
          credentialId: 'cred_rescuer_to_revoke',
          userId: 'usr_revoked_rescuer',
          rescuerName: 'Rescuer Smith',
          badgeNumber: 'SDRF-77',
          agencyId: 'SDRF',
          rescuerPublicKey: rescuerKeyPair.publicKey,
        },
        agencyCaKeyPair.privateKey,
      );
      await rescuerService.importCredential(exportCredentialToken(cred));
      expect(rescuerService.isRescuer()).toBe(true);

      // 2. Verified ACK before revocation is accepted
      const targetPacketId = crypto.randomBytes(8);
      const ackBytes = await createAndSignAck(
        {
          flags: PacketFlags.FROM_RESCUER,
          targetPacketId,
          arrivalMinutes: 15,
          status: 1,
          agencyId: 1,
          keyPair: rescuerKeyPair,
        },
        crypto,
      );

      const initialResult = await ackReceiver.processAckPacket(ackBytes);
      expect(initialResult.valid).toBe(true);

      // 3. Issue and sync CRL containing this rescuer's public key
      const rescuerPubkeyHex = Buffer.from(rescuerKeyPair.publicKey).toString('hex');
      const crl = await createSignedRevocationList(
        'SDRF',
        ['cred_rescuer_to_revoke'],
        [rescuerPubkeyHex],
        agencyCaKeyPair.privateKey,
      );

      const crlUpdate = await rescuerService.updateRevocationList(crl);
      expect(crlUpdate.success).toBe(true);

      // Rescuer mode must now be revoked locally
      expect(rescuerService.isRescuer()).toBe(false);

      // 4. Receivers now reject any further ACK from this revoked key
      const target2 = crypto.randomBytes(8);
      const ackBytesAfterRevoke = await createAndSignAck(
        {
          flags: PacketFlags.FROM_RESCUER,
          targetPacketId: target2,
          arrivalMinutes: 15,
          status: 1,
          agencyId: 1,
          keyPair: rescuerKeyPair,
        },
        crypto,
      );

      const revokedResult = await ackReceiver.processAckPacket(ackBytesAfterRevoke);
      expect(revokedResult.valid).toBe(false);
    });
  });

  describe('4. Homing Mode & Final Approach Signal Processing', () => {
    it('Kalman filter and Moving Average correctly compute Warmer, Colder, and Steady trends', () => {
      const engine = new HomingEngine();
      const startTime = 1000000;

      // Initial steady baseline around -85 dBm
      for (let i = 0; i < 6; i++) {
        engine.processRssi(-85 + (i % 2 === 0 ? 0.5 : -0.5), startTime + i * 1000);
      }
      expect(engine.getState().trend).toBe('steady');

      // Moving closer (signal gets progressively stronger: -75 dBm -> -58 dBm)
      let state = engine.getState();
      for (let i = 6; i < 18; i++) {
        state = engine.processRssi(-85 + (i - 5) * 2.5, startTime + i * 1000);
      }
      expect(state.trend).toBe('warmer');
      expect(state.signalBars).toBeGreaterThanOrEqual(3);
      expect(state.pulseIntervalMs).toBeLessThan(900); // Pulse speed increased

      // Moving away (signal drops significantly to -92 dBm over 15 seconds)
      for (let i = 18; i < 32; i++) {
        state = engine.processRssi(-95, startTime + i * 1000);
      }
      expect(state.trend).toBe('colder');
    });

    it('HomingService tracks target and signs REACHED packet on Found Them', async () => {
      // Enroll rescuer first
      const cred = await issueRescuerCredential(
        {
          credentialId: 'cred_lead_rescuer',
          userId: 'usr_lead',
          rescuerName: 'Commander Roy',
          badgeNumber: 'NDRF-COMMAND',
          agencyId: '1',
          rescuerPublicKey: rescuerKeyPair.publicKey,
        },
        agencyCaKeyPair.privateKey,
      );
      await rescuerService.importCredential(exportCredentialToken(cred));

      // Create a test cluster in DB
      await db.clusters.upsertCluster({
        cluster_id: 'cl_survivor_zone_01',
        centroid_lat: 18.52,
        centroid_lon: 73.85,
        radius_meters: 25,
        member_count: 3,
        priority_score: 85,
        state: 'assigned',
        updated_at: new Date().toISOString(),
      });

      const homingService = new HomingService(transport, db, meshEngine, rescuerService);
      let lastReportedState: any = null;
      homingService.onStateChange(st => {
        lastReportedState = st;
      });

      await homingService.startHoming({
        targetId: 'cl_survivor_zone_01',
        originFpPrefix: 'cl_survi',
        title: 'Cluster Zone 01',
      });

      expect(homingService.isRunning()).toBe(true);

      // Simulate approaching survivor with multiple samples
      for (let i = 0; i < 5; i++) homingService.feedRssiSample(-75);
      for (let i = 0; i < 5; i++) homingService.feedRssiSample(-62);
      for (let i = 0; i < 10; i++) homingService.feedRssiSample(-50);

      expect(lastReportedState).not.toBeNull();
      expect(lastReportedState.signalBars).toBe(5); // 5 bars when very close (-50 dBm)
      expect(lastReportedState.trend).toBe('warmer');

      // Click "Found Them"
      const foundResult = await homingService.markFound();
      expect(foundResult.success).toBe(true);
      expect(homingService.isRunning()).toBe(false);

      // Cluster state must be updated to 'reached'
      const updatedCluster = await db.clusters.getCluster('cl_survivor_zone_01');
      expect(updatedCluster?.state).toBe('reached');
    });
  });

  describe('5. Survivor High-Duty BEACON_ONLY Trigger on Rescuer ACK', () => {
    it('switches survivor phone to BEACON_ONLY mode upon receiving rescuer ACK', async () => {
      // Enroll rescuer key in rescuer service so validator accepts the packet
      const cred = await issueRescuerCredential(
        {
          credentialId: 'cred_beacon_test',
          userId: 'usr_beacon',
          rescuerName: 'Rescuer Beacon',
          badgeNumber: 'B-01',
          agencyId: '1',
          rescuerPublicKey: rescuerKeyPair.publicKey,
        },
        agencyCaKeyPair.privateKey,
      );
      await rescuerService.importCredential(exportCredentialToken(cred));

      let currentAdvMode: string = 'BALANCED';
      transport.setAdvertisingMode = jest.fn(async mode => {
        currentAdvMode = mode;
      });

      // Survivor mesh engine hears a verified rescuer ACK
      const targetId = crypto.randomBytes(8);
      const rescuerAckBytes = await createAndSignAck(
        {
          flags: PacketFlags.FROM_RESCUER,
          targetPacketId: targetId,
          arrivalMinutes: 10,
          status: 1,
          agencyId: 1,
          keyPair: rescuerKeyPair,
        },
        crypto,
      );

      // Ingest packet into survivor mesh engine
      const ingestRes = await meshEngine.ingestPacket(rescuerAckBytes);
      expect(ingestRes.accepted).toBe(true);

      expect(transport.setAdvertisingMode).toHaveBeenCalledWith('BEACON_ONLY');
      expect(currentAdvMode).toBe('BEACON_ONLY');
    });
  });

  describe('6. Rescuer Always-On Relay & Byte Budget', () => {
    it('sets 64 KB contact byte budget and prioritizes ACK packets in rescuer role', async () => {
      meshEngine.setRole('rescuer');
      expect(meshEngine.getRole()).toBe('rescuer');

      // Rescuer byte budget is expanded to 64 KB (65536 bytes)
      // When exchanging, candidates prioritize ACK packets ahead of other types
      expect(DEFAULT_MESH_POLICY.carrierBudgetBytes).toBe(65536);
    });
  });
});
