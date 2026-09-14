import test from "node:test";
import assert from "node:assert/strict";

const { isTokenSessionCurrent } = await import("../../server/shared/security/sessionVersion.ts");

test("isTokenSessionCurrent: missing sv is stale (pre-sv access tokens die)", () => {
  assert.equal(isTokenSessionCurrent({ sub: "1" }, 0), false);
  assert.equal(isTokenSessionCurrent({ sub: "1" }, 3), false);
  assert.equal(isTokenSessionCurrent(null, 0), false);
  assert.equal(isTokenSessionCurrent("token-string", 0), false);
});

test("isTokenSessionCurrent: matching sv is current", () => {
  assert.equal(isTokenSessionCurrent({ sub: "1", sv: 0 }, 0), true);
  assert.equal(isTokenSessionCurrent({ sub: "1", sv: 4 }, 4), true);
});

test("isTokenSessionCurrent: mismatched sv is stale", () => {
  assert.equal(isTokenSessionCurrent({ sub: "1", sv: 1 }, 2), false);
  assert.equal(isTokenSessionCurrent({ sub: "1", sv: 5 }, 0), false);
});
