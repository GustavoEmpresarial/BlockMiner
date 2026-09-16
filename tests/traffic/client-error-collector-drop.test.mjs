import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const collectorPath = path.join(root, "client/dist/assets/client-error-collector-v5.js");

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
  vm.runInNewContext(code, sandbox, { filename: "client-error-collector-v5.js" });
  const shouldDrop = window.__BM_CLIENT_ERROR_COLLECTOR_SHOULD_DROP__;
  assert.equal(typeof shouldDrop, "function");
  assert.equal(typeof window.__BM_REPORT_CLIENT_CRASH__, "function");
  assert.equal(typeof window.__BM_REPORT_API_FAILURE__, "function");
  return shouldDrop;
}

const shouldDrop = loadShouldDrop();

test("collector v5 drops captcha + maintenance gate codes client-side", () => {
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

test("collector v5 drops expected UX codes (INVALID_STATE / VPN)", () => {
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

test("collector v5 keeps unexpected API failures", () => {
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

test("collector v5 drops telemetry self-reports by api url", () => {
  assert.equal(
    shouldDrop({
      message: "fail",
      statusCode: 500,
      _apiUrl: "/api/track/client-error",
    }),
    true,
  );
});

test("collector v5 drops third-party browser noise reported as a crash", () => {
  // 8 of the 15 "critical" crashes on 15/09/2026 were this Chrome notification.
  assert.equal(
    shouldDrop({
      category: "crash",
      message: "ResizeObserver loop completed with undelivered notifications.",
    }),
    true,
  );
  assert.equal(
    shouldDrop({ category: "crash", message: "The provider is disconnected from all chains." }),
    true,
  );
  assert.equal(
    shouldDrop({ category: "crash", message: "Uncaught TypeError: Cannot redefine property: message" }),
    true,
  );
});

test("collector v5 drops business codes that flooded the admin panel", () => {
  for (const code of [
    "DAILY_LIMIT",
    "ADJACENT_RACK_OCCUPIED",
    "SESSION_NOT_ACTIVE",
    "USER_ALREADY_EXISTS",
    "BURN_NOT_READY",
    "SHORTLINK_NO_SESSION",
  ]) {
    assert.equal(
      shouldDrop({ category: "api_failure", message: code, statusCode: 400, code }),
      true,
      `expected ${code} to be dropped`,
    );
  }
});

test("collector v5 still keeps a real wallet-page crash", () => {
  assert.equal(
    shouldDrop({
      category: "crash",
      message:
        "'get' on proxy: property 'on' is a read-only and non-configurable data property on the proxy target",
    }),
    false,
  );
});

/** Loads a fresh collector instance with a counting fetch stub. */
function loadWithFetchSpy() {
  const code = fs.readFileSync(collectorPath, "utf8");
  const window = {};
  const posts = [];
  const sandbox = {
    window,
    document: { cookie: "", querySelector: () => null },
    location: { href: "https://blockminer.space/wallet" },
    fetch: (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve({ ok: true });
    },
    XMLHttpRequest: function XMLHttpRequest() {},
    Date,
    String,
    JSON,
    Object,
    RegExp,
  };
  sandbox.XMLHttpRequest.prototype = { open() {}, send() {} };
  vm.runInNewContext(code, sandbox, { filename: "client-error-collector-v5.js" });
  return { window, posts };
}

test("collector v5 reports one failure once, whatever collector saw it (axios vs xhr)", () => {
  const { window, posts } = loadWithFetchSpy();
  const failure = {
    message: "Erro ao obter estatísticas de indicações.",
    statusCode: 500,
    code: null,
    apiUrl: "/api/users/referral-stats",
  };
  window.__BM_REPORT_API_FAILURE__({ ...failure, operation: "axios_get" });
  window.__BM_REPORT_API_FAILURE__({ ...failure, operation: "xhr_get" });
  assert.equal(posts.length, 1, "the same HTTP failure must be stored once, not twice");
  assert.equal(posts[0].body.statusCode, 500);
});

test("collector v5 keeps distinct failures apart", () => {
  const { window, posts } = loadWithFetchSpy();
  window.__BM_REPORT_API_FAILURE__({
    operation: "axios_get",
    message: "a",
    statusCode: 500,
    apiUrl: "/api/one",
  });
  window.__BM_REPORT_API_FAILURE__({
    operation: "axios_get",
    message: "b",
    statusCode: 500,
    apiUrl: "/api/two",
  });
  assert.equal(posts.length, 2);
});
