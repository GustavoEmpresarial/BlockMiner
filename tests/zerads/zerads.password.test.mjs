import test from "node:test";
import assert from "node:assert/strict";

const { timingSafeEqualStrings } = await import("../../server/modules/zerads/zerads.service.ts");

test("timingSafeEqualStrings returns true for equal strings", () => {
  assert.equal(timingSafeEqualStrings("secret-pwd", "secret-pwd"), true);
});

test("timingSafeEqualStrings returns false for different strings of equal length", () => {
  assert.equal(timingSafeEqualStrings("secret-pwd", "secret-pwx"), false);
});

test("timingSafeEqualStrings returns false for different length strings without throwing", () => {
  assert.doesNotThrow(() => timingSafeEqualStrings("short", "a-much-longer-secret"));
  assert.equal(timingSafeEqualStrings("short", "a-much-longer-secret"), false);
});

test("timingSafeEqualStrings returns false for empty vs non-empty", () => {
  assert.equal(timingSafeEqualStrings("", "secret"), false);
});
