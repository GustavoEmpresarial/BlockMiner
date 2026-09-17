#!/usr/bin/env bash
# Deploy BlockMiner to the production (or staging) VM — Git only.
#
# The VM pulls from GitHub (GustavoEmpresarial/BlockMiner) then rebuilds Docker.
# There is no zip / local-tree upload path. Push your branch first, then deploy.
#
# Usage (from current/):
#   git push origin HEAD
#   ./deploy.sh
#   ./deploy.sh --ref main
#   ./deploy.sh --target staging
#   BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 ./deploy.sh --ref main
#
# Credentials: storage/scripts/deploy/vm_config_secret.py (gitignored) or env overrides.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! python3 -c "import paramiko" 2>/dev/null; then
  echo "paramiko missing — install with: python3 -m pip install --user --break-system-packages paramiko" >&2
  exit 1
fi

for arg in "$@"; do
  if [[ "$arg" == "--zip" || "$arg" == -*zip* ]]; then
    echo "error: zip deploy is removed. Push to GitHub, then: ./deploy.sh --ref <branch>" >&2
    exit 2
  fi
done

echo "[local] deploy via git pull on VM (GitHub origin only)"
echo "[local] push first if needed — git push origin HEAD"
exec python3 "$ROOT/storage/scripts/deploy/deploy.py" "$@"
