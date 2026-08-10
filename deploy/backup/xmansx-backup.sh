#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/xmansx/postgresql}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ "$BACKUP_DIR" != /* || "$BACKUP_DIR" == "/" ]]; then
  echo "BACKUP_DIR must be an absolute non-root directory" >&2
  exit 1
fi
if [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION_DAYS < 1 || BACKUP_RETENTION_DAYS > 365 )); then
  echo "BACKUP_RETENTION_DAYS must be an integer from 1 to 365" >&2
  exit 1
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST="$(hostname -s | tr -cd '[:alnum:]._-')"
BASENAME="xmansx_${HOST}_${STAMP}.dump"
mkdir -p -- "$BACKUP_DIR"

TMP_DUMP="$(mktemp --tmpdir="$BACKUP_DIR" ".${BASENAME}.XXXXXX")"
cleanup() { rm -f -- "$TMP_DUMP"; }
trap cleanup EXIT

pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$TMP_DUMP"
pg_restore --list "$TMP_DUMP" >/dev/null
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$BACKUP_DIR/$BASENAME.age" "$TMP_DUMP"
sha256sum "$BACKUP_DIR/$BASENAME.age" >"$BACKUP_DIR/$BASENAME.age.sha256"
chmod 600 "$BACKUP_DIR/$BASENAME.age" "$BACKUP_DIR/$BASENAME.age.sha256"

# لا نحذف إلا ملفات XMANSX المعروفة داخل مجلد النسخ المحدد صراحةً.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'xmansx_*.dump.age' -o -name 'xmansx_*.dump.age.sha256' \) \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Encrypted PostgreSQL backup verified: $BACKUP_DIR/$BASENAME.age"
