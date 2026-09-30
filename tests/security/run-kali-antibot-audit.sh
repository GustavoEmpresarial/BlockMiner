#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5127
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "    KALI CONTAINER PENTEST AUDIT: ANTIBOT ENGINE MODULE   "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

echo "[*] Cleaning test rate limit state..."
npx tsx -e '
  import prisma from "./server/core/database/prisma.ts";
  prisma.callbackQueue.deleteMany({ where: { callbackType: { in: ["antibot_admin_read", "antibot_admin_write", "antibot_admin_reset"] } } }).then(() => process.exit(0)).catch(() => process.exit(0));
'

# Start local test server on port 5127
echo "[*] Starting local antibot test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-antibot-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness
for i in {1..20}; do
  if curl -s -X POST "${TARGET}/api/antibot/telemetry" -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1; then
    echo "[+] Local test server is up and responding!"
    break
  fi
  sleep 0.5
done

# Generate Admin JWT token (super_admin permissions)
ADMIN_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["*"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

# Generate restricted JWT token (finance only — no antibot permission)
RESTRICTED_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["finance"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

# Generate moderator JWT token (antibot.view only)
MOD_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["antibot.view"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

echo "[*] Executing security test suite inside Kali Linux container..."
docker run --rm \
  --network host \
  -v "$(pwd)/tests/security:/pentest" \
  "$IMAGE_NAME" \
  python3 /pentest/kali_antibot_pentest.py "$TARGET" "$ADMIN_TOKEN" "$RESTRICTED_TOKEN" "$MOD_TOKEN"

echo "[+] Kali Pentest run completed successfully!"
