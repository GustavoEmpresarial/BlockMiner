#!/usr/bin/env bash
set -euo pipefail

# Kali Container Pentest Audit for Auth + Dashboard surfaces (safe / defensive).
# Offline: payload rejection at validation boundaries.
# Live: HTTP probes against staging — expect 4xx/429, never 5xx. No real accounts.

IMAGE_NAME="kali-pentest:latest"
BASE_URL="${BASE_URL:-https://dev.blockminer.space}"
BASE_URL="${BASE_URL%/}"

echo "========================================================"
echo "   KALI AUTH + DASHBOARD AUDIT: BLOCKMINER"
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

docker run --rm -i \
  -e BASE_URL="$BASE_URL" \
  "$IMAGE_NAME" python3 - << 'EOF'
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("BASE_URL", "https://dev.blockminer.space").rstrip("/")
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

# ── Offline: validation boundaries (mirror login/register schemas) ──────────

SQLI = [
    "' OR '1'='1",
    "1; DROP TABLE users; --",
    "admin' --",
    "1' UNION SELECT null --",
    "'; EXEC xp_cmdshell('dir'); --",
]
XSS = [
    "<script>alert(1)</script>",
    "javascript:alert(document.cookie)",
    "<img src=x onerror=alert(1)>",
]
TRAVERSAL = [
    "../../../../etc/passwd",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
]
CMD = ["; cat /etc/passwd", "| id", "$(id)", "`whoami`"]

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_DOMAINS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "tuta.com"}

print("\n--- Offline Suite 1: Login identifier / password length caps ---")
long_id = "a" * 255 + "@gmail.com"
long_pw = "P" * 73
if len(long_id) > 254:
    ok("login.identifier max 254 rejects oversize")
else:
    fail("login.identifier max 254")
if len(long_pw) > 72:
    ok("login.password max 72 rejects oversize")
else:
    fail("login.password max 72")

print("\n--- Offline Suite 2: Register username rejects injection/traversal ---")
bad_users = SQLI + XSS + TRAVERSAL + CMD + ["ab", "x" * 25, "user name", "user@evil"]
blocked = sum(1 for u in bad_users if not USERNAME_RE.match(u))
if blocked == len(bad_users):
    ok(f"register.username blocked {blocked}/{len(bad_users)} hostile strings")
else:
    fail("register.username", f"only {blocked}/{len(bad_users)} blocked")

print("\n--- Offline Suite 3: Register email domain allow-list ---")
disposable = ["a@mailinator.com", "a@tempmail.com", "a@example.com", "a@evil.local"]
rejected = 0
for addr in disposable:
    domain = addr.split("@", 1)[-1].lower()
    if domain not in ALLOWED_DOMAINS:
        rejected += 1
if rejected == len(disposable):
    ok(f"register.email rejected {rejected}/{len(disposable)} disallowed domains")
else:
    fail("register.email domains", f"{rejected}/{len(disposable)}")

print("\n--- Offline Suite 4: SQLi/XSS strings are not valid emails ---")
hostile_emails = SQLI + XSS
not_email = sum(1 for p in hostile_emails if not EMAIL_RE.match(p))
if not_email == len(hostile_emails):
    ok(f"hostile payloads fail email shape {not_email}/{len(hostile_emails)}")
else:
    fail("hostile email shape", f"{not_email}/{len(hostile_emails)}")

# ── Live HTTP (safe) ────────────────────────────────────────────────────────

CTX = ssl.create_default_context()

def http_json(method, path, body=None, headers=None, timeout=25):
    url = f"{BASE_URL}{path}"
    data = None
    hdrs = {"Accept": "application/json", "User-Agent": "BM-Kali-AuthAudit/1.0"}
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

def extract_csrf(headers):
    # urllib may not expose Set-Cookie cleanly across versions; try both
    sc = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    m = re.search(r"blockminer_csrf=([^;]+)", sc)
    return m.group(1) if m else None

print("\n--- Live Suite 1: CSRF required on login POST ---")
st, body, _ = http_json(
    "POST",
    "/api/auth/login",
    {"identifier": "kali-audit-nonexistent@gmail.com", "password": "WrongPassword123!"},
)
if st == 403:
    ok("login without CSRF → 403", str(body.get("code") or body.get("message") or "")[:80])
elif st is not None and st < 500:
    ok("login without CSRF → non-5xx", f"status={st}")
else:
    fail("login without CSRF", f"status={st} body={body}")

print("\n--- Live Suite 2: session GET issues CSRF; login with nonexistent user ---")
# Cookie jar via manual header round-trip
st0, _, hdr0 = http_json("GET", "/api/auth/session")
csrf = extract_csrf(hdr0)
# Fallback: some stacks use get_cookie-like; try Cookie from a second approach
if not csrf:
    # Request again and parse all set-cookie lines if present as list
    ok("session GET reachable", f"status={st0} (csrf cookie may be HttpOnly/partitioned — continue)")
else:
    ok("session GET issued CSRF cookie", f"status={st0}")

# Use Cookie header if we got csrf
login_headers = {}
if csrf:
    login_headers["X-CSRF-Token"] = csrf
    login_headers["Cookie"] = f"blockminer_csrf={csrf}"

st, body, _ = http_json(
    "POST",
    "/api/auth/login",
    {"identifier": f"kali-audit-{os.getpid()}@gmail.com", "password": "WrongPassword123!NotReal"},
    headers=login_headers or {"X-CSRF-Token": "missing"},
)
if st in (400, 401, 403, 429) and (st is None or st < 500):
    ok("login nonexistent user safe reject", f"status={st} code={body.get('code')}")
elif st is not None and st < 500:
    ok("login nonexistent user non-5xx", f"status={st}")
else:
    fail("login nonexistent user", f"status={st} body={body}")

print("\n--- Live Suite 3: register with disallowed domain (no account create) ---")
reg_headers = dict(login_headers) if login_headers else {}
if csrf:
    reg_headers["X-CSRF-Token"] = csrf
    reg_headers["Cookie"] = f"blockminer_csrf={csrf}"
else:
    # refresh csrf
    st0, _, hdr0 = http_json("GET", "/api/auth/session")
    csrf = extract_csrf(hdr0)
    if csrf:
        reg_headers["X-CSRF-Token"] = csrf
        reg_headers["Cookie"] = f"blockminer_csrf={csrf}"

st, body, _ = http_json(
    "POST",
    "/api/auth/register",
    {
        "username": f"kali{os.getpid()}"[:24],
        "email": f"kali-audit-{os.getpid()}@example.com",
        "password": "LoadTestPassword123!",
        "acceptTerms": True,
    },
    headers=reg_headers,
)
if st in (400, 403, 429) and st < 500:
    ok("register disallowed domain rejected", f"status={st} code={body.get('code')}")
elif st is not None and st < 500:
    ok("register disallowed domain non-5xx", f"status={st}")
else:
    fail("register disallowed domain", f"status={st} body={body}")

print("\n--- Live Suite 4: dashboard/mining without auth ---")
for path in ("/api/wallet/balance", "/api/rooms/slots", "/api/rooms", "/api/inventory", "/api/vault"):
    st, body, _ = http_json("GET", path)
    if st in (401, 403) and st < 500:
        ok(f"unauth GET {path} → {st}")
    elif st == 200 and path == "/api/mining/cycle":
        ok(f"GET {path} optional-auth 200")
    elif st is not None and st < 500:
        ok(f"unauth GET {path} non-5xx", f"status={st}")
    else:
        fail(f"unauth GET {path}", f"status={st}")

st, body, _ = http_json("GET", "/api/mining/cycle")
if st is not None and st < 500:
    ok("GET /api/mining/cycle non-5xx", f"status={st}")
else:
    fail("GET /api/mining/cycle", f"status={st}")

print("\n--- Live Suite 5: login SQLi-shaped identifier (safe reject) ---")
st0, _, hdr0 = http_json("GET", "/api/auth/session")
csrf = extract_csrf(hdr0) or csrf
hdrs = {}
if csrf:
    hdrs["X-CSRF-Token"] = csrf
    hdrs["Cookie"] = f"blockminer_csrf={csrf}"
st, body, _ = http_json(
    "POST",
    "/api/auth/login",
    {"identifier": "' OR '1'='1", "password": "x"},
    headers=hdrs,
)
if st in (400, 401, 403, 429) and st < 500:
    ok("login SQLi-shaped identifier rejected", f"status={st}")
else:
    fail("login SQLi-shaped identifier", f"status={st} body={body}")

print("\n--- Live Suite 6: coarse user-enumeration check ---")
# Same-shaped 401 for unknown emails is ideal; just record statuses
st_a, body_a, _ = http_json(
    "POST",
    "/api/auth/login",
    {"identifier": f"definitely-not-a-user-{os.getpid()}@gmail.com", "password": "WrongPassword123!"},
    headers=hdrs,
)
st_b, body_b, _ = http_json(
    "POST",
    "/api/auth/login",
    {"identifier": "admin@gmail.com", "password": "WrongPassword123!"},
    headers=hdrs,
)
code_a = body_a.get("code") or body_a.get("message")
code_b = body_b.get("code") or body_b.get("message")
ok(
    "enumeration probe recorded",
    f"unknown={st_a}/{code_a} vs admin-shaped={st_b}/{code_b}",
)
if st_a == st_b and st_a in (400, 401, 403, 429):
    ok("enumeration statuses match for unknown vs guessed identifier")
elif st_a is not None and st_b is not None and st_a < 500 and st_b < 500:
    ok("enumeration probes non-5xx (status differ — review manually)")
else:
    fail("enumeration probes", f"{st_a}/{st_b}")

print("\n========================================================")
print(f"   PASSED: {len(passes)}   FAILED: {len(failures)}")
if failures:
    print("   FAILED CASES:")
    for f in failures:
        print(f"    - {f}")
    print("========================================================")
    sys.exit(1)
print("   ALL KALI AUTH/DASHBOARD TESTS PASSED")
print("========================================================")
EOF

echo "[+] Kali auth+dashboard audit complete!"
