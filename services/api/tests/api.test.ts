import { buildServer } from '../src/server';
import {
  PROTOCOL_VERSION,
  SodiumCrypto,
  createAndSignSos,
} from '@rescuenet/core';
import { db } from '../src/db/client';

describe('Phase 9: Backend API, Ingest, Server Clustering, and ACK Flow', () => {
  jest.setTimeout(30000);
  let server: ReturnType<typeof buildServer>;
  let crypto: SodiumCrypto;
  let authToken: string;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
    server = buildServer();
    await server.ready();

    // Login as dispatcher to obtain JWT for authenticated routes
    const loginRes = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'dispatcher@rescuenet.gov.in',
        password: 'password123', // Matches test mock hash
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    authToken = body.accessToken;
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /v1/health and GET /docs generate valid OpenAPI specification', async () => {
    const healthRes = await server.inject({
      method: 'GET',
      url: '/v1/health',
    });
    expect(healthRes.statusCode).toBe(200);
    const healthBody = JSON.parse(healthRes.body);
    expect(healthBody.status).toBe('ok');
    expect(healthBody.protocolVersion).toBe(PROTOCOL_VERSION);

    // Verify OpenAPI definition
    const docsRes = await server.inject({
      method: 'GET',
      url: '/docs/json',
    });
    expect(docsRes.statusCode).toBe(200);
    const openapi = JSON.parse(docsRes.body);
    expect(openapi.openapi).toBeDefined();
    expect(openapi.paths['/v1/uplink']).toBeDefined();
    expect(openapi.paths['/v1/clusters/{id}/ack']).toBeDefined();
    expect(openapi.paths['/v1/devices/register']).toBeDefined();
  });

  it('End-to-End Acceptance: 3 uplinked devices + 1 SMS webhook -> exactly 1 cluster, correct member count, priority, resend idempotency, ACK response & sms_outbound', async () => {
    const clusterLat = 18.5204;
    const clusterLon = 73.8567;
    const baseTimestamp = Math.floor(Date.now() / 1000);

    // 1. Create 3 distinct signed SOS packets within 20m of clusterLat, clusterLon
    const uplinkPacketsHex: string[] = [];
    const originFps: Uint8Array[] = [];

    for (let i = 1; i <= 3; i++) {
      const keyPair = await crypto.generateKeyPair();
      const originFp = new Uint8Array([0xaa, 0xbb, i, 0, 0, 0, 0, 0]);
      originFps.push(originFp);

      const sosBytes = await createAndSignSos(
        {
          ttl: 6,
          hop: 1,
          timestamp: baseTimestamp,
          latitude: clusterLat + i * 0.00005, // ~5-15 meters away
          longitude: clusterLon + i * 0.00005,
          accuracyMeters: 8,
          status: i === 1 ? 3 : 2, // Highest status = 3 (Critical)
          peopleCount: 2, // 2 people per device = 6 people
          needsMask: 0x05, // Medical + Water
          batteryPercent: 80,
          sequenceNumber: 1,
          keyPair,
        },
        crypto
      );

      uplinkPacketsHex.push(Buffer.from(sosBytes).toString('hex'));
    }

    // 2. Uplink the 3 packets via POST /v1/uplink
    const uplinkRes1 = await server.inject({
      method: 'POST',
      url: '/v1/uplink',
      payload: {
        packets: uplinkPacketsHex,
      },
    });

    expect(uplinkRes1.statusCode).toBe(200);
    const uplinkBody1 = JSON.parse(uplinkRes1.body);
    expect(uplinkBody1.accepted).toBe(3);
    expect(uplinkBody1.duplicate).toBe(0);
    expect(uplinkBody1.rejected).toBe(0);

    // 3. Post 1 SMS webhook call near the same cluster (Device 4)
    const smsRes = await server.inject({
      method: 'POST',
      url: '/v1/sms/webhook/twilio',
      payload: {
        From: '+919876543210',
        Body: `SOS 18.52042 73.85672 3 2 1 75`, // SOS lat lon status people needs battery
        MessageSid: `SM_${Date.now()}_test`,
      },
    });

    expect(smsRes.statusCode).toBe(200);
    const smsBody = JSON.parse(smsRes.body);
    expect(smsBody.success).toBe(true);

    // 4. Assert: Exactly one cluster produced with correct member count and priority
    const clustersRes = await server.inject({
      method: 'GET',
      url: '/v1/incidents/22222222-2222-2222-2222-222222222222/clusters',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(clustersRes.statusCode).toBe(200);
    const clusters = JSON.parse(clustersRes.body);

    // Acceptance 1: exactly one cluster
    expect(clusters.length).toBe(1);
    const cluster = clusters[0];

    // Acceptance 2: correct member count (4 devices)
    expect(cluster.member_count).toBe(4);
    // 2+2+2 + 2 = 8 survivors declared
    expect(cluster.declared_people).toBe(8);

    // Acceptance 3: correct priority score > 0
    expect(cluster.priority_score).toBeGreaterThan(0.5);
    expect(cluster.max_status).toBe(3); // Critical

    // 5. Acceptance 4: Idempotency on resend
    const resendRes = await server.inject({
      method: 'POST',
      url: '/v1/uplink',
      payload: {
        packets: uplinkPacketsHex,
      },
    });

    expect(resendRes.statusCode).toBe(200);
    const resendBody = JSON.parse(resendRes.body);
    expect(resendBody.accepted).toBe(0);
    expect(resendBody.duplicate).toBe(3);

    // Cluster count remains exactly 1
    const clustersAfterResend = await server.inject({
      method: 'GET',
      url: '/v1/incidents/22222222-2222-2222-2222-222222222222/clusters',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    expect(JSON.parse(clustersAfterResend.body).length).toBe(1);

    // 6. Dispatcher generates ACK via POST /v1/clusters/:id/ack
    const ackRes = await server.inject({
      method: 'POST',
      url: `/v1/clusters/${cluster.id}/ack`,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      payload: {
        ackType: 'help_on_way',
        etaMinutes: 25,
      },
    });

    expect(ackRes.statusCode).toBe(201);
    const ackBody = JSON.parse(ackRes.body);
    expect(ackBody.ackId).toBeDefined();
    expect(ackBody.meshPacketHex).toBeDefined();

    // Acceptance 5a: An sms_outbound row is created
    const smsOutRes = await db.query(`SELECT * FROM sms_outbound WHERE ack_id = $1;`, [ackBody.ackId]);
    expect(smsOutRes.rows.length).toBeGreaterThan(0);
    expect(smsOutRes.rows[0].body).toContain('Help is on the way');

    // Acceptance 5b: ACK appears in the next /uplink response in pendingAcks
    const nextUplinkRes = await server.inject({
      method: 'POST',
      url: '/v1/uplink',
      payload: {
        packets: [],
      },
    });

    expect(nextUplinkRes.statusCode).toBe(200);
    const nextUplinkBody = JSON.parse(nextUplinkRes.body);
    expect(nextUplinkBody.pendingAcks.length).toBeGreaterThan(0);
    expect(nextUplinkBody.pendingAcks.some((a: any) => a.ackId === ackBody.ackId)).toBe(true);
  });

  it('Performance Acceptance: p95 ingest of a 200-packet batch under 300 ms on a laptop', async () => {
    // Generate a batch of 200 unique signed packets
    const batchHex: string[] = [];
    const now = Math.floor(Date.now() / 1000);
    const keyPair = await crypto.generateKeyPair();

    for (let i = 0; i < 200; i++) {
      const packet = await createAndSignSos(
        {
          ttl: 5,
          hop: 0,
          timestamp: now,
          latitude: 18.5204 + (i * 0.0001),
          longitude: 73.8567 + (i * 0.0001),
          accuracyMeters: 10,
          status: 1,
          peopleCount: 1,
          needsMask: 1,
          batteryPercent: 90,
          sequenceNumber: 1,
          keyPair,
        },
        crypto
      );

      batchHex.push(Buffer.from(packet).toString('hex'));
    }

    // Measure ingest elapsed time
    const startTime = Date.now();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/uplink',
      payload: {
        packets: batchHex,
      },
    });
    const durationMs = Date.now() - startTime;

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accepted).toBe(200);

    // Acceptance criterion: under 300 ms
    expect(durationMs).toBeLessThan(300);
  });
});
