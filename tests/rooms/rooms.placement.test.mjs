import test from "node:test";
import assert from "node:assert/strict";

const placement = await import("../../server/modules/rooms/rooms.placement.ts");
const schemas = await import("../../server/modules/rooms/rooms.schemas.ts");
const dto = await import("../../server/modules/rooms/rooms.dto.ts");

test("isRackSlotOccupied when miner or blocked spill present", () => {
  assert.equal(placement.isRackSlotOccupied({ userMinerId: null, blockedByMinerId: null }), false);
  assert.equal(placement.isRackSlotOccupied({ userMinerId: 1, blockedByMinerId: null }), true);
  assert.equal(placement.isRackSlotOccupied({ userMinerId: null, blockedByMinerId: 2 }), true);
});

test("rackSlotIndex is stable across room/position", () => {
  assert.equal(placement.rackSlotIndex(1, 0, 192), 1000);
  assert.equal(placement.rackSlotIndex(1, 5, 192), 1005);
  assert.equal(placement.rackSlotIndex(2, 0, 192), 1192);
});

test("isTwoSlotSpillFromPrevious", () => {
  assert.equal(placement.isTwoSlotSpillFromPrevious(1), false);
  assert.equal(placement.isTwoSlotSpillFromPrevious(2), true);
  assert.equal(placement.isTwoSlotSpillFromPrevious(null), false);
});

test("isRowEdgeViolation for 2-slot on last columns", () => {
  assert.equal(placement.isRowEdgeViolation(0, 2, 4), false);
  assert.equal(placement.isRowEdgeViolation(2, 2, 4), false);
  assert.equal(placement.isRowEdgeViolation(3, 2, 4), true);
  assert.equal(placement.isRowEdgeViolation(3, 1, 4), false);
});

test("normalizeRackIds dedupes and filters", () => {
  assert.deepEqual(schemas.normalizeRackIds([1, 1, 2, "3", 0, -1, 1.5]), [1, 2, 3]);
  assert.deepEqual(schemas.normalizeRackIds("nope"), []);
});

test("countRackTotals counts occupied including blocked", () => {
  const rooms = [
    {
      id: 1,
      roomNumber: 1,
      pricePaid: 0,
      unlockedAt: new Date(),
      racks: [
        { id: 1, position: 0, installedAt: null, blockedByMinerId: null, userMinerId: 10, userMiner: null },
        { id: 2, position: 1, installedAt: null, blockedByMinerId: 10, userMinerId: null, userMiner: null },
        { id: 3, position: 2, installedAt: null, blockedByMinerId: null, userMinerId: null, userMiner: null },
      ],
    },
  ];
  assert.deepEqual(dto.countRackTotals(rooms), { totalRacks: 3, occupiedRacks: 2, freeRacks: 1 });
});
