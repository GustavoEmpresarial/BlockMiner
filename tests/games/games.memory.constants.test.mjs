import test from "node:test";
import assert from "node:assert/strict";

const memoryConstants = await import("../../server/modules/games/games.memory.constants.ts");

test("getMemoryMismatchRevealMs clamps to [500, 1500] and defaults to 800", () => {
  delete process.env.MEMORY_MISMATCH_REVEAL_MS;
  assert.equal(memoryConstants.getMemoryMismatchRevealMs(), 800);
  process.env.MEMORY_MISMATCH_REVEAL_MS = "50";
  assert.equal(memoryConstants.getMemoryMismatchRevealMs(), 500);
  process.env.MEMORY_MISMATCH_REVEAL_MS = "9999";
  assert.equal(memoryConstants.getMemoryMismatchRevealMs(), 1500);
  delete process.env.MEMORY_MISMATCH_REVEAL_MS;
});
