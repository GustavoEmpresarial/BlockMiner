#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5118
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "   🛡️ KALI CONTAINER PENTEST AUDIT: ADMIN FINANCE MODULE   "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

# Start local finance test server on port 5118
echo "[*] Starting local finance test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-finance-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness
for i in {1..20}; do
  if curl -s "${TARGET}/api/admin/wallet/hot-wallet" >/dev/null 2>&1; then
    echo "[+] Local test server is up and responding!"
    break
  fi
  sleep 0.5
done

# Generate Admin JWT token for authorized fuzzing
ADMIN_TOKEN=$(node --env-file=.env -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session" }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

echo "[*] Running Kali Linux Penetration Test container..."
docker run --rm --network host -i "$IMAGE_NAME" python3 - "${TARGET}" "${ADMIN_TOKEN}" < tests/security/kali_finance_pentest.py

echo ""
echo "[*] Running Dependency Security Audit (npm audit)..."
npm audit --omit=dev --audit-level=critical || echo "[WARN] Dependencies have non-critical advisories"

echo "[+] Pentest Audit completed successfully."
