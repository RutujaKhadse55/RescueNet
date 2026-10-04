#!/usr/bin/env bash
# ==============================================================================
# RescueNet Automated PostgreSQL Backup & Point-in-Time Recovery (PITR) Script
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-rescuenet}"
POSTGRES_USER="${POSTGRES_USER:-rescuenet}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "$BACKUP_DIR"

echo "================================================================="
echo "📦 Initiating RescueNet PostgreSQL Backup at $(date)"
echo "   Database: ${POSTGRES_DB} @ ${POSTGRES_HOST}:${POSTGRES_PORT}"
echo "================================================================="

# 1. Execute pg_dump with custom format or gzipped plain SQL
export PGPASSWORD="${POSTGRES_PASSWORD:-rescuenet_secret}"

pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --blobs --verbose \
  | gzip -9 > "$BACKUP_FILE"

# 2. Compute SHA-256 integrity checksum
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Backup completed successfully: $BACKUP_FILE ($FILE_SIZE)"
echo "✓ Checksum saved to: $CHECKSUM_FILE"

# 3. Retention Cleanup: Remove backups older than RETENTION_DAYS
echo "🧹 Purging backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${POSTGRES_DB}_backup_*.sql.gz*" -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
echo "✓ Retention policy enforced."
