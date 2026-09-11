import test from "node:test";
import assert from "node:assert/strict";
import { updateUserAllocation } from "../../server/modules/mining/mining.service.ts";

// These exercise only the validation branches, which return before any DB call — safe to run
// without a live DB fixture and without touching the shared engine singleton's persisted state.

test("updateUserAllocation rejects non-numeric-ish input", async () => {
  const outcome = await updateUserAllocation(1, { not: "a number" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "invalid_type");
});

test("updateUserAllocation rejects NaN-producing strings", async () => {
  const outcome = await updateUserAllocation(1, "not-a-number");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "invalid_number");
});

test("updateUserAllocation rejects out-of-range values", async () => {
  const tooLow = await updateUserAllocation(1, -1);
  assert.equal(tooLow.ok, false);
  assert.equal(tooLow.reason, "out_of_range");

  const tooHigh = await updateUserAllocation(1, 10001);
  assert.equal(tooHigh.ok, false);
  assert.equal(tooHigh.reason, "out_of_range");
});
