/** Unit: BLK cycle snapshot concurrency stays inside the DB pool unless explicitly raised. */
import test from "node:test";
import assert from "node:assert/strict";

const { defaultSnapshotConcurrency } = await import("../../server/modules/mining/mining.blk-cycle.ts");

test("defaults to 4 users in flight and clamps bad or huge values", () => {
  const prev = process.env.BLK_CYCLE_SNAPSHOT_CONCURRENCY;
  try {
    delete process.env.BLK_CYCLE_SNAPSHOT_CONCURRENCY;
    assert.equal(defaultSnapshotConcurrency(), 4);
    for (const [v, want] of [["8", 8], ["0", 4], ["-3", 4], ["abc", 4], ["1000", 40], ["1", 1]]) {
      process.env.BLK_CYCLE_SNAPSHOT_CONCURRENCY = v;
      assert.equal(defaultSnapshotConcurrency(), want, `env=${v}`);
    }
  } finally {
    if (prev === undefined) delete process.env.BLK_CYCLE_SNAPSHOT_CONCURRENCY;
    else process.env.BLK_CYCLE_SNAPSHOT_CONCURRENCY = prev;
  }
});
