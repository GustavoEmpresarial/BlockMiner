import test from "node:test";
import assert from "node:assert/strict";

const cycle = await import("../../server/modules/tournaments/tournaments.cycle.ts");

const key = {
  metric: "YOUTUBE",
  type: "DAILY",
  startsAt: new Date("2026-10-10T00:00:00.000Z"),
};

test("createOrReuseOpenCycle returns the row that is already open", async () => {
  let creates = 0;
  const result = await cycle.createOrReuseOpenCycle(
    { findOpen: async () => ({ id: 315, status: "ACTIVE" }) },
    key,
    async () => {
      creates += 1;
      return { id: 999, status: "ACTIVE" };
    },
  );
  assert.equal(creates, 0);
  assert.deepEqual(result, { row: { id: 315, status: "ACTIVE" }, created: false });
});

test("createOrReuseOpenCycle inserts when the window is empty", async () => {
  const result = await cycle.createOrReuseOpenCycle(
    { findOpen: async () => null },
    key,
    async () => ({ id: 315, status: "ACTIVE" }),
  );
  assert.deepEqual(result, { row: { id: 315, status: "ACTIVE" }, created: true });
});

test("createOrReuseOpenCycle reuses the winner after a unique violation", async () => {
  let lookups = 0;
  const db = {
    findOpen: async () => {
      lookups += 1;
      return lookups === 1 ? null : { id: 315, status: "ACTIVE" };
    },
  };
  const result = await cycle.createOrReuseOpenCycle(db, key, async () => {
    const err = new Error("duplicate");
    err.code = "P2002";
    throw err;
  });
  assert.equal(result.created, false);
  assert.equal(result.row.id, 315);
  assert.equal(lookups, 2);
});

test("createOrReuseOpenCycle rethrows a non-unique failure", async () => {
  await assert.rejects(
    () =>
      cycle.createOrReuseOpenCycle(
        { findOpen: async () => null },
        key,
        async () => {
          throw new Error("database unavailable");
        },
      ),
    /database unavailable/,
  );
});
