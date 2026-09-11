import test from "node:test";
import assert from "node:assert/strict";

const inventoryErrors = await import("../../server/modules/inventory/inventory.errors.ts");

test("InventoryItemNotFoundError carries http 404 and the not-found code", () => {
  const err = new inventoryErrors.InventoryItemNotFoundError();
  assert.equal(err.http, 404);
  assert.equal(err.code, inventoryErrors.INVENTORY_ERROR.NOT_FOUND);
  assert.ok(err instanceof Error);
});

test("InventoryInvalidSlotError carries http 400 and the invalid-slot code", () => {
  const err = new inventoryErrors.InventoryInvalidSlotError();
  assert.equal(err.http, 400);
  assert.equal(err.code, inventoryErrors.INVENTORY_ERROR.INVALID_SLOT);
});
