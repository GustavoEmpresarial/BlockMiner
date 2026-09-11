import test from "node:test";
import assert from "node:assert/strict";

const {
  parseLogLevel,
  parseLogLevelThreshold,
  isLogLevelAllowed,
  normalizeLogDetails,
  requestContextFromReq,
  buildLogRecord,
  LOG_LEVEL_WEIGHT,
  DEFAULT_LOG_LEVEL,
} = await import("../../server/core/logger/logger.ts");

test("parseLogLevel falls back to DEFAULT_LOG_LEVEL for garbage", () => {
  assert.equal(parseLogLevel("nope"), DEFAULT_LOG_LEVEL);
  assert.equal(parseLogLevel(null), DEFAULT_LOG_LEVEL);
  assert.equal(parseLogLevel("debug"), "DEBUG");
  assert.equal(parseLogLevel("SECURITY"), "SECURITY");
});

test("SECURITY shares ERROR weight so LOG_LEVEL=error still allows security events", () => {
  assert.equal(LOG_LEVEL_WEIGHT.SECURITY, LOG_LEVEL_WEIGHT.ERROR);
  const errorThreshold = parseLogLevelThreshold("error");
  assert.equal(isLogLevelAllowed("SECURITY", errorThreshold), true);
  assert.equal(isLogLevelAllowed("WARN", errorThreshold), false);
  assert.equal(isLogLevelAllowed("INFO", errorThreshold), false);
});

test("parseLogLevelThreshold respects INFO default and DEBUG widen", () => {
  assert.equal(parseLogLevelThreshold("info"), LOG_LEVEL_WEIGHT.INFO);
  assert.equal(parseLogLevelThreshold("DEBUG"), LOG_LEVEL_WEIGHT.DEBUG);
  assert.equal(isLogLevelAllowed("DEBUG", parseLogLevelThreshold("info")), false);
  assert.equal(isLogLevelAllowed("DEBUG", parseLogLevelThreshold("debug")), true);
});

test("normalizeLogDetails wraps non-objects", () => {
  assert.deepEqual(normalizeLogDetails(null), {});
  assert.deepEqual(normalizeLogDetails("x"), { value: "x" });
  assert.deepEqual(normalizeLogDetails([1]), { value: [1] });
  assert.deepEqual(normalizeLogDetails({ a: 1 }), { a: 1 });
});

test("requestContextFromReq extracts userId, ip, endpoint, requestId", () => {
  const ctx = requestContextFromReq({
    user: { id: 42 },
    ip: "127.0.0.1",
    originalUrl: "/api/ping?x=1",
    url: "/api/ping",
    headers: { "x-request-id": "rid-1" },
  });
  assert.deepEqual(ctx, {
    userId: "42",
    ip: "127.0.0.1",
    endpoint: "/api/ping?x=1",
    requestId: "rid-1",
  });
});

test("buildLogRecord is stable JSON shape with ISO timestamp", () => {
  const now = new Date("2026-08-31T12:00:00.000Z");
  const record = buildLogRecord({
    level: "INFO",
    message: "http_request",
    category: "App:HttpRequest",
    details: { statusCode: 200 },
    now,
  });
  assert.equal(record.level, "info");
  assert.equal(record.message, "http_request");
  assert.equal(record.category, "App:HttpRequest");
  assert.equal(record.timestamp, "2026-08-31T12:00:00.000Z");
  assert.deepEqual(record.details, { statusCode: 200 });
});
