import test from "node:test";
import assert from "node:assert/strict";

const errors = await import("../../server/modules/internal-offerwall/internal-offerwall.errors.ts");

test("INTERNAL_OFFERWALL_ERROR has the exact legacy-compatible codes callers match on", () => {
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.TASK_NOT_AVAILABLE, "TASK_NOT_AVAILABLE");
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.TASK_LIMIT_REACHED, "TASK_LIMIT_REACHED");
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.PARTNER_NOT_OPENED, "PARTNER_NOT_OPENED");
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.MIN_VIEW_NOT_MET, "MIN_VIEW_NOT_MET");
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.CONFLICT, "CONFLICT");
  assert.equal(errors.INTERNAL_OFFERWALL_ERROR.REWARD_CONFIG_INVALID, "REWARD_CONFIG_INVALID");
});

test("InternalOfferwallRewardConfigError / InternalOfferwallConflictError are real Error subclasses", () => {
  const rewardErr = new errors.InternalOfferwallRewardConfigError("REWARD_BLK_INVALID");
  assert.ok(rewardErr instanceof Error);
  assert.equal(rewardErr.name, "InternalOfferwallRewardConfigError");

  const conflictErr = new errors.InternalOfferwallConflictError();
  assert.ok(conflictErr instanceof Error);
  assert.equal(conflictErr.name, "InternalOfferwallConflictError");
  assert.equal(conflictErr.message, "Attempt was already updated.");
});
