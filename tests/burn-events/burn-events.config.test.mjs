import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_BURN_PROCESS_DURATION_SECONDS,
  readBurnProcessDurationSeconds,
} = await import("../../server/modules/burn-events/burn-events.config.ts");

test("readBurnProcessDurationSeconds uses named 15-min product default", () => {
  assert.equal(DEFAULT_BURN_PROCESS_DURATION_SECONDS, 15 * 60);
  assert.equal(readBurnProcessDurationSeconds(""), DEFAULT_BURN_PROCESS_DURATION_SECONDS);
  assert.equal(readBurnProcessDurationSeconds(null), DEFAULT_BURN_PROCESS_DURATION_SECONDS);
  assert.equal(readBurnProcessDurationSeconds("nope"), DEFAULT_BURN_PROCESS_DURATION_SECONDS);
});

test("readBurnProcessDurationSeconds accepts env override", () => {
  assert.equal(readBurnProcessDurationSeconds("0"), 0);
  assert.equal(readBurnProcessDurationSeconds("900"), 900);
  assert.equal(readBurnProcessDurationSeconds("120"), 120);
});
