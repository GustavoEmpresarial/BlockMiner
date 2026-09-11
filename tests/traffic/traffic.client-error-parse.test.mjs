import test from "node:test";
import assert from "node:assert/strict";

const { parseClientErrorBody, parseHitBody } = await import(
  "../../server/modules/traffic/traffic.schemas.ts"
);

test("parseClientErrorBody maps runtime → crash and keeps api_failure", () => {
  const crash = parseClientErrorBody({
    category: "runtime",
    message: "boom",
    statusCode: 0,
  });
  assert.equal(crash.category, "crash");
  assert.equal(crash.message, "boom");

  const api = parseClientErrorBody({
    category: "api_failure",
    message: "Site em manutenção. Tente novamente em breve.",
    statusCode: 503,
    code: "SITE_MAINTENANCE",
    operation: "fetch_get",
    requestId: "req-m",
  });
  assert.equal(api.category, "api_failure");
  assert.equal(api.code, "SITE_MAINTENANCE");
  assert.equal(api.statusCode, 503);
  assert.equal(api.operation, "fetch_get");
  assert.equal(api.requestId, "req-m");
});

test("parseClientErrorBody truncates oversized fields", () => {
  const body = parseClientErrorBody({
    message: "m".repeat(2000),
    code: "c".repeat(200),
    stack: "s".repeat(9000),
  });
  assert.equal(body.message.length, 800);
  assert.equal(body.code.length, 64);
  assert.equal(body.stack.length, 4000);
});

test("parseClientErrorBody defaults missing message/category safely", () => {
  const body = parseClientErrorBody({});
  assert.equal(body.message, "");
  assert.equal(body.category, "crash");
  assert.equal(body.statusCode, null);
});

test("parseHitBody defaults path and sanitizes utm", () => {
  const hit = parseHitBody({ utmSource: "  ads  ", path: null });
  assert.equal(hit.path, "/");
  assert.equal(hit.utmSource, "ads");
});
