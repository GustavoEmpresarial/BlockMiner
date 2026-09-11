import test from "node:test";
import assert from "node:assert/strict";

const machinesErrors = await import("../../server/modules/machines/machines.errors.ts");

test("MachineNotFoundError carries http 404 and the machine-not-found code", () => {
  const err = new machinesErrors.MachineNotFoundError();
  assert.equal(err.http, 404);
  assert.equal(err.code, machinesErrors.MACHINES_ERROR.MACHINE_NOT_FOUND);
  assert.ok(err instanceof Error);
});

test("MachineNotFoundError accepts a custom message (used by removeMachineToInventory)", () => {
  const err = new machinesErrors.MachineNotFoundError("Miner not found.");
  assert.equal(err.message, "Miner not found.");
});

test("InvalidSlotError carries http 400 and the invalid-slot code", () => {
  const err = new machinesErrors.InvalidSlotError();
  assert.equal(err.http, 400);
  assert.equal(err.code, machinesErrors.MACHINES_ERROR.INVALID_SLOT);
});
