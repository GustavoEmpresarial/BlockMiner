import test from "node:test";
import assert from "node:assert/strict";

const racksTypes = await import("../../../server/modules/machines/racks/racks.types.ts");

test("isValidRackIndex accepts positive integers only", () => {
  assert.equal(racksTypes.isValidRackIndex(1), true);
  assert.equal(racksTypes.isValidRackIndex(0), false);
  assert.equal(racksTypes.isValidRackIndex(-2), false);
  assert.equal(racksTypes.isValidRackIndex(1.2), false);
  assert.equal(racksTypes.isValidRackIndex("1"), false);
});

test("isValidRackName accepts letters/digits/spaces/hyphens up to 30 chars", () => {
  assert.equal(racksTypes.isValidRackName("Rack A-1"), true);
  assert.equal(racksTypes.isValidRackName("Área 2"), true);
});

test("isValidRackName rejects empty, too-long, or invalid-leading-char names", () => {
  assert.equal(racksTypes.isValidRackName(""), false);
  assert.equal(racksTypes.isValidRackName("   "), false);
  assert.equal(racksTypes.isValidRackName("-leading-dash"), false);
  assert.equal(racksTypes.isValidRackName("a".repeat(31)), false);
  assert.equal(racksTypes.isValidRackName(42), false);
});
