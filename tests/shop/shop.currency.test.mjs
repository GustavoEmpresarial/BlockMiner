import test from "node:test";
import assert from "node:assert/strict";

const { SHOP_CURRENCY, SHOP_BALANCE_FIELD } = await import(
  "../../server/modules/shop/shop.config.ts"
);

test("shop catalog is denominated in BLK against blkBalance", () => {
  assert.equal(SHOP_CURRENCY, "BLK");
  assert.equal(SHOP_BALANCE_FIELD, "blkBalance");
});
