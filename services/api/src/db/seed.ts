import { Client } from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://rescuenet:rescuenet_secret@localhost:5432/rescuenet';

export async function runSeed(client?: Client): Promise<void> {
  const shouldClose = !client;
  const pgClient = client || new Client({ connectionString });

  if (shouldClose) {
    await pgClient.connect();
  }

  console.log(
    'Seeding RescueNet database with foundational incident, agency, and cluster records...',
  );

  try {
    // 1. Seed Agency
    const agencyRes = await pgClient.query(`
      INSERT INTO agencies (id, name, ca_public_key)
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        'National Disaster Response Force (NDRF) - 5th Battalion',
        decode('MCowBQYDK2VwAyEAx5d3v90oP9zP+6U6r3N6LhHh5k2f1W9r5Q3j8K9d2A4=', 'base64')
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const agencyId = agencyRes.rows[0].id;

    // 2. Seed Users
    const dummyHash = crypto
      .createHash('sha256')
      .update('RescueNet2024!SecurePassword')
      .digest('hex');

    const users = [
      {
        id: '22222222-2222-2222-2222-222222222221',
        email: 'admin@rescuenet.gov.in',
        name: 'NDRF Cmdr. Rajesh Sharma',
        role: 'admin',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'dispatcher@rescuenet.gov.in',
        name: 'Duty Officer Ananya Rao',
        role: 'dispatcher',
      },
      {
        id: '22222222-2222-2222-2222-222222222223',
        email: 'rescuer@rescuenet.gov.in',
        name: 'Team Lead Vikram Jadhav',
        role: 'rescuer',
      },
    ];

    for (const u of users) {
      await pgClient.query(
        `
        INSERT INTO users (id, agency_id, email, password_hash, full_name, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
      `,
        [u.id, agencyId, u.email, dummyHash, u.name, u.role],
      );
    }

    // 3. Seed Incident (Monsoon Floods & Landslides covering Maharashtra & Kerala sectors)
    const incidentRes = await pgClient.query(`
      INSERT INTO incidents (
        id, agency_id, name, hazard, status, is_drill, opened_at
      )
      VALUES (
        '33333333-3333-3333-3333-333333333333',
        '${agencyId}',
        'Operation Sahayata - Monsoon Floods & Landslides 2024',
        'Flooding, River Overflow, and Hill Slope Landslides',
        'open',
        false,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const incidentId = incidentRes.rows[0].id;

    // 4. Seed Teams
    const teams = [
      {
        id: '44444444-4444-4444-4444-444444444441',
        name: 'NDRF Boat Squad Alpha (Pune)',
        lead: '22222222-2222-2222-2222-222222222223',
        lat: 18.5204,
        lon: 73.8567,
      },
      {
        id: '44444444-4444-4444-4444-444444444442',
        name: 'NDRF Mountain & Debris Rescue Bravo (Wayanad)',
        lead: '22222222-2222-2222-2222-222222222223',
        lat: 11.6854,
        lon: 76.132,
      },
    ];

    for (const t of teams) {
      await pgClient.query(
        `
        INSERT INTO teams (id, agency_id, name, lead_user_id, last_position, last_position_at)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `,
        [t.id, agencyId, t.name, t.lead, t.lon, t.lat],
      );
    }

    // 5. Seed Synthetic Clusters around Pune (18.52N, 73.85E) and Wayanad (11.55N, 76.13E)
    const clusters = [
      {
        id: '55555555-5555-5555-5555-555555555501',
        external_id: Buffer.from('cl_pune_ghats_01'),
        lat: 18.5204,
        lon: 73.8567,
        radius_m: 45.0,
        member_count: 5,
        declared_people: 5,
        max_status: 3, // Critical Red
        needs_mask: 3, // Medical + Trapped
        best_battery: 88,
        priority_score: 0.85,
        flags: ['large_group', 'structural_collapse'],
        state: 'new',
        floor_hint: 'Pune Ghats Sector 4 Ground & Rubble',
      },
      {
        id: '55555555-5555-5555-5555-555555555502',
        external_id: Buffer.from('CL_PUNE_MUTHA_02'),
        lat: 18.5145,
        lon: 73.8378,
        radius_m: 25.0,
        member_count: 3,
        declared_people: 6,
        max_status: 2, // Trapped
        needs_mask: 16, // Evacuation
        best_battery: 65,
        priority_score: 0.72,
        flags: ['rapid_current'],
        state: 'new',
        floor_hint: 'Riverbank embankment',
      },
      {
        id: '55555555-5555-5555-5555-555555555503',
        external_id: Buffer.from('CL_PUNE_KOTHRUD_03'),
        lat: 18.5074,
        lon: 73.8077,
        radius_m: 50.0,
        member_count: 8,
        declared_people: 18,
        max_status: 1, // Injured
        needs_mask: 1, // Medical
        best_battery: 91,
        priority_score: 0.58,
        flags: ['large_group'],
        state: 'new',
        floor_hint: 'Community Hall ground',
      },
      {
        id: '55555555-5555-5555-5555-555555555504',
        external_id: Buffer.from('CL_WAYANAD_MEPPADI_04'),
        lat: 11.5542,
        lon: 76.1265,
        radius_m: 40.0,
        member_count: 4,
        declared_people: 8,
        max_status: 3, // Critical
        needs_mask: 49, // Medical + Evacuation + Mobility
        best_battery: 45,
        priority_score: 0.94,
        flags: ['debris_trapped', 'possibly_failing'],
        state: 'new',
        floor_hint: 'Collapsed plantation quarters',
      },
      {
        id: '55555555-5555-5555-5555-555555555505',
        external_id: Buffer.from('CL_WAYANAD_CHOORAL_05'),
        lat: 11.5312,
        lon: 76.1824,
        radius_m: 60.0,
        member_count: 6,
        declared_people: 15,
        max_status: 2, // Trapped
        needs_mask: 6, // Water + Food
        best_battery: 70,
        priority_score: 0.79,
        flags: ['large_group', 'bridge_washed_away'],
        state: 'new',
        floor_hint: 'School roof',
      },
    ];

    for (const c of clusters) {
      await pgClient.query(
        `
        INSERT INTO clusters (
          id, external_id, incident_id, centroid, radius_m, member_count,
          declared_people, max_status, needs_mask, best_battery, first_seen,
          last_seen, floor_hint, trust_score, priority_score, flags, state
        )
        VALUES (
          $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7,
          $8, $9, $10, $11, now() - interval '30 minutes',
          now(), $12, 0.85, $13, $14, $15
        )
        ON CONFLICT (id) DO UPDATE SET
          priority_score = EXCLUDED.priority_score,
          updated_at = now();
      `,
        [
          c.id,
          c.external_id,
          incidentId,
          c.lon,
          c.lat,
          c.radius_m,
          c.member_count,
          c.declared_people,
          c.max_status,
          c.needs_mask,
          c.best_battery,
          c.floor_hint,
          c.priority_score,
          c.flags,
          c.state,
        ],
      );
    }

    console.log(
      'Seed completed successfully! Inserted agency, users, incident, teams, and 5 tactical clusters.',
    );
  } finally {
    if (shouldClose) {
      await pgClient.end();
    }
  }
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('Seed script encountered an error:', err);
    process.exit(1);
  });
}
