#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="kali-pentest:latest"
PORT=5138
TARGET="http://127.0.0.1:${PORT}"

echo "=========================================================="
echo "   🛡️ KALI CONTAINER PENTEST: DASHBOARD FEATURE           "
echo "=========================================================="

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[-] Image $IMAGE_NAME not found locally. Aborting."
  exit 1
fi

echo "[+] Using Kali Linux container: $IMAGE_NAME"

# Clean up port 5138 if in use
fuser -k "${PORT}/tcp" 2>/dev/null || true

echo "[*] Starting local dashboard test server on port ${PORT}..."
PORT=${PORT} npx tsx tests/security/local-dashboard-test-server.mjs &
SERVER_PID=$!

cleanup() {
  echo "[*] Stopping local test server on port ${PORT}..."
  kill "$SERVER_PID" 2>/dev/null || true
  fuser -k "${PORT}/tcp" 2>/dev/null || true
}
trap cleanup EXIT

for i in {1..20}; do
  if curl -s "${TARGET}/api/banners" >/dev/null 2>&1; then
    echo "[+] Local test server is up and responding!"
    break
  fi
  sleep 0.5
done

TOKENS_JSON=$(npx tsx -e '
  import "./tests/_env-test-overrides.mjs";
  import prisma from "./server/core/database/prisma.ts";
  import { signAccessToken } from "./server/shared/security/authTokens.ts";

  async function getTokens() {
    let u1 = await prisma.user.findFirst({ where: { email: "kali_user_a@test.local" } });
    if (!u1) {
      u1 = await prisma.user.create({
        data: {
          name: "Kali User A",
          username: "kali_user_a",
          email: "kali_user_a@test.local",
          passwordHash: "hash",
          polBalance: 50.0,
          blkBalance: 100,
        },
      });
    }

    let u2 = await prisma.user.findFirst({ where: { email: "kali_user_b@test.local" } });
    if (!u2) {
      u2 = await prisma.user.create({
        data: {
          name: "Kali User B",
          username: "kali_user_b",
          email: "kali_user_b@test.local",
          passwordHash: "hash",
          polBalance: 10.0,
          blkBalance: 50,
        },
      });
    }

    const t1 = signAccessToken({ id: u1.id, name: u1.name, email: u1.email });
    const t2 = signAccessToken({ id: u2.id, name: u2.name, email: u2.email });
    console.log(JSON.stringify({ tokenA: t1, tokenB: t2 }));
    process.exit(0);
  }
  getTokens();
')

USER_A_TOKEN=$(echo "$TOKENS_JSON" | grep -o '"tokenA":"[^"]*' | cut -d'"' -f4)
USER_B_TOKEN=$(echo "$TOKENS_JSON" | grep -o '"tokenB":"[^"]*' | cut -d'"' -f4)

echo "[*] Running Kali Linux Penetration Test container..."
docker run --rm --network host -i "$IMAGE_NAME" python3 - "${TARGET}" "${USER_A_TOKEN}" "${USER_B_TOKEN}" < tests/security/kali_dashboard_pentest.py

echo ""
echo "[+] Kali DAST audit finished successfully."
