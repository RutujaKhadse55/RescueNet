/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Migration 0001: Initial PostGIS schema, tables, indexes, triggers, and retention functions
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = pgm => {
  // 1. Extensions
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  // 2. Custom ENUM Types
  pgm.sql(`
    CREATE TYPE user_role AS ENUM ('admin', 'dispatcher', 'rescuer', 'viewer');
    CREATE TYPE incident_status AS ENUM ('open', 'closed');
    CREATE TYPE cluster_state AS ENUM ('new', 'assigned', 'en_route', 'reached', 'closed', 'false_alarm');
    CREATE TYPE packet_kind AS ENUM ('sos', 'deadman', 'location', 'cluster_summary', 'chat', 'ack', 'hello');
    CREATE TYPE ingest_channel AS ENUM ('internet', 'sms', 'gateway');
    CREATE TYPE ack_type AS ENUM ('help_on_way', 'reached', 'need_info', 'stay_put', 'evacuate');
    CREATE TYPE delivery_state AS ENUM ('pending', 'seeded_to_gateway', 'sent_sms', 'delivered_mesh', 'failed');
  `);

  // 3. Tables
  pgm.sql(`
    CREATE TABLE agencies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      ca_public_key bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES agencies(id),
      email citext UNIQUE NOT NULL,
      password_hash text NOT NULL,
      full_name text NOT NULL,
      role user_role NOT NULL,
      rescuer_pubkey bytea,
      rescuer_credential bytea,
      mfa_secret text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE incidents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES agencies(id),
      name text NOT NULL,
      hazard text NOT NULL,
      status incident_status NOT NULL DEFAULT 'open',
      region geometry(Polygon,4326),
      is_drill boolean NOT NULL DEFAULT false,
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      retention_until timestamptz
    );

    CREATE TABLE devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pubkey bytea UNIQUE NOT NULL,
      fp bytea NOT NULL,
      sms_secret bytea,
      platform text NOT NULL,
      app_version text NOT NULL,
      registered_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz,
      trust_score real NOT NULL DEFAULT 0.5,
      is_gateway boolean NOT NULL DEFAULT false,
      user_id uuid REFERENCES users(id),
      revoked boolean NOT NULL DEFAULT false
    );
    CREATE INDEX devices_fp_idx ON devices(fp);

    CREATE TABLE device_key_pool (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      pubkey bytea UNIQUE NOT NULL,
      fp bytea NOT NULL,
      valid_from timestamptz NOT NULL,
      valid_to timestamptz NOT NULL
    );
    CREATE INDEX device_key_pool_fp_idx ON device_key_pool(fp);

    CREATE TABLE packets (
      packet_id bytea PRIMARY KEY,
      incident_id uuid REFERENCES incidents(id),
      kind packet_kind NOT NULL,
      origin_fp bytea NOT NULL,
      device_id uuid REFERENCES devices(id),
      sent_at timestamptz NOT NULL,
      location geography(Point,4326),
      accuracy_m integer,
      status smallint,
      people smallint,
      needs smallint,
      battery_pct smallint,
      seq integer,
      hop_count smallint,
      signature_valid boolean NOT NULL,
      registered boolean NOT NULL,
      channel ingest_channel NOT NULL,
      uplinked_by uuid REFERENCES devices(id),
      received_at timestamptz NOT NULL DEFAULT now(),
      note text,
      raw bytea NOT NULL
    );
    CREATE INDEX packets_loc_gix ON packets USING gist(location);
    CREATE INDEX packets_origin_idx ON packets(origin_fp, sent_at DESC);
    CREATE INDEX packets_incident_time_idx ON packets(incident_id, sent_at DESC);
    CREATE UNIQUE INDEX packets_origin_seq_uq ON packets(origin_fp, seq) WHERE kind = 'sos';

    CREATE TABLE clusters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id bytea UNIQUE,
      incident_id uuid NOT NULL REFERENCES incidents(id),
      centroid geography(Point,4326) NOT NULL,
      radius_m real NOT NULL,
      member_count integer NOT NULL,
      declared_people integer NOT NULL,
      max_status smallint NOT NULL,
      needs_mask smallint NOT NULL DEFAULT 0,
      best_battery smallint,
      first_seen timestamptz NOT NULL,
      last_seen timestamptz NOT NULL,
      floor_hint text,
      trust_score real NOT NULL DEFAULT 0.5,
      priority_score real NOT NULL DEFAULT 0,
      priority_breakdown jsonb NOT NULL DEFAULT '{}',
      flags text[] NOT NULL DEFAULT '{}',
      state cluster_state NOT NULL DEFAULT 'new',
      merged_into uuid REFERENCES clusters(id),
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX clusters_centroid_gix ON clusters USING gist(centroid);
    CREATE INDEX clusters_rank_idx ON clusters(incident_id, priority_score DESC) WHERE state NOT IN ('closed','false_alarm');

    CREATE TABLE cluster_members (
      cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
      origin_fp bytea NOT NULL,
      latest_packet_id bytea REFERENCES packets(packet_id),
      joined_at timestamptz NOT NULL DEFAULT now(),
      left_at timestamptz,
      PRIMARY KEY (cluster_id, origin_fp)
    );

    CREATE TABLE cluster_events (
      id bigserial PRIMARY KEY,
      cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
      event text NOT NULL,
      actor_user_id uuid REFERENCES users(id),
      data jsonb NOT NULL DEFAULT '{}',
      at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE trust_signals (
      id bigserial PRIMARY KEY,
      cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
      signal text NOT NULL,
      value real NOT NULL,
      weight real NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE teams (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES agencies(id),
      name text NOT NULL,
      lead_user_id uuid REFERENCES users(id),
      last_position geography(Point,4326),
      last_position_at timestamptz
    );

    CREATE TABLE assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cluster_id uuid NOT NULL REFERENCES clusters(id),
      team_id uuid NOT NULL REFERENCES teams(id),
      assigned_by uuid NOT NULL REFERENCES users(id),
      eta_minutes integer,
      status cluster_state NOT NULL DEFAULT 'assigned',
      assigned_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );

    CREATE TABLE acks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cluster_id uuid NOT NULL REFERENCES clusters(id),
      sender_user_id uuid NOT NULL REFERENCES users(id),
      type ack_type NOT NULL,
      message_code smallint,
      eta_minutes integer,
      signature bytea NOT NULL,
      mesh_packet bytea NOT NULL,
      delivery delivery_state NOT NULL DEFAULT 'pending',
      first_delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE chat_uplinks (
      packet_id bytea PRIMARY KEY,
      cluster_id uuid REFERENCES clusters(id) ON DELETE CASCADE,
      origin_fp bytea NOT NULL,
      body_enc bytea NOT NULL,
      sent_at timestamptz NOT NULL
    );

    CREATE TABLE sms_inbound (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_msg_id text UNIQUE NOT NULL,
      from_hash bytea NOT NULL,
      from_enc bytea NOT NULL,
      body text NOT NULL,
      parsed_packet_id bytea REFERENCES packets(packet_id),
      parse_status text NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE sms_outbound (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ack_id uuid REFERENCES acks(id),
      to_enc bytea NOT NULL,
      body text NOT NULL,
      provider_msg_id text,
      state delivery_state NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE uplink_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id uuid REFERENCES devices(id),
      received integer NOT NULL,
      new_count integer NOT NULL,
      duplicate_count integer NOT NULL,
      rejected_count integer NOT NULL,
      oldest_packet_age_s integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_log (
      id bigserial PRIMARY KEY,
      user_id uuid REFERENCES users(id),
      action text NOT NULL,
      object_type text NOT NULL,
      object_id text,
      ip inet,
      details jsonb NOT NULL DEFAULT '{}',
      at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE sms_gateway_numbers (
      id serial PRIMARY KEY,
      agency_id uuid NOT NULL REFERENCES agencies(id),
      e164 text NOT NULL,
      label text,
      priority smallint NOT NULL DEFAULT 1,
      active boolean NOT NULL DEFAULT true
    );
  `);

  // 4. COMMENT ON for every table
  pgm.sql(`
    COMMENT ON TABLE agencies IS 'Disaster response agencies and National/State root certificate authority issuers.';
    COMMENT ON TABLE users IS 'Authorised personnel: dispatchers, incident commanders, tactical rescuers, and administrative auditors.';
    COMMENT ON TABLE incidents IS 'Active or historical disaster operations covering bounded geographic crisis zones.';
    COMMENT ON TABLE devices IS 'Registered and discovered hardware nodes participating in the RescueNet BLE mesh or SMS gateway.';
    COMMENT ON TABLE device_key_pool IS 'Pre-registered rotating Ed25519 ephemeral keys for pseudonymous survivor privacy.';
    COMMENT ON TABLE packets IS 'Immutable, cryptographically verified binary mesh packets ingested via Internet, SMS, or Gateway.';
    COMMENT ON TABLE clusters IS 'DBSCAN spatial clusters aggregating stranded survivors for rescuer prioritization.';
    COMMENT ON TABLE cluster_members IS 'Association between individual survivor nodes and spatial rescue clusters.';
    COMMENT ON TABLE cluster_events IS 'Tactical audit timeline recording state changes, notes, and priority updates on clusters.';
    COMMENT ON TABLE trust_signals IS 'Sensor, multi-witness, and reputation telemetry weighting the authenticity of rescue clusters.';
    COMMENT ON TABLE teams IS 'Deployed search and rescue squads, boat units, NDRF batallions, and medical teams.';
    COMMENT ON TABLE assignments IS 'Dispatch bindings dispatching rescuer teams to high-priority survivor clusters.';
    COMMENT ON TABLE acks IS 'Cryptographically signed official rescue acknowledgments broadcast downstream into the mesh.';
    COMMENT ON TABLE chat_uplinks IS 'Encrypted peer-to-peer survivor message payloads uploaded opportunistically for recordkeeping.';
    COMMENT ON TABLE sms_inbound IS 'Inbound emergency SMS packets received via cellular virtual numbers and webhook gateways.';
    COMMENT ON TABLE sms_outbound IS 'Outbound SMS alerts and acknowledgments dispatched when downlink mesh paths are unavailable.';
    COMMENT ON TABLE uplink_batches IS 'Gateway telemetry tracking ingest volume, duplication ratio, and mesh propagation latency.';
    COMMENT ON TABLE audit_log IS 'Security audit trail logging operator actions, authentication attempts, and data exports.';
    COMMENT ON TABLE sms_gateway_numbers IS 'Inbound virtual long/short codes designated for SMS fallback ingestion.';
  `);

  // 5. Triggers & Functions
  pgm.sql(`
    -- Trigger: clusters.updated_at and version bump
    CREATE OR REPLACE FUNCTION trg_clusters_version_and_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      NEW.version = OLD.version + 1;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER clusters_version_and_updated_at
    BEFORE UPDATE ON clusters
    FOR EACH ROW
    EXECUTE FUNCTION trg_clusters_version_and_updated_at();

    -- Trigger: NOTIFY channel rescuenet_events for live dashboard updates
    CREATE OR REPLACE FUNCTION trg_notify_rescuenet_events()
    RETURNS TRIGGER AS $$
    DECLARE
      payload jsonb;
    BEGIN
      IF TG_TABLE_NAME = 'clusters' THEN
        payload = jsonb_build_object(
          'table', TG_TABLE_NAME,
          'action', TG_OP,
          'id', NEW.id,
          'incident_id', NEW.incident_id,
          'state', NEW.state,
          'priority_score', NEW.priority_score,
          'version', NEW.version,
          'updated_at', NEW.updated_at
        );
      ELSIF TG_TABLE_NAME = 'acks' THEN
        payload = jsonb_build_object(
          'table', TG_TABLE_NAME,
          'action', TG_OP,
          'id', NEW.id,
          'cluster_id', NEW.cluster_id,
          'type', NEW.type,
          'delivery', NEW.delivery,
          'created_at', NEW.created_at
        );
      END IF;

      IF payload IS NOT NULL THEN
        PERFORM pg_notify('rescuenet_events', payload::text);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER notify_clusters_event
    AFTER INSERT OR UPDATE ON clusters
    FOR EACH ROW
    EXECUTE FUNCTION trg_notify_rescuenet_events();

    CREATE TRIGGER notify_acks_event
    AFTER INSERT OR UPDATE ON acks
    FOR EACH ROW
    EXECUTE FUNCTION trg_notify_rescuenet_events();

    -- Retention Function: purge_incident
    CREATE OR REPLACE FUNCTION purge_incident(target_incident_id uuid)
    RETURNS jsonb AS $$
    DECLARE
      deleted_packets integer := 0;
      deleted_members integer := 0;
      deleted_chats integer := 0;
      deleted_sms_in integer := 0;
      deleted_sms_out integer := 0;
      result jsonb;
    BEGIN
      -- 1. Anonymize/Delete chat uplinks for clusters in this incident
      WITH del_chats AS (
        DELETE FROM chat_uplinks cu
        USING clusters c
        WHERE cu.cluster_id = c.id AND c.incident_id = target_incident_id
        RETURNING cu.packet_id
      )
      SELECT count(*) INTO deleted_chats FROM del_chats;

      -- 2. Anonymize/Delete SMS records associated with packets or clusters in this incident
      WITH del_sms_in AS (
        DELETE FROM sms_inbound si
        USING packets p
        WHERE si.parsed_packet_id = p.packet_id AND p.incident_id = target_incident_id
        RETURNING si.id
      )
      SELECT count(*) INTO deleted_sms_in FROM del_sms_in;

      WITH del_sms_out AS (
        DELETE FROM sms_outbound so
        USING acks a, clusters c
        WHERE so.ack_id = a.id AND a.cluster_id = c.id AND c.incident_id = target_incident_id
        RETURNING so.id
      )
      SELECT count(*) INTO deleted_sms_out FROM del_sms_out;

      -- 3. Delete cluster members (PII/fingerprint decoupling)
      WITH del_cm AS (
        DELETE FROM cluster_members cm
        USING clusters c
        WHERE cm.cluster_id = c.id AND c.incident_id = target_incident_id
        RETURNING cm.cluster_id
      )
      SELECT count(*) INTO deleted_members FROM del_cm;

      -- 4. Delete raw packet payloads and records
      WITH del_p AS (
        DELETE FROM packets
        WHERE incident_id = target_incident_id
        RETURNING packet_id
      )
      SELECT count(*) INTO deleted_packets FROM del_p;

      -- 5. Mark incident closed with retention timestamp
      UPDATE incidents
      SET status = 'closed',
          closed_at = COALESCE(closed_at, now()),
          retention_until = now()
      WHERE id = target_incident_id;

      result := jsonb_build_object(
        'incident_id', target_incident_id,
        'deleted_packets', deleted_packets,
        'deleted_cluster_members', deleted_members,
        'deleted_chat_uplinks', deleted_chats,
        'deleted_sms_inbound', deleted_sms_in,
        'deleted_sms_outbound', deleted_sms_out,
        'purged_at', now()
      );

      RETURN result;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = pgm => {
  pgm.sql(`
    -- Drop functions and triggers
    DROP TRIGGER IF EXISTS notify_acks_event ON acks;
    DROP TRIGGER IF EXISTS notify_clusters_event ON clusters;
    DROP TRIGGER IF EXISTS clusters_version_and_updated_at ON clusters;

    DROP FUNCTION IF EXISTS purge_incident(uuid);
    DROP FUNCTION IF EXISTS trg_notify_rescuenet_events();
    DROP FUNCTION IF EXISTS trg_clusters_version_and_updated_at();

    -- Drop tables in reverse order of foreign key dependencies
    DROP TABLE IF EXISTS sms_gateway_numbers CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS uplink_batches CASCADE;
    DROP TABLE IF EXISTS sms_outbound CASCADE;
    DROP TABLE IF EXISTS sms_inbound CASCADE;
    DROP TABLE IF EXISTS chat_uplinks CASCADE;
    DROP TABLE IF EXISTS acks CASCADE;
    DROP TABLE IF EXISTS assignments CASCADE;
    DROP TABLE IF EXISTS teams CASCADE;
    DROP TABLE IF EXISTS trust_signals CASCADE;
    DROP TABLE IF EXISTS cluster_events CASCADE;
    DROP TABLE IF EXISTS cluster_members CASCADE;
    DROP TABLE IF EXISTS clusters CASCADE;
    DROP TABLE IF EXISTS packets CASCADE;
    DROP TABLE IF EXISTS device_key_pool CASCADE;
    DROP TABLE IF EXISTS devices CASCADE;
    DROP TABLE IF EXISTS incidents CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS agencies CASCADE;

    -- Drop enum types
    DROP TYPE IF EXISTS delivery_state;
    DROP TYPE IF EXISTS ack_type;
    DROP TYPE IF EXISTS ingest_channel;
    DROP TYPE IF EXISTS packet_kind;
    DROP TYPE IF EXISTS cluster_state;
    DROP TYPE IF EXISTS incident_status;
    DROP TYPE IF EXISTS user_role;
  `);
};
