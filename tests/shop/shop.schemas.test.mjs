import test from "node:test";
import assert from "node:assert/strict";

const {
  listMinersQuerySchema,
  createPurchaseMinerSchema,
  createPurchaseFanSchema,
  createPurchaseRackSchema,
  readShopMaxBulkQuantity,
  DEFAULT_SHOP_MAX_BULK_QUANTITY,
} = await import("../../server/modules/shop/shop.schemas.ts");

test("listMinersQuerySchema: defaults to page 1 and pageSize 24", () => {
  const parsed = listMinersQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 24);
});

test("listMinersQuerySchema: parses valid custom query params", () => {
  const parsed = listMinersQuerySchema.parse({ page: "3", pageSize: "12" });
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 12);
});

test("listMinersQuerySchema: rejects invalid page or pageSize", () => {
  assert.throws(() => listMinersQuerySchema.parse({ page: "0" }));
  assert.throws(() => listMinersQuerySchema.parse({ page: "-1" }));
  assert.throws(() => listMinersQuerySchema.parse({ pageSize: "2" })); // min is 6
  assert.throws(() => listMinersQuerySchema.parse({ pageSize: "100" })); // max is 48
});

test("purchaseMinerSchema: accepts valid minerId and quantity", () => {
  const schema = createPurchaseMinerSchema(25);
  const result = schema.parse({ minerId: 10, quantity: 5 });
  assert.equal(result.minerId, 10);
  assert.equal(result.quantity, 5);
});

test("purchaseMinerSchema: defaults quantity to 1 when omitted", () => {
  const schema = createPurchaseMinerSchema(25);
  const result = schema.parse({ minerId: 4 });
  assert.equal(result.minerId, 4);
  assert.equal(result.quantity, 1);
});

test("purchaseMinerSchema: validates idempotencyKey format", () => {
  const schema = createPurchaseMinerSchema(25);
  const validKey = "idem-key-12345678";
  const result = schema.parse({ minerId: 1, quantity: 1, idempotencyKey: validKey });
  assert.equal(result.idempotencyKey, validKey);

  // Too short (< 8 chars)
  assert.throws(() => schema.parse({ minerId: 1, quantity: 1, idempotencyKey: "short" }));
  // Invalid characters
  assert.throws(() => schema.parse({ minerId: 1, quantity: 1, idempotencyKey: "bad key with spaces" }));
  assert.throws(() => schema.parse({ minerId: 1, quantity: 1, idempotencyKey: "key_with_illegal_symbols!@#" }));
});

test("purchaseMinerSchema: rejects boundary errors and malicious inputs", () => {
  const schema = createPurchaseMinerSchema(25);

  // Missing or negative minerId
  assert.throws(() => schema.parse({ minerId: -1, quantity: 1 }));
  assert.throws(() => schema.parse({ minerId: 0, quantity: 1 }));
  assert.throws(() => schema.parse({ minerId: "not-a-number", quantity: 1 }));
  assert.throws(() => schema.parse({ quantity: 1 }));

  // Quantity <= 0
  assert.throws(() => schema.parse({ minerId: 1, quantity: 0 }));
  assert.throws(() => schema.parse({ minerId: 1, quantity: -5 }));

  // Quantity > maxBulk (25)
  assert.throws(() => schema.parse({ minerId: 1, quantity: 26 }));
  assert.throws(() => schema.parse({ minerId: 1, quantity: 999999 }));

  // Non-integer float quantity
  assert.throws(() => schema.parse({ minerId: 1, quantity: 1.5 }));
});

test("purchaseFanSchema: validates sku, quantity, and boundaries", () => {
  const schema = createPurchaseFanSchema(25);

  const ok = schema.parse({ sku: "fan-standard-v1", quantity: 3 });
  assert.equal(ok.sku, "fan-standard-v1");
  assert.equal(ok.quantity, 3);

  // Empty or whitespace sku
  assert.throws(() => schema.parse({ sku: "", quantity: 1 }));
  assert.throws(() => schema.parse({ sku: "   ", quantity: 1 }));
  assert.throws(() => schema.parse({ quantity: 1 }));

  // Excess quantity
  assert.throws(() => schema.parse({ sku: "fan-standard-v1", quantity: 30 }));
});

test("purchaseRackSchema: validates sku, quantity, and boundaries", () => {
  const schema = createPurchaseRackSchema(25);

  const ok = schema.parse({ sku: "rack-standard-v1", quantity: 2 });
  assert.equal(ok.sku, "rack-standard-v1");
  assert.equal(ok.quantity, 2);

  assert.throws(() => schema.parse({ sku: "", quantity: 1 }));
  assert.throws(() => schema.parse({ sku: "rack-standard-v1", quantity: 0 }));
  assert.throws(() => schema.parse({ sku: "rack-standard-v1", quantity: 50 }));
});

test("readShopMaxBulkQuantity: returns default 25 or environment integer", () => {
  assert.equal(DEFAULT_SHOP_MAX_BULK_QUANTITY, 25);
  const currentMax = readShopMaxBulkQuantity();
  assert.ok(Number.isInteger(currentMax) && currentMax > 0);
});
