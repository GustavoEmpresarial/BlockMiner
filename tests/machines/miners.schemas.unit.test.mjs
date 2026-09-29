import test from "node:test";
import assert from "node:assert/strict";

const {
  createMinerSchema,
  updateMinerSchema,
  minerIdParamSchema,
  assignBrokenMachineSchema,
  relinkOrphanSchema,
  minerListQuerySchema,
} = await import("../../server/modules/machines/miners.schemas.ts");

test("minerIdParamSchema: accepts valid 32-bit positive integers", () => {
  const valid = minerIdParamSchema.safeParse({ id: "42" });
  assert.equal(valid.success, true);
  assert.equal(valid.data.id, 42);

  const edgeMax = minerIdParamSchema.safeParse({ id: 2_147_483_647 });
  assert.equal(edgeMax.success, true);
});

test("minerIdParamSchema: rejects zero, negatives, and overflow", () => {
  assert.equal(minerIdParamSchema.safeParse({ id: 0 }).success, false);
  assert.equal(minerIdParamSchema.safeParse({ id: -1 }).success, false);
  assert.equal(minerIdParamSchema.safeParse({ id: 2_147_483_648 }).success, false);
  assert.equal(minerIdParamSchema.safeParse({ id: "invalid" }).success, false);
});

test("createMinerSchema: validates correct payload and defaults", () => {
  const payload = {
    name: "Antminer S19 Pro",
    baseHashRate: 110_000_000,
    price: 150.5,
  };
  const parsed = createMinerSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.name, "Antminer S19 Pro");
  assert.equal(parsed.data.slotSize, 1);
  assert.equal(parsed.data.isActive, true);
  assert.equal(parsed.data.showInShop, true);
  assert.equal(parsed.data.sortOrder, 0);
  assert.equal(parsed.data.tier, "common");
  assert.equal(parsed.data.sourceType, "store");
});

test("createMinerSchema: rejects negative hashrate and negative price", () => {
  const badHash = createMinerSchema.safeParse({
    name: "Test",
    baseHashRate: -10,
    price: 10,
  });
  assert.equal(badHash.success, false);

  const badPrice = createMinerSchema.safeParse({
    name: "Test",
    baseHashRate: 100,
    price: -5,
  });
  assert.equal(badPrice.success, false);
});

test("createMinerSchema: rejects slotSize not in 1 or 2", () => {
  assert.equal(
    createMinerSchema.safeParse({ name: "T", baseHashRate: 10, price: 1, slotSize: 0 }).success,
    false,
  );
  assert.equal(
    createMinerSchema.safeParse({ name: "T", baseHashRate: 10, price: 1, slotSize: 3 }).success,
    false,
  );
});

test("updateMinerSchema: allows partial fields and rejects negative values", () => {
  const partial = updateMinerSchema.safeParse({
    baseHashRate: 200_000,
    isActive: false,
  });
  assert.equal(partial.success, true);
  assert.equal(partial.data.baseHashRate, 200_000);
  assert.equal(partial.data.isActive, false);

  const invalid = updateMinerSchema.safeParse({ price: -1 });
  assert.equal(invalid.success, false);
});

test("assignBrokenMachineSchema: enforces mutual exclusivity between catalogMinerId and eventMinerId", () => {
  // Both provided -> should fail
  const both = assignBrokenMachineSchema.safeParse({
    minerName: "Test Miner",
    hashRate: 1000,
    location: "RACK",
    catalogMinerId: 1,
    eventMinerId: 2,
  });
  assert.equal(both.success, false);

  // Neither provided -> should fail
  const neither = assignBrokenMachineSchema.safeParse({
    minerName: "Test Miner",
    hashRate: 1000,
    location: "RACK",
  });
  assert.equal(neither.success, false);

  // Exactly catalog -> valid
  const catalogOnly = assignBrokenMachineSchema.safeParse({
    minerName: "Test Miner",
    hashRate: 1000,
    location: "RACK",
    catalogMinerId: 5,
  });
  assert.equal(catalogOnly.success, true);

  // Exactly event -> valid
  const eventOnly = assignBrokenMachineSchema.safeParse({
    minerName: "Test Miner",
    hashRate: 1000,
    location: "INVENTORY",
    eventMinerId: 7,
  });
  assert.equal(eventOnly.success, true);
});

test("relinkOrphanSchema: requires non-empty minerName", () => {
  assert.equal(relinkOrphanSchema.safeParse({ minerName: "RTX 4090" }).success, true);
  assert.equal(relinkOrphanSchema.safeParse({ minerName: "   " }).success, false);
  assert.equal(relinkOrphanSchema.safeParse({}).success, false);
});

test("minerListQuerySchema: parses query filters and coerced boolean includeArchived", () => {
  const q1 = minerListQuerySchema.safeParse({ q: "antminer", includeArchived: "1" });
  assert.equal(q1.success, true);
  assert.equal(q1.data.q, "antminer");
  assert.equal(q1.data.includeArchived, true);

  const q2 = minerListQuerySchema.safeParse({ includeArchived: "0" });
  assert.equal(q2.success, true);
  assert.equal(q2.data.includeArchived, false);
});
