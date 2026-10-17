#!/bin/bash
# Nightly scheduler for backup-once.sh.
#
# A sleep loop rather than cron, deliberately. cron inside a container needs a
# daemon as PID 1, does not inherit the environment compose injected (so PGUSER
# and PGPASSWORD are simply absent), and writes to a mail spool nobody reads.
# This loop is the whole scheduler, it logs to stdout where `docker compose logs`
# finds it, and `restart: unless-stopped` is what makes it survive a reboot.
set -euo pipefail

BACKUP_HOUR_UTC=${BACKUP_HOUR_UTC:-23}

echo "[backup] scheduler started; nightly dump at ${BACKUP_HOUR_UTC}:00 UTC"
echo "[backup] retention: ${BACKUP_RETENTION_DAYS:-7} days"

# Wait for the target hour, then run, then wait past the hour so a dump that
# finishes inside the same hour is not immediately repeated.
while true; do
  NOW_HOUR=$(date -u +%H)

  if [ "$((10#$NOW_HOUR))" -eq "$((10#$BACKUP_HOUR_UTC))" ]; then
    # A failed dump must not kill the scheduler — tomorrow's attempt may well
    # succeed, and a container that exited three weeks ago is a worse outcome
    # than one failed backup. The error is loud in the log either way.
    if /scripts/backup-once.sh; then
      echo "[backup] nightly dump complete"
    else
      echo "[backup] NIGHTLY DUMP FAILED — will retry at the next scheduled hour" >&2
    fi

    # Sleep out the rest of the hour.
    sleep 3600
  fi

  # Poll every ten minutes. Cheap, and it means a container started at 22:55
  # still catches the 23:00 window.
  sleep 600
done
