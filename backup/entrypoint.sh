#!/bin/bash
set -euo pipefail

CRONTAB=/tmp/crontab
LOGFILE=/backups/backup.log

mkdir -p /backups/postgres

# Build crontab from env vars — supercronic passes the full env to each job
cat > "$CRONTAB" <<EOF
${BACKUP_SCHEDULE:-0 3 * * *} /scripts/backup-pg.sh
EOF

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] finPal backup service starting" | tee -a "$LOGFILE"
echo "  Postgres schedule : ${BACKUP_SCHEDULE:-0 3 * * *}"        | tee -a "$LOGFILE"
echo "  Retention         : ${BACKUP_RETENTION_DAYS:-14} days"     | tee -a "$LOGFILE"
if [ -n "${BACKUP_REMOTE_BUCKET:-}" ]; then
  echo "  Remote            : ${RCLONE_CONFIG_REMOTE_TYPE:-?} → ${BACKUP_REMOTE_BUCKET}" | tee -a "$LOGFILE"
else
  echo "  Remote            : disabled (set BACKUP_REMOTE_BUCKET to enable)" | tee -a "$LOGFILE"
fi

exec supercronic "$CRONTAB"
