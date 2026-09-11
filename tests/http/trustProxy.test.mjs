import test from "node:test";
import assert from "node:assert/strict";

const { resolveTrustProxy } = await import("../../server/core/http/trustProxy.ts");

test("resolveTrustProxy normalizes env strings (no crash on TRUST_PROXY=true)", () => {
  assert.equal(resolveTrustProxy(""), 1);
  assert.equal(resolveTrustProxy(undefined), 1);
  assert.equal(resolveTrustProxy("true"), true);
  assert.equal(resolveTrustProxy("false"), false);
  assert.equal(resolveTrustProxy("2"), 2);
  assert.equal(resolveTrustProxy("loopback"), "loopback");
});
