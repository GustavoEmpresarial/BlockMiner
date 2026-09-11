import test from "node:test";
import assert from "node:assert/strict";

const vaultService = await import("../../server/modules/wallet/vault/vault.service.ts");

test("moveToVaultForUser rejects a missing/invalid rack itemId with 400", async () => {
  await assert.rejects(
    () => vaultService.moveToVaultForUser(1, { source: "rack" }),
    (err) => err.http === 400 && err.message === "INVALID_RACK_REF",
  );
  await assert.rejects(
    () => vaultService.moveToVaultForUser(1, { source: "rack", itemId: -1 }),
    (err) => err.http === 400 && err.message === "INVALID_RACK_REF",
  );
});

test("moveToVaultForUser (rack source) surfaces a real 404 for a machine the user does not own", async () => {
  // No fixture for this (userId, itemId) pair — findRackMinerForUserTx hits the real
  // DB and returns null, which the service maps to a real 404, not a fabricated success.
  await assert.rejects(
    () => vaultService.moveToVaultForUser(1, { source: "rack", itemId: 999999999 }),
    (err) => err.http === 404 && err.message === "NOT_FOUND",
  );
});

test("retrieveFromVaultForUser rejects a missing/invalid vaultId for destination=rack", async () => {
  await assert.rejects(
    () => vaultService.retrieveFromVaultForUser(1, { destination: "rack", slotIndex: 0 }),
    (err) => err.http === 400 && err.message === "INVALID_VAULT_ITEM",
  );
});

test("retrieveFromVaultForUser rejects a missing/out-of-range slotIndex for destination=rack", async () => {
  await assert.rejects(
    () => vaultService.retrieveFromVaultForUser(1, { destination: "rack", vaultId: 1 }),
    (err) => err.http === 400 && err.message === "INVALID_SLOT",
  );
  await assert.rejects(
    () => vaultService.retrieveFromVaultForUser(1, { destination: "rack", vaultId: 1, slotIndex: 999 }),
    (err) => err.http === 400 && err.message === "INVALID_SLOT",
  );
});

test("retrieveFromVaultForUser (rack destination) surfaces a real 404 for a vault item the user does not own", async () => {
  await assert.rejects(
    () => vaultService.retrieveFromVaultForUser(1, { destination: "rack", vaultId: 999999999, slotIndex: 0 }),
    (err) => err.http === 404 && err.message === "NOT_FOUND",
  );
});

test("moveToVaultForUser rejects an empty inventory selection", async () => {
  await assert.rejects(
    () => vaultService.moveToVaultForUser(1, { source: "inventory" }),
    (err) => err.http === 400,
  );
});

test("retrieveFromVaultForUser rejects an empty vault selection", async () => {
  await assert.rejects(
    () => vaultService.retrieveFromVaultForUser(1, { destination: "inventory" }),
    (err) => err.http === 400,
  );
});
