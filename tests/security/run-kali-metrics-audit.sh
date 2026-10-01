#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5137
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "    KALI CONTAINER PENTEST AUDIT: METRICS & OPS MODULE   "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

# Start local test server on port 5137
echo "[*] Starting local metrics test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-metrics-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness
for i in {1..20}; do
  if curl -s "${TARGET}/api/admin/ops/server-metrics" >/dev/null 2>&1; then
    echo "[+] Local test server is up and responding!"
    break
  fi
  sleep 0.5
done

# Generate Admin JWT token (super_admin wildcard permissions)
ADMIN_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["*"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

# Generate unauthorized JWT token (support only - no monitoring or dashboard)
UNAUTH_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["support"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

# Generate readonly JWT token (dashboard permission)
READONLY_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["dashboard"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

echo "[*] Executing security test suite inside Kali Linux container..."
docker run --rm \
  --network host \
  -v "$(pwd)/tests/security:/pentest" \
  "$IMAGE_NAME" \
  python3 /pentest/kali_metrics_pentest.py "$TARGET" "$ADMIN_TOKEN" "$UNAUTH_TOKEN" "$READONLY_TOKEN"

echo "[+] Kali Pentest run completed successfully!"
