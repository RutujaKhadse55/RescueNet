// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../migrations/1710000000000_initial_schema');

describe('PostgreSQL Migration Schema Unit Verification', () => {
  it('validates up migration exports, SQL generation, and table definitions', () => {
    const executedSql: string[] = [];
    const mockPgm = {
      sql: (statement: string) => {
        executedSql.push(statement);
      },
    };

    migration.up(mockPgm);

    const fullSql = executedSql.join('\n');

    // 1. Extensions
    expect(fullSql).toContain('CREATE EXTENSION IF NOT EXISTS postgis;');
    expect(fullSql).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    expect(fullSql).toContain('CREATE EXTENSION IF NOT EXISTS citext;');
    expect(fullSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    // 2. Custom Enum Types
    const requiredEnums = [
      'user_role',
      'incident_status',
      'cluster_state',
      'packet_kind',
      'ingest_channel',
      'ack_type',
      'delivery_state',
    ];
    for (const e of requiredEnums) {
      expect(fullSql).toContain(`CREATE TYPE ${e} AS ENUM`);
    }

    // 3. Tables
    const requiredTables = [
      'agencies',
      'users',
      'incidents',
      'devices',
      'device_key_pool',
      'packets',
      'clusters',
      'cluster_members',
      'cluster_events',
      'trust_signals',
      'teams',
      'assignments',
      'acks',
      'chat_uplinks',
      'sms_inbound',
      'sms_outbound',
      'uplink_batches',
      'audit_log',
      'sms_gateway_numbers',
    ];
    for (const tbl of requiredTables) {
      expect(fullSql).toContain(`CREATE TABLE ${tbl}`);
      // Comment for every table
      expect(fullSql).toContain(`COMMENT ON TABLE ${tbl} IS`);
    }

    // 4. Indexes
    expect(fullSql).toContain('CREATE INDEX devices_fp_idx ON devices(fp);');
    expect(fullSql).toContain('CREATE INDEX device_key_pool_fp_idx ON device_key_pool(fp);');
    expect(fullSql).toContain('CREATE INDEX packets_loc_gix ON packets USING gist(location);');
    expect(fullSql).toContain(
      'CREATE INDEX packets_origin_idx ON packets(origin_fp, sent_at DESC);',
    );
    expect(fullSql).toContain(
      'CREATE INDEX packets_incident_time_idx ON packets(incident_id, sent_at DESC);',
    );
    expect(fullSql).toContain(
      "CREATE UNIQUE INDEX packets_origin_seq_uq ON packets(origin_fp, seq) WHERE kind = 'sos';",
    );
    expect(fullSql).toContain(
      'CREATE INDEX clusters_centroid_gix ON clusters USING gist(centroid);',
    );
    expect(fullSql).toContain(
      "CREATE INDEX clusters_rank_idx ON clusters(incident_id, priority_score DESC) WHERE state NOT IN ('closed','false_alarm');",
    );

    // 5. Triggers and Retention Function
    expect(fullSql).toContain('CREATE OR REPLACE FUNCTION trg_clusters_version_and_updated_at()');
    expect(fullSql).toContain('CREATE TRIGGER clusters_version_and_updated_at');
    expect(fullSql).toContain('CREATE OR REPLACE FUNCTION trg_notify_rescuenet_events()');
    expect(fullSql).toContain('CREATE TRIGGER notify_clusters_event');
    expect(fullSql).toContain('CREATE TRIGGER notify_acks_event');
    expect(fullSql).toContain('CREATE OR REPLACE FUNCTION purge_incident(');
    expect(fullSql).toContain("PERFORM pg_notify('rescuenet_events', payload::text);");
  });

  it('validates down migration safely drops triggers, functions, tables, and types', () => {
    const executedSql: string[] = [];
    const mockPgm = {
      sql: (statement: string) => {
        executedSql.push(statement);
      },
    };

    migration.down(mockPgm);

    const fullSql = executedSql.join('\n');

    expect(fullSql).toContain('DROP FUNCTION IF EXISTS purge_incident(uuid);');
    expect(fullSql).toContain('DROP FUNCTION IF EXISTS trg_notify_rescuenet_events();');
    expect(fullSql).toContain('DROP FUNCTION IF EXISTS trg_clusters_version_and_updated_at();');
    expect(fullSql).toContain('DROP TABLE IF EXISTS packets CASCADE;');
    expect(fullSql).toContain('DROP TABLE IF EXISTS clusters CASCADE;');
    expect(fullSql).toContain('DROP TABLE IF EXISTS agencies CASCADE;');
    expect(fullSql).toContain('DROP TYPE IF EXISTS user_role;');
    expect(fullSql).toContain('DROP TYPE IF EXISTS delivery_state;');
  });
});
