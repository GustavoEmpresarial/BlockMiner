#!/usr/bin/env bash
# Deploy BlockMiner to the production VM.
#
# Default: VM pulls from GitHub (GustavoEmpresarial/BlockMiner) then rebuilds Docker.
# Emergency zip path (offline / broken git): ./deploy.sh --zip
#
# Usage (from current/):
#   ./deploy.sh
#   ./deploy.sh --ref main
#   BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 ./deploy.sh
#   ./deploy.sh --zip                 # pack local tree + upload (legacy)
#   ./deploy.sh --host 1.2.3.4 --password '...'
#
# Credentials: scripts/deploy/vm_config_secret.py (gitignored) or VM_IP / VM_PASSWORD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! python3 -c "import paramiko" 2>/dev/null; then
  echo "paramiko missing — install with: python3 -m pip install --user --break-system-packages paramiko" >&2
  exit 1
fi

USE_ZIP=0
FORWARD_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip)
      USE_ZIP=1
      shift
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$USE_ZIP" != "1" ]]; then
  echo "[local] deploy via git pull on VM (GitHub origin)"
  echo "[local] tip: push first — git push origin HEAD"
  exec python3 "$ROOT/scripts/deploy/deploy.py" "${FORWARD_ARGS[@]}"
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required for --zip mode (apt install zip)" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ZIP="/tmp/blockminer-current-deploy-${STAMP}.zip"

echo "[local] packing $ROOT -> $ZIP (emergency zip mode)"
rm -f "$ZIP"

SKIP_CLIENT_BUILD="${SKIP_CLIENT_BUILD:-1}"
BUILD_CLIENT="${BUILD_CLIENT:-0}"
if [[ "$BUILD_CLIENT" == "1" ]]; then
  SKIP_CLIENT_BUILD=0
fi
if [[ "$SKIP_CLIENT_BUILD" != "1" ]]; then
  echo "[local] client Vite build (BUILD_CLIENT=1)"
  (
    cd "$ROOT/client"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    npm run build
  )
else
  echo "[local] SKIP client Vite build (shipping existing client/dist). Set BUILD_CLIENT=1 to rebuild."
fi

SPA_COMPAT_KEEP="${SPA_COMPAT_KEEP:-inv2plus115}"
export SPA_COMPAT_KEEP
COMPAT_DIR="$ROOT/client/spa-compat-115"
if [[ -n "$SPA_COMPAT_KEEP" && -d "$COMPAT_DIR" ]]; then
  echo "[local] merging SPA compat keep=$SPA_COMPAT_KEEP from $COMPAT_DIR"
  mkdir -p "$ROOT/client/dist/assets"
  cp -a "$COMPAT_DIR"/. "$ROOT/client/dist/assets/"
fi

python3 "$ROOT/scripts/verify-spa-dist.py"
python3 "$ROOT/scripts/purge-spa-orphans.py" --apply

zip -q -r "$ZIP" \
  Dockerfile docker-compose.yml docker-entrypoint.sh .dockerignore package.json package-lock.json \
  tsconfig.json prisma.config.js prisma server client nginx scripts tests storage deploy dist \
  -x '*/node_modules/*' \
     'storage/uploads/*' 'storage/backups/*' \
     'scripts/deploy/vm_config_secret.py' \
     '*.log' '.env' '.env.*' \
     '*/.venv*' '*/__pycache__/*' '*.pyc' 'dist/**/*.map' 'client/dist/**/*.map'

if [[ -d "$ROOT/client/dist" ]]; then
  (cd "$ROOT" && zip -q -r "$ZIP" client/dist -x 'client/dist/**/*.map') || true
fi
if [[ -f "$ROOT/prisma/schema.prisma" ]]; then
  (cd "$ROOT" && zip -q "$ZIP" prisma/schema.prisma) || true
fi

BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
echo "[local] zip ready: $ZIP ($BYTES bytes)"
echo "$ZIP" > /tmp/bm_last_deploy_zip.txt

exec python3 "$ROOT/scripts/deploy/deploy.py" --zip "$ZIP" "${FORWARD_ARGS[@]}"
