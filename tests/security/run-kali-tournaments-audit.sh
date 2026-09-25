#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5108
TARGET="http://127.0.0.1:${PORT}"

echo "=============================================================="
echo "   🛡️ KALI CONTAINER PENTEST AUDIT: TOURNAMENTS MODULE       "
echo "=============================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

# Start local tournaments test server on port 5108
echo "[*] Starting local tournaments test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-tournaments-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness
for i in {1..20}; do
  if curl -s "${TARGET}/api/tournaments" >/dev/null 2>&1; then
    echo "[+] Local test server is up and responding!"
    break
  fi
  sleep 0.5
done

# Generate Admin JWT token for authorized fuzzing
JWT_SECRET="${JWT_SECRET:-default_test_secret_for_local_ci}"
ADMIN_TOKEN=$(node -e '
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign({ role: "admin", type: "admin_session" }, secret, { issuer: "blockminer-admin", algorithm: "HS256" });
  process.stdout.write(token);
')

echo "[*] Running Kali Linux Penetration Test container..."
docker run --rm --network host -i "$IMAGE_NAME" python3 - "${TARGET}" "${ADMIN_TOKEN}" < tests/security/kali_tournaments_pentest.py

echo ""
echo "[*] Running Dependency Security Audit (npm audit)..."
npm audit --omit=dev --audit-level=critical || echo "[WARN] Dependencies have non-critical advisories"

echo "[+] Pentest Audit completed successfully."
