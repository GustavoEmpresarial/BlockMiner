import test from "node:test";
import assert from "node:assert/strict";

const shopErrors = await import("../../server/modules/shop/shop.errors.ts");

test("SHOP_ERROR_MESSAGE has the exact legacy-compatible strings callers match on", () => {
  assert.equal(shopErrors.SHOP_ERROR_MESSAGE.MINER_UNAVAILABLE, "Miner unavailable.");
  assert.equal(shopErrors.SHOP_ERROR_MESSAGE.OUT_OF_STOCK, "Miner out of stock.");
  assert.equal(shopErrors.SHOP_ERROR_MESSAGE.PURCHASE_LIMIT_REACHED, "Miner purchase limit reached.");
  assert.equal(shopErrors.SHOP_ERROR_MESSAGE.INSUFFICIENT_BALANCE, "Insufficient balance.");
});

test("ShopPurchaseRejectedError is a real Error subclass", () => {
  const err = new shopErrors.ShopPurchaseRejectedError("Miner out of stock.");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "Miner out of stock.");
  assert.equal(err.name, "ShopPurchaseRejectedError");
});
