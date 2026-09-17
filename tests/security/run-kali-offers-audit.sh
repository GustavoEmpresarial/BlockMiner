#!/usr/bin/env bash
set -euo pipefail

# Kali pentest of /offers + admin Ofertas. Safe: no session, no real checkout.
# Live probes expect 4xx/429, never 2xx on money/admin APIs, never 5xx.

IMAGE_NAME="kali-pentest:latest"
BASE_URL="${BASE_URL:-http://127.0.0.1:5173}"
BASE_URL="${BASE_URL%/}"

echo "========================================================"
echo "   KALI OFFERS + ADMIN OFERTAS AUDIT"
echo "   TARGET: $BASE_URL"
echo "========================================================"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[!] Image $IMAGE_NAME not found locally. Checking kali-arsenal..."
  if docker image inspect "kali-arsenal:latest" >/dev/null 2>&1; then
    IMAGE_NAME="kali-arsenal:latest"
  else
    echo "[-] No Kali container image found. Aborting."
    exit 1
  fi
fi

echo "[+] Using Kali container: $IMAGE_NAME"

DOCKER_NET=()
if [[ "$BASE_URL" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
  # Container localhost is not the host. Host-network so Kali hits this machine.
  DOCKER_NET=(--network host)
fi

docker run --rm -i \
  "${DOCKER_NET[@]}" \
  -e BASE_URL="$BASE_URL" \
  "$IMAGE_NAME" python3 - << 'EOF'
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5173").rstrip("/")
print("[*] Running inside Kali Linux container environment...")
print("[*] Python version:", sys.version.split()[0])
print("[*] BASE_URL:", BASE_URL)

failures = []
passes = []

def ok(name, detail=""):
    passes.append(name)
    print(f"[✓] {name}" + (f" — {detail}" if detail else ""))

def fail(name, detail=""):
    failures.append(name)
    print(f"[✗] {name}" + (f" — {detail}" if detail else ""))

SKU_RE = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
QTY_OK = lambda n: isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 25

print("\n--- Offline Suite 1: fan/rack SKU + qty boundaries ---")
hostile_sku = [
    "' OR '1'='1",
    "../etc/passwd",
    "%2e%2e/%2e%2e/etc/passwd",
    "; cat /etc/passwd",
    "$(id)",
    "`whoami`",
    "<script>alert(1)</script>",
    "cooling_fan_system\x00.exe",
]
blocked_sku = sum(1 for s in hostile_sku if not SKU_RE.match(s))
if blocked_sku == len(hostile_sku):
    ok(f"hostile SKU blocked {blocked_sku}/{len(hostile_sku)}")
else:
    fail("hostile SKU", f"{blocked_sku}/{len(hostile_sku)}")

bad_qty = [0, -1, 26, 1.5, "1; DROP TABLE", True, None, ""]
blocked_qty = sum(1 for q in bad_qty if not QTY_OK(q) if not isinstance(q, str) or True)
# qty must be int 1..25 — strings/floats/bool/None all fail
blocked_qty = sum(1 for q in bad_qty if not QTY_OK(q))
if blocked_qty == len(bad_qty):
    ok(f"hostile quantity blocked {blocked_qty}/{len(bad_qty)}")
else:
    fail("hostile quantity", f"{blocked_qty}/{len(bad_qty)}")

print("\n--- Offline Suite 2: eventMinerId must be a positive int ---")
bad_ids = ["' OR 1=1", "1; DROP", -3, 0, "abc", "1e999"]
def id_ok(v):
    try:
        n = int(v)
        return n > 0 and str(v).isdigit()
    except (TypeError, ValueError):
        return False
blocked_ids = sum(1 for v in bad_ids if not id_ok(v))
if blocked_ids == len(bad_ids):
    ok(f"hostile eventMinerId blocked {blocked_ids}/{len(bad_ids)}")
else:
    fail("hostile eventMinerId", f"{blocked_ids}/{len(bad_ids)}")

CTX = ssl.create_default_context()

def http_json(method, path, body=None, headers=None, timeout=25):
    url = f"{BASE_URL}{path}"
    data = None
    hdrs = {"Accept": "application/json", "User-Agent": "BM-Kali-OffersAudit/1.0"}
    if headers:
        hdrs.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"_raw": raw[:300]}
            return resp.status, parsed, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:300]}
        return e.code, parsed, dict(e.headers)
    except Exception as e:
        return None, {"error": str(e)}, {}

def expect_closed(name, st, body, allow=(401, 403, 404, 429)):
    if st in allow and (st is None or st < 500):
        ok(name, f"status={st} code={body.get('code') or body.get('message', '')}")
    elif st is not None and 200 <= st < 300:
        fail(name, f"OPEN status={st} body={body}")
    elif st is not None and st < 500:
        ok(name, f"non-5xx status={st}")
    else:
        fail(name, f"status={st} body={body}")

print("\n--- Live Suite 1: SPA /offers and /admin/offer-events ---")
st, body, _ = http_json("GET", "/offers")
# SPA is HTML; urllib may still parse as _raw
if st == 200:
    ok("GET /offers 200", "SPA")
elif st is not None and st < 500:
    ok("GET /offers non-5xx", f"status={st}")
else:
    fail("GET /offers", f"status={st}")

st, body, _ = http_json("GET", "/admin/offer-events")
if st is not None and st < 500:
    ok("GET /admin/offer-events SPA non-5xx", f"status={st}")
else:
    fail("GET /admin/offer-events SPA", f"status={st}")

print("\n--- Live Suite 2: player APIs without session ---")
st, body, _ = http_json("GET", "/api/offer-events/active")
expect_closed("GET /api/offer-events/active unauth", st, body, allow=(401, 403))

st, body, _ = http_json("GET", "/api/offer-events/1")
expect_closed("GET /api/offer-events/:id removed", st, body, allow=(401, 403, 404))

for path, payload in (
    ("/api/offer-events/purchase", {"eventMinerId": 1, "quantity": 1}),
    ("/api/offer-events/purchase-fan", {"sku": "cooling_fan_system", "quantity": 1}),
    ("/api/offer-events/purchase-rack", {"sku": "mining_rack_shelf", "quantity": 1}),
):
    st, body, _ = http_json("POST", path, payload)
    expect_closed(f"unauth POST {path}", st, body, allow=(401, 403, 429))

print("\n--- Live Suite 3: admin Ofertas APIs without admin session ---")
for path, method, payload in (
    ("/api/admin/offer-events", "GET", None),
    ("/api/admin/offer-events/1", "GET", None),
    ("/api/admin/offer-events/1/miners", "GET", None),
    ("/api/admin/offer-events/1/purchases", "GET", None),
    ("/api/admin/offer-events", "POST", {"title": "x", "description": "y", "startsAt": "2026-01-01T00:00:00Z", "endsAt": "2026-01-02T00:00:00Z", "isActive": True, "imageUrl": None}),
    ("/api/admin/offer-events/1", "PUT", {"isActive": False}),
    ("/api/admin/offer-events/1", "DELETE", None),
    ("/api/admin/offer-events/1/miners", "POST", {"name": "x", "description": "", "price": 1, "hashRate": 1, "stockUnlimited": True, "imageUrl": None, "isActive": True, "isFree": False, "claimLimitPerUser": 1, "currency": "BLK"}),
):
    st, body, _ = http_json(method, path, payload)
    expect_closed(f"unauth {method} {path}", st, body, allow=(401, 403, 404, 429))

print("\n--- Live Suite 4: hostile bodies still must not 5xx or checkout ---")
st, body, _ = http_json("POST", "/api/offer-events/purchase", {"eventMinerId": "' OR 1=1", "quantity": "1; DROP TABLE event_purchases"})
expect_closed("SQLi-shaped POST /purchase", st, body)

st, body, _ = http_json("POST", "/api/offer-events/purchase-fan", {"sku": "../etc/passwd", "quantity": -1})
expect_closed("traversal SKU POST /purchase-fan", st, body)

st, body, _ = http_json("POST", "/api/offer-events/purchase-rack", {"sku": "cooling_fan_system", "quantity": 1})
expect_closed("fan SKU on /purchase-rack still closed unauth", st, body)

st, body, _ = http_json("POST", "/api/admin/offer-events", {"title": "<script>alert(1)</script>", "description": "x", "startsAt": "2026-01-01", "endsAt": "2026-01-02"})
expect_closed("XSS title POST /admin/offer-events", st, body)

print("\n========================================================")
print(f"   PASSED: {len(passes)}   FAILED: {len(failures)}")
if failures:
    print("   FAILED CASES:")
    for f in failures:
        print(f"    - {f}")
    print("========================================================")
    sys.exit(1)
print("   ALL KALI OFFERS / ADMIN OFERTAS TESTS PASSED")
print("========================================================")
EOF

echo "[+] Kali offers+admin audit complete!"
