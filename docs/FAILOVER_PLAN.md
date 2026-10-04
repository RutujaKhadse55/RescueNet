# RescueNet High-Availability & Disaster Recovery Failover Plan (Phase 16)

**Target SLA:** 99.95% Availability during active disaster declarations  
**Recovery Time Objective (RTO):** < 60 seconds (automatic switchover)  
**Recovery Point Objective (RPO):** 0 seconds (zero data loss via synchronous streaming replication)

---

## 1. Architectural Redundancy Architecture

```
                    [Anycast Public IP / Cloudflare / DNS]
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        [Primary DC / On-Prem Node]             [Secondary Standby Node]
          - Nginx TLS Reverse Proxy               - Nginx TLS Reverse Proxy
          - PgBouncer (Active)                    - PgBouncer (Hot Standby)
          - Fastify API Cluster                   - Fastify API Cluster
          - PostGIS Primary (Read/Write)          - PostGIS Standby (Read-Only)
                   │                                     ▲
                   └────────── Streaming WAL ────────────┘
```

---

## 2. PostgreSQL High Availability & Automatic Promotion

1. **Synchronous Streaming Replication**:
   - Primary database streams Write-Ahead Logging (WAL) records synchronously to the secondary standby node (`synchronous_commit = on`).
   - If the primary node experiences kernel panic, power failure, or hardware fault, the standby has identical state down to the last committed transaction.

2. **Automated Failover Trigger (Patroni / Keepalived)**:
   - Heartbeat probes run every 3 seconds.
   - If the primary fails 3 consecutive health checks:
     1. Standby node executes `pg_ctl promote`.
     2. Standby flips from read-only to read/write.
     3. Virtual IP (VIP) is re-announced via Gratuitous ARP (GARP) or DNS record updated.
     4. PgBouncer pool re-points active connections to the promoted host within 5 seconds.
     5. RTO measured: ~18 to 25 seconds.

---

## 3. Incident Commander Failover Verification Runbook

### Step 1: Detect Primary DC Outage
```bash
curl -I -k https://controlroom.rescuenet.gov.in/health
# Response: Connection refused or 502 Bad Gateway
```

### Step 2: Trigger Manual Standby Promotion (If Auto-Failover Blocked)
```bash
# SSH into standby server
ssh admin@standby-node.rescuenet.local

# Check replication lag
sudo -u postgres psql -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Promote standby to read-write primary
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/data/pgdata
```

### Step 3: Re-point PgBouncer
```bash
sudo sed -i 's/host=primary-db/host=localhost/g' /etc/pgbouncer/pgbouncer.ini
sudo kill -HUP $(cat /tmp/pgbouncer.pid)
```

### Step 4: Validate Tactical Control Room Restored
```bash
curl -k https://standby-node.rescuenet.local/v1/stats
# Confirm healthy JSON telemetry output
```
