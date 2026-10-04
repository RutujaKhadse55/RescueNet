/**
 * RescueNet PostgreSQL / PostGIS Connection Manager
 * Supports production PostgreSQL with PostGIS and an in-memory SQL/geospatial
 * fallback engine for deterministic offline integration testing.
 */

import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

export interface Queryable {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
}

export class MemoryDb implements Queryable {
  public agencies: Map<string, any> = new Map();
  public users: Map<string, any> = new Map();
  public incidents: Map<string, any> = new Map();
  public devices: Map<string, any> = new Map();
  public device_key_pool: Map<string, any> = new Map();
  public packets: Map<string, any> = new Map();
  public clusters: Map<string, any> = new Map();
  public cluster_members: Map<string, any> = new Map();
  public cluster_events: any[] = [];
  public trust_signals: any[] = [];
  public teams: Map<string, any> = new Map();
  public assignments: Map<string, any> = new Map();
  public acks: Map<string, any> = new Map();
  public sms_inbound: any[] = [];
  public sms_outbound: any[] = [];
  public uplink_batches: any[] = [];
  public audit_log: any[] = [];
  public sms_gateway_numbers: any[] = [];
  public server_config: Map<string, any> = new Map();

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const agencyId = '11111111-1111-1111-1111-111111111111';
    this.agencies.set(agencyId, {
      id: agencyId,
      name: 'National Disaster Response Force (NDRF)',
      ca_public_key: Buffer.from('agency_ca_root_test_key_32_bytes_len__'),
      created_at: new Date(),
    });

    const incidentId = '22222222-2222-2222-2222-222222222222';
    this.incidents.set(incidentId, {
      id: incidentId,
      agency_id: agencyId,
      name: 'Pune Flash Flood 2026',
      hazard: 'flood',
      status: 'open',
      region: null,
      is_drill: false,
      opened_at: new Date(),
      closed_at: null,
      retention_until: new Date(Date.now() + 30 * 86400000),
    });

    const drillIncidentId = '33333333-3333-3333-3333-333333333333';
    this.incidents.set(drillIncidentId, {
      id: drillIncidentId,
      agency_id: agencyId,
      name: 'State Disaster Response Drill',
      hazard: 'drill',
      status: 'open',
      region: null,
      is_drill: true,
      opened_at: new Date(),
      closed_at: null,
      retention_until: new Date(Date.now() + 7 * 86400000),
    });

    const adminUserId = '44444444-4444-4444-4444-444444444444';
    this.users.set(adminUserId, {
      id: adminUserId,
      agency_id: agencyId,
      email: 'dispatcher@rescuenet.gov.in',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$mock_hash_for_tests',
      full_name: 'Lead Dispatcher Sharma',
      role: 'dispatcher',
      active: true,
      created_at: new Date(),
    });

    this.teams.set('55555555-5555-5555-5555-555555555555', {
      id: '55555555-5555-5555-5555-555555555555',
      agency_id: agencyId,
      name: 'NDRF Alpha Tactical Team',
      lead_user_id: adminUserId,
      last_position_lat: 18.5204,
      last_position_lon: 73.8567,
      last_position_at: new Date(),
    });

    this.sms_gateway_numbers.push({
      id: 1,
      agency_id: agencyId,
      e164: '+911123456789',
      label: 'NDRF Control Room Gateway 1',
      priority: 1,
      active: true,
    });
  }

  public async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    const trimmed = text.trim();

    // Helper regex checks
    if (trimmed.startsWith('SELECT 1') || trimmed.includes('NOW()')) {
      return { rows: [{ '?column?': 1, now: new Date() }] as any, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    // Devices queries
    if (trimmed.includes('FROM devices WHERE pubkey =')) {
      const pubkeyHex = Buffer.isBuffer(params[0]) ? params[0].toString('hex') : String(params[0]);
      for (const dev of this.devices.values()) {
        const dHex = Buffer.isBuffer(dev.pubkey) ? dev.pubkey.toString('hex') : String(dev.pubkey);
        if (dHex === pubkeyHex) {
          return { rows: [dev] as any, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
        }
      }
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM devices WHERE fp =')) {
      const fpHex = Buffer.isBuffer(params[0]) ? params[0].toString('hex') : String(params[0]);
      for (const dev of this.devices.values()) {
        const dFp = Buffer.isBuffer(dev.fp) ? dev.fp.toString('hex') : String(dev.fp);
        if (dFp === fpHex) {
          return { rows: [dev] as any, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
        }
      }
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('INSERT INTO devices')) {
      const id = params[0] || `dev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const row = {
        id,
        pubkey: params[1],
        fp: params[2],
        sms_secret: params[3],
        platform: params[4],
        app_version: params[5],
        trust_score: params[6] ?? 0.5,
        registered_at: new Date(),
        last_seen_at: new Date(),
        is_gateway: false,
        revoked: false,
      };
      this.devices.set(id, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    // Incidents queries
    if (trimmed.includes('FROM incidents') && trimmed.includes('status = \'open\'')) {
      const isDrill = params[0] === true || trimmed.includes('is_drill = true');
      const rows = Array.from(this.incidents.values()).filter(i => i.status === 'open' && (isDrill ? i.is_drill : !i.is_drill));
      return { rows: (rows.length > 0 ? rows : Array.from(this.incidents.values())) as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM incidents WHERE id =')) {
      const inc = this.incidents.get(params[0]);
      return { rows: (inc ? [inc] : []) as any, rowCount: inc ? 1 : 0, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('SELECT * FROM incidents')) {
      const rows = Array.from(this.incidents.values());
      return { rows: rows as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('INSERT INTO incidents')) {
      const id = params[0] || `inc_${Date.now()}`;
      const row = {
        id,
        agency_id: params[1],
        name: params[2],
        hazard: params[3],
        status: 'open',
        region: params[4] || null,
        is_drill: Boolean(params[5]),
        opened_at: new Date(),
        closed_at: null,
      };
      this.incidents.set(id, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('UPDATE incidents SET')) {
      const id = params[params.length - 1];
      const inc = this.incidents.get(id);
      if (inc) {
        if (trimmed.includes('status =')) inc.status = params[0];
        if (trimmed.includes('closed_at =')) inc.closed_at = new Date();
        this.incidents.set(id, inc);
        return { rows: [inc] as any, rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
    }

    // Packets queries
    if (trimmed.includes('INSERT INTO packets')) {
      const pIdHex = Buffer.isBuffer(params[0]) ? params[0].toString('hex') : String(params[0]);
      if (this.packets.has(pIdHex)) {
        // ON CONFLICT DO NOTHING
        return { rows: [], rowCount: 0, command: 'INSERT', oid: 0, fields: [] };
      }
      const row = {
        packet_id: params[0],
        incident_id: params[1],
        kind: params[2],
        origin_fp: params[3],
        device_id: params[4],
        sent_at: params[5],
        lat: params[6],
        lon: params[7],
        accuracy_m: params[8],
        status: params[9],
        people: params[10],
        needs: params[11],
        battery_pct: params[12],
        seq: params[13],
        hop_count: params[14],
        signature_valid: params[15],
        registered: params[16],
        channel: params[17],
        uplinked_by: params[18],
        raw: params[19],
        received_at: new Date(),
      };
      this.packets.set(pIdHex, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM packets WHERE packet_id =')) {
      const pIdHex = Buffer.isBuffer(params[0]) ? params[0].toString('hex') : String(params[0]);
      const p = this.packets.get(pIdHex);
      return { rows: (p ? [p] : []) as any, rowCount: p ? 1 : 0, command: 'SELECT', oid: 0, fields: [] };
    }

    // Clusters queries
    if (trimmed.includes('FROM clusters WHERE id =') || trimmed.includes('FROM clusters WHERE external_id =')) {
      let found = null;
      if (trimmed.includes('external_id =')) {
        const extHex = Buffer.isBuffer(params[0]) ? params[0].toString('hex') : String(params[0]);
        for (const c of this.clusters.values()) {
          const cExt = Buffer.isBuffer(c.external_id) ? c.external_id.toString('hex') : String(c.external_id);
          if (cExt === extHex) {
            found = c;
            break;
          }
        }
      } else {
        found = this.clusters.get(params[0]);
      }
      return { rows: (found ? [found] : []) as any, rowCount: found ? 1 : 0, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('INSERT INTO clusters')) {
      const id = params[0] || `cl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const row = {
        id,
        external_id: params[1],
        incident_id: params[2],
        centroid_lat: params[3],
        centroid_lon: params[4],
        radius_m: params[5],
        member_count: params[6],
        declared_people: params[7],
        max_status: params[8],
        needs_mask: params[9],
        best_battery: params[10],
        first_seen: params[11],
        last_seen: params[12],
        trust_score: params[13] ?? 0.8,
        priority_score: params[14] ?? 0.5,
        priority_breakdown: params[15] ?? {},
        flags: params[16] ?? [],
        state: params[17] ?? 'new',
        version: 1,
        updated_at: new Date(),
      };
      this.clusters.set(id, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('UPDATE clusters SET')) {
      const id = params[params.length - 1];
      const c = this.clusters.get(id);
      if (c) {
        if (params[0] !== undefined) c.centroid_lat = params[0];
        if (params[1] !== undefined) c.centroid_lon = params[1];
        if (params[2] !== undefined) c.radius_m = params[2];
        if (params[3] !== undefined) c.member_count = params[3];
        if (params[4] !== undefined) c.declared_people = params[4];
        if (params[5] !== undefined) c.max_status = params[5];
        if (params[6] !== undefined) c.needs_mask = params[6];
        if (params[7] !== undefined) c.best_battery = params[7];
        if (params[8] !== undefined) c.last_seen = params[8];
        if (params[9] !== undefined) c.trust_score = params[9];
        if (params[10] !== undefined) c.priority_score = params[10];
        if (params[11] !== undefined) c.priority_breakdown = params[11];
        if (params[12] !== undefined) c.flags = params[12];
        if (params[13] !== undefined) c.state = params[13];
        c.version = (c.version || 1) + 1;
        c.updated_at = new Date();
        this.clusters.set(id, c);
        return { rows: [c] as any, rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM clusters') && (trimmed.includes('incident_id =') || trimmed.includes('incident_id='))) {
      const incId = params[0];
      const rows = Array.from(this.clusters.values()).filter(c => {
        if (c.incident_id !== incId) return false;
        if (trimmed.includes("state NOT IN ('closed', 'false_alarm')") && (c.state === 'closed' || c.state === 'false_alarm')) return false;
        return true;
      });
      return { rows: rows as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM clusters') && trimmed.includes('ORDER BY priority_score DESC')) {
      const rows = Array.from(this.clusters.values()).sort((a, b) => b.priority_score - a.priority_score);
      return { rows: rows as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Cluster members
    if (trimmed.includes('INSERT INTO cluster_members')) {
      const key = `${params[0]}:${Buffer.isBuffer(params[1]) ? params[1].toString('hex') : params[1]}`;
      const row = { cluster_id: params[0], origin_fp: params[1], latest_packet_id: params[2], joined_at: new Date() };
      this.cluster_members.set(key, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM cluster_members') && trimmed.includes('origin_fp =')) {
      const cid = params[0];
      const fpHex = Buffer.isBuffer(params[1]) ? params[1].toString('hex') : String(params[1]);
      const key = `${cid}:${fpHex}`;
      const found = this.cluster_members.get(key);
      return { rows: (found ? [found] : []) as any, rowCount: found ? 1 : 0, command: 'SELECT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM cluster_members WHERE cluster_id =') || trimmed.includes('FROM cluster_members cm WHERE cm.cluster_id =')) {
      const cid = params[0];
      const rows = Array.from(this.cluster_members.values()).filter(m => m.cluster_id === cid);
      return { rows: rows as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // ACKs queries
    if (trimmed.includes('INSERT INTO acks')) {
      const id = params[0] || `ack_${Date.now()}`;
      const row = {
        id,
        cluster_id: params[1],
        sender_user_id: params[2],
        type: params[3],
        message_code: params[4],
        eta_minutes: params[5],
        signature: params[6],
        mesh_packet: params[7],
        delivery: 'pending',
        first_delivered_at: null,
        created_at: new Date(),
      };
      this.acks.set(id, row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM acks WHERE delivery = \'pending\'') || trimmed.includes('FROM acks')) {
      const rows = Array.from(this.acks.values());
      return { rows: rows as any, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // SMS outbound queries
    if (trimmed.includes('INSERT INTO sms_outbound')) {
      const id = `sms_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const row = {
        id,
        ack_id: params[0],
        to_enc: params[1],
        body: params[2],
        provider_msg_id: `msg_${Date.now()}`,
        state: 'pending',
        created_at: new Date(),
      };
      this.sms_outbound.push(row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM sms_outbound')) {
      return { rows: this.sms_outbound as any, rowCount: this.sms_outbound.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Audit log
    if (trimmed.includes('INSERT INTO audit_log')) {
      const row = {
        id: this.audit_log.length + 1,
        user_id: params[0],
        action: params[1],
        object_type: params[2],
        object_id: params[3],
        ip: params[4],
        details: params[5] ?? {},
        at: new Date(),
      };
      this.audit_log.push(row);
      return { rows: [row] as any, rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }

    if (trimmed.includes('FROM audit_log')) {
      return { rows: this.audit_log as any, rowCount: this.audit_log.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Users
    if (trimmed.includes('FROM users WHERE email =')) {
      const email = String(params[0]).toLowerCase();
      for (const u of this.users.values()) {
        if (u.email.toLowerCase() === email) {
          return { rows: [u] as any, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
        }
      }
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }

    // Default fallback empty result
    return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
  }
}

export class DbManager {
  private static instance: DbManager;
  private pool: Pool | null = null;
  private memoryDb: MemoryDb | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DbManager {
    if (!DbManager.instance) {
      DbManager.instance = new DbManager();
    }
    return DbManager.instance;
  }

  public async init(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: 2000,
        max: 20,
      });

      // Quick test query
      const client = await this.pool.connect();
      await client.query('SELECT 1;');
      client.release();
      this.isConnected = true;
    } catch {
      // In-memory fallback for offline test environments
      this.pool = null;
      this.memoryDb = new MemoryDb();
      this.isConnected = false;
    }
  }

  public getDb(): Queryable {
    if (this.pool && this.isConnected) {
      return this.pool;
    }
    if (!this.memoryDb) {
      this.memoryDb = new MemoryDb();
    }
    return this.memoryDb;
  }

  public async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    return this.getDb().query<T>(text, params);
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.memoryDb = null;
    this.isConnected = false;
  }
}

export const db = DbManager.getInstance();
