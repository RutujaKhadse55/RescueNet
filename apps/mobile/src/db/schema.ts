/**
 * RescueNet Mobile Local Database Schema DDL
 * Encrypted with SQLCipher, structured for offline-first mesh sync.
 */

export const CREATE_TABLES_SQL = [
  // 1. Packets Table
  `CREATE TABLE IF NOT EXISTS packets (
    packet_id TEXT PRIMARY KEY,
    raw_bytes TEXT NOT NULL,
    packet_type INTEGER NOT NULL,
    origin_fp TEXT NOT NULL,
    hop_count INTEGER NOT NULL,
    ttl INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    from_neighbor TEXT,
    copies_left INTEGER NOT NULL,
    uplinked_at TEXT,
    delivered_to_count INTEGER NOT NULL DEFAULT 0,
    is_sos INTEGER NOT NULL DEFAULT 0,
    parsed_json TEXT
  );`,

  // 2. Neighbors Table
  `CREATE TABLE IF NOT EXISTS neighbors (
    fp TEXT PRIMARY KEY,
    last_rssi INTEGER NOT NULL,
    last_seen TEXT NOT NULL,
    battery INTEGER NOT NULL,
    role TEXT NOT NULL,
    mac_rotating INTEGER NOT NULL DEFAULT 1
  );`,

  // 3. Clusters Table
  `CREATE TABLE IF NOT EXISTS clusters (
    cluster_id TEXT PRIMARY KEY,
    centroid_lat REAL NOT NULL,
    centroid_lon REAL NOT NULL,
    radius_meters REAL NOT NULL,
    member_count INTEGER NOT NULL,
    priority_score REAL NOT NULL,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 4. Cluster Members Table
  `CREATE TABLE IF NOT EXISTS cluster_members (
    cluster_id TEXT NOT NULL,
    origin_fp TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (cluster_id, origin_fp)
  );`,

  // 5. Chat Messages Table
  `CREATE TABLE IF NOT EXISTS chat_messages (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    sender_fp TEXT NOT NULL,
    recipient_fp TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    ttl INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );`,

  // 6. Conversations Table
  `CREATE TABLE IF NOT EXISTS conversations (
    conversation_id TEXT PRIMARY KEY,
    peer_fp TEXT NOT NULL,
    peer_nickname TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0
  );`,

  // 7. Peers Table
  `CREATE TABLE IF NOT EXISTS peers (
    fp TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    nickname TEXT NOT NULL,
    offers_skills TEXT NOT NULL,
    last_location_lat REAL,
    last_location_lon REAL,
    last_seen TEXT NOT NULL
  );`,

  // 8. Outbox Uplink Table (Internet/Gateway queue)
  `CREATE TABLE IF NOT EXISTS outbox_uplink (
    id TEXT PRIMARY KEY,
    packet_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL
  );`,

  // 9. Outbox SMS Table
  `CREATE TABLE IF NOT EXISTS outbox_sms (
    id TEXT PRIMARY KEY,
    destination_number TEXT NOT NULL,
    encoded_sms TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL
  );`,

  // 10. Settings Table
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 11. Consent Table
  `CREATE TABLE IF NOT EXISTS consent (
    version INTEGER PRIMARY KEY,
    consented_at TEXT NOT NULL,
    json_data TEXT NOT NULL
  );`,

  // 12. Event Log Table
  `CREATE TABLE IF NOT EXISTS event_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );`,
];

export const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_packets_origin ON packets (origin_fp);`,
  `CREATE INDEX IF NOT EXISTS idx_packets_type ON packets (packet_type);`,
  `CREATE INDEX IF NOT EXISTS idx_packets_received_at ON packets (received_at);`,
  `CREATE INDEX IF NOT EXISTS idx_packets_is_sos ON packets (is_sos);`,
  `CREATE INDEX IF NOT EXISTS idx_neighbors_last_seen ON neighbors (last_seen);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages (conversation_id);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_uplink_status ON outbox_uplink (status);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_sms_status ON outbox_sms (status);`,
];
