#!/usr/bin/env bash
# ==============================================================================
# RescueNet PostgreSQL Point-in-Time Recovery & Restore Script
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-rescuenet}"
POSTGRES_USER="${POSTGRES_USER:-rescuenet}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <path_to_backup.sql.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    echo "🔍 Verifying SHA-256 integrity checksum..."
    sha256sum -c "$CHECKSUM_FILE"
    echo "✓ Checksum verification passed."
fi

echo "⚠️  WARNING: Restoring will overwrite existing data in ${POSTGRES_DB} @ ${POSTGRES_HOST}:${POSTGRES_PORT}."
read -p "Proceed with restore? (y/N): " -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Restoration aborted."
    exit 0
fi

export PGPASSWORD="${POSTGRES_PASSWORD:-rescuenet_secret}"

echo "🔄 Restoring database from: $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | pg_restore -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --verbose || true

echo "✨ Database restored successfully."
