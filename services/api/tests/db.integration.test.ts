import { Client } from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { runSeed } from '../src/db/seed';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://rescuenet:rescuenet_secret@localhost:5432/rescuenet';

describe('PostGIS Schema & Database Integration Tests', () => {
  let client: Client;
  let isDbConnected = false;

  beforeAll(async () => {
    client = new Client({ connectionString });
    try {
      await client.connect();
      isDbConnected = true;
    } catch {
      console.warn(
        `[Integration Test] PostgreSQL not available at ${connectionString}. Skipping live DB tests on local host without Docker.`,
      );
    }
  });

  afterAll(async () => {
    if (isDbConnected) {
      await client.end();
    }
  });

  it('verifies idempotent insert on packet_id with ON CONFLICT DO NOTHING', async () => {
    if (!isDbConnected) {
      console.log('Skipping DB assertion: DB not running locally.');
      return;
    }

    const testPacketId = crypto.randomBytes(8);
    const originFp = crypto.randomBytes(8);
    const rawPayload = crypto.randomBytes(140);

    const insertSql = `
      INSERT INTO packets (
        packet_id, kind, origin_fp, sent_at, location, accuracy_m, status,
        people, needs, battery_pct, seq, hop_count, signature_valid,
        registered, channel, raw
      )
      VALUES (
        $1, 'sos', $2, now(), ST_SetSRID(ST_MakePoint(73.8567, 18.5204), 4326)::geography,
        15, 3, 4, 3, 85, 1, 0, true, true, 'internet', $3
      )
      ON CONFLICT (packet_id) DO NOTHING
      RETURNING packet_id;
    `;

    // 1st insert: succeeds and returns row
    const res1 = await client.query(insertSql, [testPacketId, originFp, rawPayload]);
    expect(res1.rowCount).toBe(1);

    // 2nd insert with exact same packet_id: no-op, does not throw, rowCount is 0
    const res2 = await client.query(insertSql, [testPacketId, originFp, rawPayload]);
    expect(res2.rowCount).toBe(0);

    // Clean up
    await client.query('DELETE FROM packets WHERE packet_id = $1', [testPacketId]);
  });

  it('verifies GIST index use on spatial radius query (5 km of a point)', async () => {
    if (!isDbConnected) {
      console.log('Skipping DB assertion: DB not running locally.');
      return;
    }

    // Seed data if not already populated
    await runSeed(client);

    // Enable index scan preference for test query plan
    await client.query('SET enable_seqscan = OFF;');

    const explainQuery = `
      EXPLAIN (FORMAT TEXT)
      SELECT id, priority_score, centroid
      FROM clusters
      WHERE ST_DWithin(centroid, ST_SetSRID(ST_MakePoint(73.8567, 18.5204), 4326)::geography, 5000)
      ORDER BY priority_score DESC;
    `;

    const explainRes = await client.query(explainQuery);
    const planText = explainRes.rows.map(r => r['QUERY PLAN']).join('\n');

    expect(planText).toMatch(/Index Scan|Bitmap Index Scan|clusters_centroid_gix/i);

    // Reset planner parameter
    await client.query('SET enable_seqscan = ON;');
  });

  it('tests the purge_incident retention function deleting packets, chats, and members', async () => {
    if (!isDbConnected) {
      console.log('Skipping DB assertion: DB not running locally.');
      return;
    }

    // Create an ephemeral incident
    const incRes = await client.query(`
      INSERT INTO incidents (agency_id, name, hazard, status)
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        'Test Incident for Purge Retention',
        'Flood Drill',
        'open'
      )
      RETURNING id;
    `);
    const incidentId = incRes.rows[0].id;

    // Create an ephemeral cluster
    const clusterRes = await client.query(
      `
      INSERT INTO clusters (
        incident_id, centroid, radius_m, member_count, declared_people,
        max_status, first_seen, last_seen, priority_score
      )
      VALUES (
        $1, ST_SetSRID(ST_MakePoint(73.8567, 18.5204), 4326)::geography,
        30.0, 1, 2, 2, now(), now(), 0.7
      )
      RETURNING id;
    `,
      [incidentId],
    );
    const clusterId = clusterRes.rows[0].id;

    // Insert packet
    const pktId = crypto.randomBytes(8);
    const originFp = crypto.randomBytes(8);
    await client.query(
      `
      INSERT INTO packets (
        packet_id, incident_id, kind, origin_fp, sent_at, signature_valid, registered, channel, raw
      )
      VALUES ($1, $2, 'sos', $3, now(), true, true, 'internet', $4);
    `,
      [pktId, incidentId, originFp, crypto.randomBytes(50)],
    );

    // Insert cluster member
    await client.query(
      `
      INSERT INTO cluster_members (cluster_id, origin_fp, latest_packet_id)
      VALUES ($1, $2, $3);
    `,
      [clusterId, originFp, pktId],
    );

    // Insert chat uplink
    await client.query(
      `
      INSERT INTO chat_uplinks (packet_id, cluster_id, origin_fp, body_enc, sent_at)
      VALUES ($1, $2, $3, $4, now());
    `,
      [pktId, clusterId, originFp, crypto.randomBytes(32)],
    );

    // Execute purge_incident function
    const purgeRes = await client.query('SELECT purge_incident($1) AS result;', [incidentId]);
    const resultJson = purgeRes.rows[0].result;

    expect(resultJson.deleted_packets).toBeGreaterThanOrEqual(1);
    expect(resultJson.deleted_cluster_members).toBeGreaterThanOrEqual(1);
    expect(resultJson.deleted_chat_uplinks).toBeGreaterThanOrEqual(1);

    // Verify incident is now closed
    const checkInc = await client.query('SELECT status FROM incidents WHERE id = $1;', [
      incidentId,
    ]);
    expect(checkInc.rows[0].status).toBe('closed');

    // Clean up incident and cluster
    await client.query('DELETE FROM clusters WHERE id = $1', [clusterId]);
    await client.query('DELETE FROM incidents WHERE id = $1', [incidentId]);
  });
});
