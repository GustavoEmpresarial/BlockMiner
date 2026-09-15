/**
 * Unit: deleteBurnedMachineRowsTx must wipe owned + location rows and
 * fail closed when the owned-machine delete count mismatches.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { deleteBurnedMachineRowsTx } = await import(
  "../../server/modules/burn-events/burn-events.repository.ts"
);
const { BURN_EVENTS_ERROR } = await import("../../server/modules/burn-events/burn-events.errors.ts");

function makeTx(overrides = {}) {
  const calls = [];
  const tx = {
    calls,
    userMiner: {
      findMany: async (...args) => {
        calls.push(["userMiner.findMany", ...args]);
        return overrides.miners ?? [{ id: 9001 }];
      },
      deleteMany: async (...args) => {
        calls.push(["userMiner.deleteMany", ...args]);
        return { count: 1 };
      },
    },
    userRack: {
      updateMany: async (...args) => {
        calls.push(["userRack.updateMany", ...args]);
        return { count: 1 };
      },
    },
    userInventory: {
      deleteMany: async (...args) => {
        calls.push(["userInventory.deleteMany", ...args]);
        return { count: 1 };
      },
    },
    userVault: {
      deleteMany: async (...args) => {
        calls.push(["userVault.deleteMany", ...args]);
        return { count: 1 };
      },
    },
    salaTileMiner: {
      deleteMany: async (...args) => {
        calls.push(["salaTileMiner.deleteMany", ...args]);
        return { count: 0 };
      },
    },
    userOwnedMachine: {
      deleteMany: async (...args) => {
        calls.push(["userOwnedMachine.deleteMany", ...args]);
        return { count: overrides.ownedDeleteCount ?? 2 };
      },
    },
  };
  return tx;
}

test("deleteBurnedMachineRowsTx: clears rack/inventory/vault/sala then owned; returns deleted count", async () => {
  const tx = makeTx({ ownedDeleteCount: 2 });
  const result = await deleteBurnedMachineRowsTx(tx, [10, 11], 7);
  assert.equal(result.deletedOwned, 2);

  const names = tx.calls.map((c) => c[0]);
  assert.ok(names.includes("userMiner.findMany"));
  assert.ok(names.includes("userRack.updateMany"));
  assert.ok(names.includes("userMiner.deleteMany"));
  assert.ok(names.includes("userInventory.deleteMany"));
  assert.ok(names.includes("userVault.deleteMany"));
  assert.ok(names.includes("salaTileMiner.deleteMany"));
  assert.ok(names.includes("userOwnedMachine.deleteMany"));

  const ownedCall = tx.calls.find((c) => c[0] === "userOwnedMachine.deleteMany");
  assert.deepEqual(ownedCall[1], { where: { id: { in: [10, 11] }, userId: 7 } });
});

test("deleteBurnedMachineRowsTx: throws BURN_DESTROY_INCOMPLETE when count mismatches", async () => {
  const tx = makeTx({ ownedDeleteCount: 1 });
  await assert.rejects(
    async () => deleteBurnedMachineRowsTx(tx, [10, 11], 7),
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.BURN_DESTROY_INCOMPLETE);
      return true;
    },
  );
});

test("deleteBurnedMachineRowsTx: no-op on empty id list", async () => {
  const tx = makeTx();
  const result = await deleteBurnedMachineRowsTx(tx, [], 7);
  assert.equal(result.deletedOwned, 0);
  assert.equal(tx.calls.length, 0);
});
