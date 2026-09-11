import test from "node:test";
import assert from "node:assert/strict";

const errors = await import("../../server/modules/read-earn/read-earn.errors.ts");

test("READ_EARN_REWARD_TYPES lists the exact three reward kinds", () => {
  assert.deepEqual([...errors.READ_EARN_REWARD_TYPES], ["hashrate", "blk", "machine"]);
});

test("REDEEM_GENERIC and REDEEM_ALREADY match the legacy-compatible codes", () => {
  assert.equal(errors.REDEEM_GENERIC, "READ_EARN_UNAVAILABLE");
  assert.equal(errors.REDEEM_ALREADY, "READ_EARN_ALREADY_CLAIMED");
});
