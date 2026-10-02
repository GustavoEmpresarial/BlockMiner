import test from "node:test";
import assert from "node:assert/strict";

const { isDuplicateBlockError } = await import("../../server/modules/mining/mining.config.ts");

test("duplicate block_number is recognized from Prisma meta.target", () => {
  assert.equal(
    isDuplicateBlockError({ code: "P2002", meta: { target: ["block_number"] } }),
    true,
  );
});

test("duplicate block_number is recognized when Prisma only puts the column in the message", () => {
  const error = new Error(
    "\nInvalid `prisma.blockDistribution.create()` invocation:\n\n\nUnique constraint failed on the fields: (`block_number`)",
  );
  assert.equal(isDuplicateBlockError(error), true);
});

test("a unique constraint on another column is not a duplicate block", () => {
  assert.equal(
    isDuplicateBlockError({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`email`)",
      meta: { target: ["email"] },
    }),
    false,
  );
});
