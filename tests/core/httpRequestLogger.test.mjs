import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_HTTP_SLOW_REQUEST_MS,
  readHttpSlowRequestMs,
  shouldLogHttpRequestAsSlow,
} = await import("../../server/core/http/middleware/httpRequestLogger.ts");

test("readHttpSlowRequestMs uses named product default when env empty/invalid", () => {
  assert.equal(readHttpSlowRequestMs(""), DEFAULT_HTTP_SLOW_REQUEST_MS);
  assert.equal(readHttpSlowRequestMs(null), DEFAULT_HTTP_SLOW_REQUEST_MS);
  assert.equal(readHttpSlowRequestMs("not-a-number"), DEFAULT_HTTP_SLOW_REQUEST_MS);
  assert.equal(readHttpSlowRequestMs("-1"), DEFAULT_HTTP_SLOW_REQUEST_MS);
});

test("readHttpSlowRequestMs accepts env override (no invented magic in callers)", () => {
  assert.equal(readHttpSlowRequestMs("2500"), 2500);
  assert.equal(readHttpSlowRequestMs("0"), 0);
});

test("shouldLogHttpRequestAsSlow uses threshold + 5xx, not hard-coded ms in call sites", () => {
  assert.equal(
    shouldLogHttpRequestAsSlow({ durationMs: 999, statusCode: 200, slowRequestMs: 1000 }),
    false,
  );
  assert.equal(
    shouldLogHttpRequestAsSlow({ durationMs: 1000, statusCode: 200, slowRequestMs: 1000 }),
    true,
  );
  assert.equal(
    shouldLogHttpRequestAsSlow({ durationMs: 10, statusCode: 500, slowRequestMs: 1000 }),
    true,
  );
  assert.equal(
    shouldLogHttpRequestAsSlow({ durationMs: 10, statusCode: 499, slowRequestMs: 50 }),
    false,
  );
});
