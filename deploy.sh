#!/usr/bin/env bash
# Pack current/ and deploy to the production VM over SSH (Paramiko).
#
# Usage (from current/):
#   ./deploy.sh
#   BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 ./deploy.sh
#   ./deploy.sh --host 1.2.3.4 --password '...'
#
# Requires: python3 + paramiko, zip.
# Credentials: scripts/deploy/vm_config_secret.py (gitignored) or VM_IP / VM_PASSWORD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required (apt install zip)" >&2
  exit 1
fi
if ! python3 -c "import paramiko" 2>/dev/null; then
  echo "paramiko missing — install with: python3 -m pip install --user --break-system-packages paramiko" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ZIP="/tmp/blockminer-current-deploy-${STAMP}.zip"

echo "[local] packing $ROOT -> $ZIP"
rm -f "$ZIP"

# Always full-tree zip (never git ls-files — dist/client.dist and untracked files must ship as-is).
echo "[local] full forced zip (no git index)"

# Vite SPA build (hashed assets). Never bump-spa-entry / inv2plus rename.
# SAFETY: default is SKIP rebuild — Vite source still has ComingSoon stubs for
# dashboard/support/games/etc. Set BUILD_CLIENT=1 only when player routes are real.
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

# One-generation cache compat (cached browsers still on index-inv2plus115).
# Clear SPA_COMPAT_KEEP after ~1–2 days and re-purge.
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

# Ensure client contract /api/power-boost is mounted (alias of /api/boosts).
BOOTSTRAP_JS="$ROOT/dist/server/bootstrap/server.js"
if [[ -f "$BOOTSTRAP_JS" ]] && ! grep -q 'api/power-boost' "$BOOTSTRAP_JS"; then
  echo "[local] patching $BOOTSTRAP_JS with /api/power-boost mount"
  python3 - <<'PY'
from pathlib import Path
p = Path("dist/server/bootstrap/server.js")
t = p.read_text()
needle = 'app.use("/api/boosts", boostsRouter);'
if needle in t and "api/power-boost" not in t:
    t = t.replace(
        needle,
        needle
        + "\n    // Client contract (usePowerBoostActive): /api/power-boost/*\n"
        + '    app.use("/api/power-boost", boostsRouter);',
        1,
    )
    p.write_text(t)
    print("patched")
else:
    print("skip", "already" if "api/power-boost" in t else "needle missing")
PY
fi

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
if [[ -f "$ROOT/package-lock.json" ]]; then
  (cd "$ROOT" && zip -q "$ZIP" package-lock.json) || true
fi
if [[ -f "$ROOT/.dockerignore" ]]; then
  (cd "$ROOT" && zip -q "$ZIP" .dockerignore) || true
fi

BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
echo "[local] zip ready: $ZIP ($BYTES bytes)"
echo "$ZIP" > /tmp/bm_last_deploy_zip.txt

# Forward optional CLI args to deploy.py (--host / --password / --user)
exec python3 "$ROOT/scripts/deploy/deploy.py" --zip "$ZIP" "$@"
