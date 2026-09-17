#!/usr/bin/env bash
set -euo pipefail
# Loads only the k6 keys from .env (never echoes values) and runs offers.k6.js.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    case "$key" in
      LOADTEST_EMAIL|LOADTEST_PASSWORD|LOADTEST_ADMIN_EMAIL|LOADTEST_ADMIN_PASSWORD|LOADTEST_ADMIN_SECURITY_CODE|HTTP_SLOW_REQUEST_MS|BASE_URL)
        val="${line#*=}"
        val="${val%$'\r'}"
        val="${val#\"}"; val="${val%\"}"
        val="${val#\'}"; val="${val%\'}"
        export "$key=$val"
        ;;
    esac
  done < "$ENV_FILE"
fi

export BASE_URL="${BASE_URL:-http://127.0.0.1:5173}"

if [[ -z "${LOADTEST_EMAIL:-}" || -z "${LOADTEST_PASSWORD:-}" ]]; then
  echo "LOADTEST_EMAIL / LOADTEST_PASSWORD missing (env or .env). GET /active needs a player session." >&2
  exit 1
fi

echo "k6 offers load  BASE_URL=$BASE_URL  slow_ms=${HTTP_SLOW_REQUEST_MS:-1000}"
exec k6 run "$ROOT/tests/performance/offers.k6.js"
