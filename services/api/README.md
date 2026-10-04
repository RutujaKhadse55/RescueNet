# @rescuenet/api

Fastify backend for RescueNet providing REST endpoints, bi-directional WebSockets for real-time rescuer updates, and PostGIS geospatial storage.

## Database & PostGIS Schema Architecture

RescueNet uses PostgreSQL 16 + PostGIS 3.4 with raw SQL migrations managed via `node-pg-migrate`.

### Key Enums & Types

- `user_role`: `'admin'`, `'dispatcher'`, `'rescuer'`, `'viewer'`
- `incident_status`: `'open'`, `'closed'`
- `cluster_state`: `'new'`, `'assigned'`, `'en_route'`, `'reached'`, `'closed'`, `'false_alarm'`
- `packet_kind`: `'sos'`, `'deadman'`, `'location'`, `'cluster_summary'`, `'chat'`, `'ack'`, `'hello'`
- `ingest_channel`: `'internet'`, `'sms'`, `'gateway'`
- `ack_type`: `'help_on_way'`, `'reached'`, `'need_info'`, `'stay_put'`, `'evacuate'`
- `delivery_state`: `'pending'`, `'seeded_to_gateway'`, `'sent_sms'`, `'delivered_mesh'`, `'failed'`

### Primary Tables

1. **`agencies`**: National/State Disaster Authority root certificate authority issuers (e.g. NDRF).
2. **`users`**: Dispatchers, commanders, and field rescuers.
3. **`incidents`**: Active disaster operational sectors with polygon boundary coverage.
4. **`devices`**: Registered mesh hardware and gateway nodes with rotating pseudonymous keys.
5. **`device_key_pool`**: Ephemeral public key pools for rotating MAC/identity privacy.
6. **`packets`**: Immutable raw binary mesh ingest table with GiST indexing on `geography(Point, 4326)` and unique index on `(origin_fp, seq) WHERE kind = 'sos'` for idempotent deduplication.
7. **`clusters`**: Spatial victim aggregations with GiST indexing on `centroid` and composite triage priority scoring.
8. **`cluster_members`**: Mapping between individual survivor nodes and spatial clusters.
9. **`cluster_events`**: Chronological audit trail of cluster transitions.
10. **`trust_signals`**: Multi-witness sensor validation telemetry.
11. **`teams`**: Field rescue squads (e.g., NDRF boat squads).
12. **`assignments`**: Rescuer dispatch assignments.
13. **`acks`**: Signed rescue confirmation packets broadcast back into the mesh.
14. **`chat_uplinks`**: Encrypted peer message store.
15. **`sms_inbound` / `sms_outbound`**: SMS gateway cellular bridge tables.
16. **`uplink_batches`**: Gateway packet batch statistics.
17. **`audit_log`**: Security and dispatch audit logging.
18. **`sms_gateway_numbers`**: Designated virtual emergency numbers.

### Triggers & Functions

- **`clusters_version_and_updated_at`**: Automatically bumps `clusters.version` and sets `clusters.updated_at = now()` on update.
- **`notify_clusters_event` / `notify_acks_event`**: Fires PostgreSQL `NOTIFY` on channel `rescuenet_events` for real-time WebSocket dashboard broadcasting.
- **`purge_incident(target_incident_id uuid)`**: GDPR/DPDP-compliant privacy retention function that purges packet bodies, cluster member bindings, SMS records, and chat uplinks, while preserving aggregated incident statistics.

## Database Migration & Seed Commands

```bash
# Run migrations forward (up)
pnpm db:migrate

# Rollback last migration (down)
pnpm db:migrate:down

# Seed baseline NDRF agency, users, incident, and synthetic clusters
pnpm db:seed
```
