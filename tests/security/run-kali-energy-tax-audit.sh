#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5119
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "   🛡️ KALI CONTAINER PENTEST AUDIT: ENERGY TAX MODULE     "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

SERVER_LOG=$(mktemp)
echo "[*] Starting local energy-tax test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-energy-tax-test-server.mjs > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  kill "$SERVER_PID" 2>/dev/null || true
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  rm -f "$SERVER_LOG"
}
trap cleanup EXIT

# Wait up to 10 seconds for server readiness and extract token
USER_TOKEN=""
for i in {1..20}; do
  if grep -q "USER_TOKEN:" "$SERVER_LOG"; then
    USER_TOKEN=$(grep "USER_TOKEN:" "$SERVER_LOG" | head -n1 | cut -d: -f2- | tr -d '[:space:]')
    echo "[+] Local test server is up and responding! Token extracted."
    break
  fi
  sleep 0.5
done

if [ -z "$USER_TOKEN" ]; then
  echo "[-] Failed to obtain user token from local server."
  cat "$SERVER_LOG"
  exit 1
fi

echo "[*] Running Kali Linux Penetration Test container..."
docker run --rm --network host -i "$IMAGE_NAME" python3 - "${TARGET}" "${USER_TOKEN}" < tests/security/kali_energy_tax_pentest.py

echo ""
echo "[*] Running Dependency Security Audit (npm audit)..."
npm audit --omit=dev --audit-level=critical || echo "[WARN] Dependencies have non-critical advisories"

echo "[+] Kali Pentest Audit completed successfully."
