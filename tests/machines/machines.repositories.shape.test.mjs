import test from "node:test";
import assert from "node:assert/strict";

// Pure module-shape smoke tests — importable without a live DB (Prisma is lazy at query time).
const machinesRepo = await import("../../server/modules/machines/machines.repository.ts");
const machinesService = await import("../../server/modules/machines/machines.service.ts");

test("machines.repository exports the expected functions", () => {
  for (const fn of [
    "listUserMachines",
    "findMachineById",
    "findFullMinerWithMinerInfo",
    "findOverlappingMachines",
    "updateMachineActiveTx",
    "deleteUserMinerTx",
    "updateMachineSlotIndexTx",
    "findPrevSlotMachineTx",
    "clearRackReferencesTx",
    "ensureOwnedMachineForUserMinerTx",
    "createUserInventoryEntryTx",
    "syncOwnedMachineLocationTx",
    "createInventoryWithOwnedMachineTx",
    "findFullMinerWithMinerInfoTx",
    "findOverlappingMachinesTx",
    "createUserMinerAtSlotTx",
  ]) {
    assert.equal(typeof machinesRepo[fn], "function", `${fn} should be exported`);
  }
});

test("machines.service exports the expected functions", () => {
  for (const fn of [
    "toggleMachineForUser",
    "removeMachineToInventory",
    "moveMachineForUser",
    "listMachinesForUser",
    "findRackMinerForUserTx",
    "releaseRackReferencesTx",
    "ensureOwnedMachineForRackMinerTx",
    "syncOwnedMachineLocationForVaultTx",
    "deleteRackMinerTx",
    "placeIntoRackSlotTx",
  ]) {
    assert.equal(typeof machinesService[fn], "function", `${fn} should be exported`);
  }
});

test("machines/index.ts exposes the rack <-> vault composition surface used by wallet/vault/", async () => {
  const machinesIndex = await import("../../server/modules/machines/index.ts");
  for (const fn of [
    "findRackMinerForUserTx",
    "releaseRackReferencesTx",
    "ensureOwnedMachineForRackMinerTx",
    "syncOwnedMachineLocationForVaultTx",
    "deleteRackMinerTx",
    "placeIntoRackSlotTx",
  ]) {
    assert.equal(typeof machinesIndex[fn], "function", `${fn} should be exported from index.ts`);
  }
});
