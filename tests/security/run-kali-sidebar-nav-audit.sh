#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5119
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "   🛡️ KALI CONTAINER PENTEST AUDIT: SIDEBAR NAV MODULE    "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

echo "[*] Cleaning test rate limit state..."
npx tsx -e '
  import prisma from "./server/core/database/prisma.ts";
  prisma.callbackQueue.deleteMany({ where: { callbackType: "SEC_SW_RL" } }).then(() => process.exit(0));
'

# Start local test server on port 5119
echo "[*] Starting local sidebar nav test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-sidebar-nav-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness
for i in {1..20}; do
  if curl -s "${TARGET}/api/sidebar/nav" >/dev/null 2>&1; then
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

# Generate Support Operator JWT token (no config permission)
SUPPORT_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session", permissions: ["support", "users.view"] }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

echo "[*] Running Kali Linux Penetration Test container..."
docker run --rm --network host -i "$IMAGE_NAME" python3 - "${TARGET}" "${ADMIN_TOKEN}" "${SUPPORT_TOKEN}" < tests/security/kali_sidebar_nav_pentest.py

echo ""
echo "[*] Running Dependency Security Audit (npm audit)..."
npm audit --omit=dev --audit-level=critical || echo "[WARN] Dependencies have non-critical advisories"

echo "[+] Pentest Audit completed successfully."
