import test from "node:test";
import assert from "node:assert/strict";

const { isValidSlotIndex, isValidSlotForSize, computeTargetSlots, MAX_SLOT_INDEX } = await import(
  "../../server/modules/machines/machines.types.ts"
);
const { resolveOwnedMachineDisplay, isGenericOwnedMachineLabel } = await import(
  "../../server/modules/machines/ownedMachineDisplay.ts"
);

test("isValidSlotIndex: checks bounds between 0 and MAX_SLOT_INDEX - 1", () => {
  assert.equal(isValidSlotIndex(0), true);
  assert.equal(isValidSlotIndex(MAX_SLOT_INDEX - 1), true);
  assert.equal(isValidSlotIndex(MAX_SLOT_INDEX), false);
  assert.equal(isValidSlotIndex(-1), false);
  assert.equal(isValidSlotIndex(1.5), false);
});

test("isValidSlotForSize: single-slot machines can be placed on any valid index", () => {
  assert.equal(isValidSlotForSize(0, 1), true);
  assert.equal(isValidSlotForSize(1, 1), true);
  assert.equal(isValidSlotForSize(2, 1), true);
  assert.equal(isValidSlotForSize(79, 1), true);
  assert.equal(isValidSlotForSize(80, 1), false);
});

test("isValidSlotForSize: two-slot machines must start on an even slot index", () => {
  assert.equal(isValidSlotForSize(0, 2), true);
  assert.equal(isValidSlotForSize(2, 2), true);
  assert.equal(isValidSlotForSize(1, 2), false);
  assert.equal(isValidSlotForSize(3, 2), false);
  assert.equal(isValidSlotForSize(78, 2), true);
  assert.equal(isValidSlotForSize(79, 2), false);
});

test("computeTargetSlots: generates target slot ranges correctly", () => {
  assert.deepEqual(computeTargetSlots(0, 1), [0]);
  assert.deepEqual(computeTargetSlots(4, 2), [4, 5]);
  assert.deepEqual(computeTargetSlots(10, 3), [10, 11, 12]);
});

test("isGenericOwnedMachineLabel: detects generic placeholders", () => {
  assert.equal(isGenericOwnedMachineLabel("miner"), true);
  assert.equal(isGenericOwnedMachineLabel("Máquina"), true);
  assert.equal(isGenericOwnedMachineLabel("maquina custom"), true);
  assert.equal(isGenericOwnedMachineLabel("unknown miner"), true);
  assert.equal(isGenericOwnedMachineLabel("Antminer S19 Pro"), false);
});

test("resolveOwnedMachineDisplay: ranks catalog name first when minerId is present", () => {
  const result = resolveOwnedMachineDisplay({
    minerId: 10,
    catalogName: "Antminer S19 XP",
    ownedName: "Legacy Name",
    rowName: "Row Name",
    eventName: "Event Special",
  });
  assert.equal(result.minerName, "Antminer S19 XP");
});

test("resolveOwnedMachineDisplay: ranks event name first when minerId is null", () => {
  const result = resolveOwnedMachineDisplay({
    minerId: null,
    catalogName: "Catalog Name",
    ownedName: "Owned Name",
    eventName: "Cyber Genesis 2026",
  });
  assert.equal(result.minerName, "[Event] Cyber Genesis 2026");
});

test("resolveOwnedMachineDisplay: filters out generic names in favor of specific labels", () => {
  const result = resolveOwnedMachineDisplay({
    minerId: 1,
    catalogName: "máquina custom", // generic
    ownedName: "Real GPU Titan",
  });
  assert.equal(result.minerName, "Real GPU Titan");
});
