#!/usr/bin/env python3
"""Local checks for the 3D rack sale. Refuses any host that is not localhost."""
import json
import sys
import urllib.error
import urllib.request

TARGET = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000").rstrip("/")
host = TARGET.split("://", 1)[-1].split("/")[0].split(":")[0]
if host not in ("127.0.0.1", "localhost"):
    print(json.dumps({"ok": False, "error": "refusing non-localhost target"}))
    sys.exit(2)

findings = []

def call(method, path, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(TARGET + path, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            raw = res.read().decode("utf-8", "replace")
            return res.status, raw
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")

def record(name, ok, detail, severity="INFO"):
    findings.append({"test": name, "ok": ok, "severity": severity, "detail": detail})

status, body = call("POST", "/api/shop/purchase-rack", {"sku": "showcase_3d_rack", "quantity": 1, "price": 0})
record("shop purchase without session", status in (401, 403), f"status={status}", "HIGH" if status == 200 else "INFO")

status, body = call("POST", "/api/offer-events/purchase-rack", {"sku": "showcase_3d_rack", "quantity": 1, "priceBlk": "0"})
record("offer purchase without session", status in (401, 403), f"status={status}", "HIGH" if status == 200 else "INFO")

status, body = call("POST", "/api/shop/purchase-rack", {"sku": "showcase_3d_rack", "quantity": 1, "blkBalance": 999999})
record("mass assignment without session", status in (401, 403), f"status={status}", "HIGH" if status == 200 else "INFO")

status, body = call("POST", "/api/offer-events/purchase-rack", {"sku": "showcase_3d_rack' OR 1=1", "quantity": 1})
record("sku injection without session", status in (400, 401, 403), f"status={status}", "HIGH" if status == 200 else "INFO")

status, body = call("GET", "/api/shop/miners")
record("shop list without session", status in (401, 403), f"status={status}", "MEDIUM" if status == 200 else "INFO")

failed = [row for row in findings if not row["ok"]]
print(json.dumps({"ok": len(failed) == 0, "findings": findings}, indent=2))
sys.exit(0 if not failed else 1)
