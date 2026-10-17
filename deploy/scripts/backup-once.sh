#!/bin/bash
# One database backup, and the retention sweep that goes with it.
#
# Run on demand:
#   docker compose -f docker-compose.prod.yml exec backup /scripts/backup-once.sh
#
# Uses pg_dump's CUSTOM format (-Fc), not plain SQL. Three reasons that matter
# when the backup is actually needed: it is compressed on the way out, pg_restore
# can list its contents without restoring anything (which is how you check a file
# is intact), and it can restore a single table instead of all-or-nothing.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/packvio-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date -u +%FT%TZ) dumping ${PGDATABASE} from ${PGHOST} -> ${TARGET}"

# Written to .partial first and renamed only on success. A dump interrupted
# halfway — the container stopped, the disk filled — would otherwise leave a
# truncated file with a normal name, which looks like a backup until the day
# someone tries to restore it.
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
        --file="${TARGET}.partial"
mv "${TARGET}.partial" "$TARGET"

SIZE=$(du -h "$TARGET" | cut -f1)
echo "[backup] wrote ${TARGET} (${SIZE})"

# Verify before pruning, never after. pg_restore --list reads the archive's
# table of contents and fails on a corrupt or truncated file, so this is a real
# integrity check rather than a size comparison — and it runs BEFORE any old
# backup is deleted, so a bad dump can never be the reason the good ones went.
if pg_restore --list "$TARGET" > /dev/null 2>&1; then
  echo "[backup] verified: archive table of contents is readable"
else
  echo "[backup] FAILED VERIFICATION — keeping all existing backups and exiting non-zero" >&2
  exit 1
fi

echo "[backup] pruning dumps older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name 'packvio-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete

# Leftovers from an interrupted run. Not counted as backups and not worth
# keeping, but worth reporting so a repeatedly failing dump is visible.
find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -type f -mtime +1 -print -delete

echo "[backup] retained:"
ls -lh "$BACKUP_DIR"/packvio-*.dump 2>/dev/null || echo "[backup]   (none)"
