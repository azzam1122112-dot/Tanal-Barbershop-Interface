#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY is required}"

# Fail closed: this script never restores over a normal/production database.
RESTORE_DB_NAME="$(printf '%s' "$RESTORE_DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')"
case "$RESTORE_DB_NAME" in
  *_restore_test|*_restore_drill) ;;
  *) echo "Refusing restore: database name must end in _restore_test or _restore_drill" >&2; exit 64 ;;
esac

if ! psql "$RESTORE_DATABASE_URL" -Atqc "SELECT current_database()" | grep -qx "$RESTORE_DB_NAME"; then
  echo "Restore database must already exist and be reachable" >&2
  exit 65
fi
if [ "$(psql "$RESTORE_DATABASE_URL" -Atqc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")" != "0" ]; then
  echo "Refusing restore: target database is not empty" >&2
  exit 66
fi

TMP_DUMP="$(mktemp "${TMPDIR:-/tmp}/xmansx-restore.XXXXXX.dump")"
cleanup() { rm -f -- "$TMP_DUMP"; }
trap cleanup EXIT

age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$TMP_DUMP" "$BACKUP_FILE"
pg_restore --list "$TMP_DUMP" >/dev/null
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$TMP_DUMP"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT 'migrations=' || count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
echo "Restore drill completed without modifying the source database."
