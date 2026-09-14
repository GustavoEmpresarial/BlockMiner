import test from "node:test";
import assert from "node:assert/strict";

const shopService = await import("../../server/modules/shop/shop.service.ts");
const { SHOP_CURRENCY } = await import("../../server/modules/shop/shop.config.ts");

test("listMinersForShop: normalizes active miners and attaches hardware catalog", async () => {
  const origList = shopService.shopRepoRef.listActiveMiners;
  try {
    shopService.shopRepoRef.listActiveMiners = async (page, pageSize) => {
      assert.equal(page, 1);
      assert.equal(pageSize, 10);
      return {
        total: 2,
        miners: [
          {
            id: 1,
            name: "Antminer Test 1",
            baseHashRate: "50000",
            slotSize: "2",
            price: "100.5",
            imageUrl: "https://example.com/miner1.png",
          },
          {
            id: 2,
            name: "Antminer Test 2",
            baseHashRate: null,
            slotSize: null,
            price: null,
            imageUrl: null,
          },
        ],
      };
    };

    const result = await shopService.listMinersForShop(1, 10);

    assert.equal(result.total, 2);
    assert.equal(result.currency, SHOP_CURRENCY);
    assert.ok(Array.isArray(result.items));
    assert.equal(result.items.length, 2);

    // First item coerced correctly
    const first = result.items[0];
    assert.equal(first.id, 1);
    assert.equal(first.name, "Antminer Test 1");
    assert.equal(first.baseHashRate, 50000);
    assert.equal(first.slotSize, 2);
    assert.equal(first.price, 100.5);
    assert.equal(first.currency, "BLK");
    assert.equal(first.imageUrl, "https://example.com/miner1.png");

    // Second item handles nulls with sensible defaults
    const second = result.items[1];
    assert.equal(second.id, 2);
    assert.equal(second.baseHashRate, 0);
    assert.equal(second.slotSize, 1);
    assert.equal(second.price, 0);
    assert.equal(second.imageUrl, null);

    // Includes fans and racks hardware catalog
    assert.ok(Array.isArray(result.fans));
    assert.ok(Array.isArray(result.racks));
    assert.ok(typeof result.fanSalesAvailableAt === "string");
    assert.ok(typeof result.rackSalesAvailableAt === "string");
  } finally {
    shopService.shopRepoRef.listActiveMiners = origList;
  }
});
