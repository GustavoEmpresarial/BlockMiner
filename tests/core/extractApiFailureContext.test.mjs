import test from "node:test";
import assert from "node:assert/strict";

const {
  extractApiFailureContext,
  resolveApiFailureMessage,
} = await import("../../client/src/shared/utils/extractApiFailureContext.ts");

test("extractApiFailureContext lifts axios response fields", () => {
  const ctx = extractApiFailureContext({
    message: "Request failed with status code 400",
    config: { method: "post", url: "/v2/session/start", baseURL: "/api/auto-mining-gpu" },
    response: {
      status: 400,
      headers: { "x-request-id": "req-1" },
      data: { ok: false, code: "CAPTCHA_REQUIRED", message: "Human verification is required before continuing." },
    },
  });
  assert.equal(ctx.method, "POST");
  assert.equal(ctx.apiUrl, "/api/auto-mining-gpu/v2/session/start");
  assert.equal(ctx.statusCode, 400);
  assert.equal(ctx.code, "CAPTCHA_REQUIRED");
  assert.match(ctx.responseMessage ?? "", /Human verification/);
  assert.equal(ctx.requestId, "req-1");
  assert.ok((ctx.bodySnippet ?? "").includes("CAPTCHA_REQUIRED"));
});

test("resolveApiFailureMessage prefers business message over axios generic", () => {
  assert.equal(
    resolveApiFailureMessage("Request failed with status code 400", {
      responseMessage: "Human verification is required before continuing.",
      code: "CAPTCHA_REQUIRED",
    }),
    "Human verification is required before continuing.",
  );
  assert.equal(
    resolveApiFailureMessage("Request failed with status code 400", { code: "CAPTCHA_REQUIRED" }),
    "CAPTCHA_REQUIRED",
  );
  assert.equal(
    resolveApiFailureMessage("claim_failed", { code: "WRONG_MODE" }),
    "claim_failed",
  );
});

test("extractApiFailureContext returns empty object for non-objects", () => {
  assert.deepEqual(extractApiFailureContext(null), {});
  assert.deepEqual(extractApiFailureContext("boom"), {});
});

test("extractApiFailureContext lifts SITE_MAINTENANCE 503 JSON body", () => {
  const ctx = extractApiFailureContext({
    message: "Request failed with status code 503",
    config: { method: "get", url: "/status", baseURL: "/api/faucet" },
    response: {
      status: 503,
      headers: { "x-request-id": "maint-1" },
      data: {
        ok: false,
        code: "SITE_MAINTENANCE",
        message: "Site em manutenção. Tente novamente em breve.",
      },
    },
  });
  assert.equal(ctx.statusCode, 503);
  assert.equal(ctx.code, "SITE_MAINTENANCE");
  assert.equal(ctx.apiUrl, "/api/faucet/status");
  assert.match(ctx.responseMessage ?? "", /manuten/i);
});

test("extractApiFailureContext ignores axios ERR_* transport codes as business code", () => {
  const ctx = extractApiFailureContext({
    message: "timeout of 60000ms exceeded",
    code: "ERR_NETWORK",
    config: { method: "post", url: "/claim" },
  });
  assert.equal(ctx.code, undefined);
  assert.equal(ctx.method, "POST");
});

test("extractApiFailureContext truncates large body snippets", () => {
  const big = { ok: false, pad: "x".repeat(800) };
  const ctx = extractApiFailureContext({
    response: { status: 500, data: big },
  });
  assert.ok((ctx.bodySnippet ?? "").endsWith("…"));
  assert.ok((ctx.bodySnippet ?? "").length <= 501);
});

test("resolveApiFailureMessage keeps non-generic fallback when no response message", () => {
  assert.equal(
    resolveApiFailureMessage("claim exploded", { code: "SITE_MAINTENANCE" }),
    "claim exploded",
  );
});
