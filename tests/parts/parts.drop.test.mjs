import test from "node:test";
import assert from "node:assert/strict";

const drop = await import("../../server/modules/parts/parts.drop.ts");
const catalog = await import("../../server/modules/parts/parts.catalog.ts");

test("partSlugForOfferwallCredit is stable for the same source and ref", () => {
  const a = drop.partSlugForOfferwallCredit("offerwallme", "tx-100");
  const b = drop.partSlugForOfferwallCredit("offerwallme", "tx-100");
  assert.equal(a, b);
  assert.ok(catalog.PART_SLUGS.includes(a));
});

test("partSlugForOfferwallCredit stays inside the six-part catalog", () => {
  const slugs = new Set();
  for (let i = 0; i < 40; i += 1) {
    slugs.add(drop.partSlugForOfferwallCredit("internal", `attempt-${i}`));
  }
  for (const slug of slugs) {
    assert.ok(catalog.PART_SLUGS.includes(slug));
  }
  assert.equal(catalog.PART_CATALOG.length, 6);
});

test("readPartsPerOfferwallCredit uses the named default and rejects junk", () => {
  assert.equal(drop.readPartsPerOfferwallCredit(""), drop.DEFAULT_PARTS_PER_OFFERWALL_CREDIT);
  assert.equal(drop.readPartsPerOfferwallCredit(null), 1);
  assert.equal(drop.readPartsPerOfferwallCredit("2"), 2);
  assert.equal(drop.readPartsPerOfferwallCredit("0"), 0);
  assert.equal(drop.readPartsPerOfferwallCredit("1.5"), drop.DEFAULT_PARTS_PER_OFFERWALL_CREDIT);
  assert.equal(drop.readPartsPerOfferwallCredit("-3"), drop.DEFAULT_PARTS_PER_OFFERWALL_CREDIT);
  assert.equal(drop.readPartsPerOfferwallCredit("nope"), drop.DEFAULT_PARTS_PER_OFFERWALL_CREDIT);
});

test("part images live under the parts media category", () => {
  assert.equal(catalog.partImageUrl("power_cable"), "/media/parts/power_cable.jpg");
  assert.equal(catalog.partImageUrl("thermal_pad"), "/media/parts/thermal_pad.jpg");
});
