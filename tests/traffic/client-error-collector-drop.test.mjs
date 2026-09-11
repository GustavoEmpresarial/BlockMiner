import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const collectorPath = path.join(root, "client/dist/assets/client-error-collector-v4.js");

function loadShouldDrop() {
  const code = fs.readFileSync(collectorPath, "utf8");
  const window = {};
  const sandbox = {
    window,
    document: { cookie: "", querySelector: () => null },
    location: { href: "https://blockminer.space/" },
    fetch: () => Promise.resolve({ ok: true }),
    XMLHttpRequest: function XMLHttpRequest() {},
    Date,
    String,
    JSON,
    Object,
    RegExp,
  };
  sandbox.XMLHttpRequest.prototype = { open() {}, send() {} };
  vm.runInNewContext(code, sandbox, { filename: "client-error-collector-v4.js" });
  const shouldDrop = window.__BM_CLIENT_ERROR_COLLECTOR_SHOULD_DROP__;
  assert.equal(typeof shouldDrop, "function");
  assert.equal(typeof window.__BM_REPORT_CLIENT_CRASH__, "function");
  assert.equal(typeof window.__BM_REPORT_API_FAILURE__, "function");
  return shouldDrop;
}

const shouldDrop = loadShouldDrop();

test("collector v4 drops captcha + maintenance gate codes client-side", () => {
  assert.equal(shouldDrop({ code: "CAPTCHA_REQUIRED", message: "x", statusCode: 400 }), true);
  assert.equal(shouldDrop({ code: "SITE_MAINTENANCE", message: "x", statusCode: 503 }), true);
  assert.equal(shouldDrop({ code: "GATE_INACTIVE", message: "x", statusCode: 403 }), true);
  assert.equal(
    shouldDrop({
      message: "Site em manutenção. Tente novamente em breve.",
      statusCode: 503,
    }),
    true,
  );
});

test("collector v4 drops expected UX codes (INVALID_STATE / VPN)", () => {
  assert.equal(
    shouldDrop({
      category: "api_failure",
      message: "Invalid slot",
      statusCode: 400,
      code: "INVALID_STATE",
    }),
    true,
  );
  assert.equal(
    shouldDrop({
      category: "api_failure",
      message: "VPN blocked",
      statusCode: 403,
      code: "VPN_PROXY_BLOCKED",
    }),
    true,
  );
});

test("collector v4 keeps unexpected API failures", () => {
  assert.equal(
    shouldDrop({
      category: "api_failure",
      message: "Internal Server Error",
      statusCode: 500,
      code: null,
    }),
    false,
  );
});

test("collector v4 drops telemetry self-reports by api url", () => {
  assert.equal(
    shouldDrop({
      message: "fail",
      statusCode: 500,
      _apiUrl: "/api/track/client-error",
    }),
    true,
  );
});
