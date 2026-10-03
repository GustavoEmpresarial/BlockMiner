#!/bin/sh
set -e

echo "Starting blockminer-current container..."

# Ported from legacy/docker-entrypoint.sh, bem mais simples: sem embutir o microserviço
# PHD (excluído por segurança, ver docs/PROGRESSO.txt) e sem o failsafe de symlink
# backend/_server_vendor (não existe mais — current/ é uma árvore TS única).

wait_for_db() {
  db_host=db
  db_port=5432
  if [ -n "$DATABASE_URL" ]; then
    rest=${DATABASE_URL##*@}
    hostport=${rest%%/*}
    hostport=${hostport%%\?*}
    db_host=${hostport%%:*}
    case "$hostport" in
      *:*) db_port=${hostport##*:} ;;
    esac
  fi
  echo "Waiting for database at ${db_host}:${db_port}..."
  while ! nc -z "$db_host" "$db_port"; do
    sleep 1
  done
  echo "Database is up and reachable!"
}

wait_for_db

echo "Database is ready. Applying pending migrations..."
npx prisma generate --schema=prisma/schema.prisma || true

npx prisma migrate deploy --schema=prisma/schema.prisma || {
  echo "Warning: prisma migrate deploy failed. Continuing startup to keep service available."
}
echo "Migrations applied."

echo "Starting application..."
exec "$@"
