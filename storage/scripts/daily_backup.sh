#!/usr/bin/env bash
# BlockMiner Daily Backup Script
# Cria dump PostgreSQL, comprime, envia para Google Drive e limpa backups antigos.
#
# Instalação do cron (03:00 BRT = 07:00 UTC):
#   crontab -e
#   0 7 * * * /root/blockminer-current/storage/scripts/daily_backup.sh >> /var/log/blockminer-backup.log 2>&1
#
# Execução manual:
#   /root/blockminer-current/storage/scripts/daily_backup.sh

set -euo pipefail

APP_DIR="/root/blockminer-current"
CONTAINER="blockminer-current-app"
LOG_PREFIX="[BACKUP $(date -u +%Y-%m-%dT%H:%M:%SZ)]"
RETENTION_DAYS=7

echo "$LOG_PREFIX === DAILY BACKUP STARTED ==="

# 1. Verifica se o container está rodando
if ! docker inspect --format "{{.State.Status}}" "$CONTAINER" 2>/dev/null | grep -q running; then
  echo "$LOG_PREFIX ERROR: container $CONTAINER not running, aborting"
  exit 1
fi

# 2. Cria backup via serviço do app (pg_dump → .sql no storage/backups/)
echo "$LOG_PREFIX Creating pg_dump backup..."
BACKUP_RESULT=$(docker exec "$CONTAINER" node -e "
import('./dist/server/core/database/prisma.js').then(db =>
  import('./dist/server/modules/admin/admin.backups.service.js').then(async (svc) => {
    const result = await svc.createPostgresSqlBackup({ prisma: db.default });
    console.log(JSON.stringify({ ok: result.ok, filename: result.filename, durationMs: result.durationMs }));
    process.exit(0);
  })
).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
" 2>/dev/null)

echo "$LOG_PREFIX Backup result: $BACKUP_RESULT"
FILENAME=$(echo "$BACKUP_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('filename',''))" 2>/dev/null || true)

if [ -z "$FILENAME" ]; then
  echo "$LOG_PREFIX ERROR: backup failed — no filename returned"
  exit 1
fi

# 3. Comprime .sql → .sql.gz (economiza ~95% de espaço em disco)
echo "$LOG_PREFIX Compressing $FILENAME..."
docker exec "$CONTAINER" sh -c "
  cd /app/storage/backups
  if [ -f '${FILENAME}' ] && [ ! -f '${FILENAME}.gz' ]; then
    gzip -1 '${FILENAME}'
    echo compressed
  else
    echo already_gz_or_not_found
  fi
" 2>/dev/null || true

GZ_FILE="${FILENAME}.gz"
echo "$LOG_PREFIX Compressed: $GZ_FILE"

# 4. Upload para Google Drive (chunked 256 MiB — suporta arquivos > 2 GB)
echo "$LOG_PREFIX Uploading to Google Drive..."
UPLOAD_RESULT=$(docker exec "$CONTAINER" node -e "
import('./dist/server/modules/admin/google-drive.service.js').then(async (gdrive) => {
  const up = await gdrive.uploadBackupPackageToGoogleDrive('${GZ_FILE}');
  console.log(JSON.stringify({ ok: up.ok, fileId: up.sqlUpload.fileId, size: up.sqlUpload.size }));
  process.exit(0);
}).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
" 2>/dev/null)
echo "$LOG_PREFIX Drive upload: $UPLOAD_RESULT"

# 5. Limpa backups antigos — mantém os últimos RETENTION_DAYS dias
echo "$LOG_PREFIX Cleaning backups older than $RETENTION_DAYS days..."
OLD_BACKUPS=$(find "$APP_DIR/storage/backups" -maxdepth 1 \( -name "backup-*.sql" -o -name "backup-*.sql.gz" \) 2>/dev/null | sort | head -n -$RETENTION_DAYS || true)
if [ -n "$OLD_BACKUPS" ]; then
  echo "$OLD_BACKUPS" | xargs -r rm -v
  echo "$LOG_PREFIX Old backups deleted."
else
  echo "$LOG_PREFIX No old backups to delete."
fi

echo "$LOG_PREFIX === DAILY BACKUP DONE ==="
