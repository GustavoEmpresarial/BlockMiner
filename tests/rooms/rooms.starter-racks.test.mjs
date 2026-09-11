import test from "node:test";
import assert from "node:assert/strict";

const types = await import("../../server/modules/rooms/rooms.types.ts");

test("starter defaults to 1 visual rack (8 slots)", () => {
  const prev = process.env[types.STARTER_VISUAL_RACKS_ENV_KEY];
  delete process.env[types.STARTER_VISUAL_RACKS_ENV_KEY];
  try {
    assert.equal(types.readStarterVisualRacks(), 1);
    assert.equal(types.starterRackSlotCount(), types.SLOTS_PER_VISUAL_RACK);
    assert.equal(types.starterRackSlotCount(), 8);
  } finally {
    if (prev === undefined) delete process.env[types.STARTER_VISUAL_RACKS_ENV_KEY];
    else process.env[types.STARTER_VISUAL_RACKS_ENV_KEY] = prev;
  }
});

test("STARTER_VISUAL_RACKS env overrides within room capacity", () => {
  const prev = process.env[types.STARTER_VISUAL_RACKS_ENV_KEY];
  process.env[types.STARTER_VISUAL_RACKS_ENV_KEY] = "2";
  try {
    assert.equal(types.readStarterVisualRacks(), 2);
    assert.equal(types.starterRackSlotCount(), 16);
  } finally {
    if (prev === undefined) delete process.env[types.STARTER_VISUAL_RACKS_ENV_KEY];
    else process.env[types.STARTER_VISUAL_RACKS_ENV_KEY] = prev;
  }
});
