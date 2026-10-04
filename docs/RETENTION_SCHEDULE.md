# RescueNet Data Retention & Automated Purge Schedule (Phase 16)

**Policy Objective:** Enforce strict data minimization and regulatory compliance (DPDP Act 2023) by ensuring disaster survivor telemetry is retained only for the duration necessary for active rescue and after-action review.

---

## 1. Data Retention Matrix

| Data Classification | Storage Medium | Active Retention | Post-Incident Retention | Purge Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Emergency SOS Packets** | PostGIS `packets` table | Incident Duration + 7 days | 30 days (Anonymized Coordinates) | Daily cron job (`DELETE WHERE created_at < NOW() - INTERVAL '30 days'`) |
| **Encrypted Chat Uplinks** | PostgreSQL `chat_uplinks` | Incident Duration + 48 hrs | 14 days (Zero names retained) | Automated trigger upon incident state = `CLOSED` |
| **SMS Ingestion Payloads** | PostgreSQL `sms_inbound` | 14 days | 30 days (Phone numbers encrypted) | Truncated via `pgcrypto` column-level drop |
| **Rescuer GPS Breadcrumbs** | PostgreSQL `rescuer_telemetry` | Incident Duration | 7 days (Recon analytics only) | Purged weekly |
| **Audit Logs & Actions** | PostgreSQL `audit_logs` | 180 days | 365 days | Compliance archive; no PII retained |
| **Local Handset SQLite DB**| Client Device SQLCipher | 7 days sliding window | Wiped on incident exit or manual tap | `DatabaseManager.wipeAll()` zeroizes database file |

---

## 2. Automated Retention Cron Implementation

Implemented in [`services/api/src/routes/v1/privacyAndAbuse.ts`](file:///d:/RescueNet/services/api/src/routes/v1/privacyAndAbuse.ts) and executed daily via `infra/scripts/backup_postgres.sh`:

```sql
-- Automated 30-day retention cleanup query
DELETE FROM packets 
WHERE created_at < NOW() - (INTERVAL '1 day' * CAST(COALESCE(NULLIF(current_setting('rescuenet.retention_days', true), ''), '30') AS INTEGER));

-- Anonymize resolved incidents older than 7 days
UPDATE incidents 
SET center_point = ST_Centroid(ST_SnapToGrid(center_point, 0.01))
WHERE status = 'CLOSED' AND updated_at < NOW() - INTERVAL '7 days';
```
