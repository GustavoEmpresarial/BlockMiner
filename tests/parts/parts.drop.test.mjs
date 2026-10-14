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
  assert.equal(catalog.PART_SLUGS.length, 6);
  assert.equal(catalog.PART_CATALOG.length, 30);
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
  assert.equal(catalog.partImageUrl("power_cable"), "/media/parts/power_cable_w.png");
  assert.equal(catalog.partImageUrl("power_cable", "uncommon"), "/media/parts/power_cable_u.png");
  assert.equal(catalog.partImageUrl("power_cable", "rare"), "/media/parts/power_cable_rare.png");
  assert.equal(catalog.partImageUrl("power_cable", "epic"), "/media/parts/power_cable_epic.png");
  assert.equal(catalog.partImageUrl("power_cable", "legendary"), "/media/parts/power_cable_legend.png");
  assert.equal(catalog.partImageUrl("thermal_pad"), "/media/parts/thermal_pad_w.png");
});

test("faucet and PTC stay at 30 percent; frequent loops drop once per 10 claims", () => {
  assert.equal(drop.ACTIVITY_DROP_REFERENCE_CLAIMS_PER_DAY, 100);
  assert.equal(drop.ACTIVITY_DROP_REFERENCE_PARTS_PER_DAY, 30);
  assert.equal(drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS, 3_000);
  assert.equal(drop.FREQUENT_ACTIVITY_DROP_REFERENCE_CLAIMS, 10);
  assert.equal(drop.FREQUENT_ACTIVITY_DROP_REFERENCE_PARTS, 1);
  assert.equal(drop.DEFAULT_FREQUENT_ACTIVITY_DROP_BASE_BPS, 1_000);
  assert.equal(drop.OFFERWALL_MICRO_DROP_BPS, 4_000);
  assert.equal(drop.activityDropBaseBps("faucet"), 3_000);
  assert.equal(drop.activityDropBaseBps("ptc"), 3_000);
  assert.equal(drop.activityDropBaseBps("automining"), 1_000);
  assert.equal(drop.activityDropBaseBps("youtube"), 1_000);
  assert.equal(drop.activityDropBaseBps("shortlink"), 1_000);
});

test("readActivityPartDropBaseBps uses the named default and rejects junk", () => {
  assert.equal(drop.readActivityPartDropBaseBps(""), drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
  assert.equal(drop.readActivityPartDropBaseBps(null), 3_000);
  assert.equal(drop.readFrequentActivityDropBaseBps(""), 1_000);
  assert.equal(drop.readFrequentActivityDropBaseBps("0"), 0);
  assert.equal(drop.readFrequentActivityDropBaseBps("10001"), 1_000);
  assert.equal(drop.readFrequentActivityDropBaseBps("nope"), 1_000);
  assert.equal(drop.readActivityPartDropBaseBps("0"), 0);
  assert.equal(drop.readActivityPartDropBaseBps("10000"), 10_000);
  assert.equal(drop.readActivityPartDropBaseBps("2500"), 2500);
  assert.equal(drop.readActivityPartDropBaseBps("10001"), drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
  assert.equal(drop.readActivityPartDropBaseBps("-1"), drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
  assert.equal(drop.readActivityPartDropBaseBps("8.5"), drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
  assert.equal(drop.readActivityPartDropBaseBps("nope"), drop.DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
});

test("calculateActivityPartDrop is stable and stays inside the catalog", () => {
  const sources = ["faucet", "shortlink", "automining", "youtube", "ptc"];
  for (const source of sources) {
    const a = drop.calculateActivityPartDrop(source, "ref-1", 800);
    const b = drop.calculateActivityPartDrop(source, "ref-1", 800);
    assert.deepEqual(a, b);
    assert.ok(catalog.PART_SLUGS.includes(a.partSlug));
    assert.ok(a.quantity === 0 || a.quantity === 1);
  }
});

test("calculateActivityPartDrop honors 0 and 10000 basis points", () => {
  for (let i = 0; i < 30; i += 1) {
    const miss = drop.calculateActivityPartDrop("youtube", `off-${i}`, 0);
    const hit = drop.calculateActivityPartDrop("ptc", `on-${i}`, 10_000);
    assert.equal(miss.dropped, false);
    assert.equal(miss.quantity, 0);
    assert.equal(hit.dropped, true);
    assert.equal(hit.quantity, 1);
    assert.ok(catalog.PART_SLUGS.includes(hit.partSlug));
  }
});

test("frequent activities land near 10 percent and faucet stays near 30", () => {
  const samples = 2000;
  let frequentHits = 0;
  let faucetHits = 0;
  for (let i = 0; i < samples; i += 1) {
    const frequent = drop.calculateActivityPartDrop("automining", `cycle-${i}`);
    const youtube = drop.calculateActivityPartDrop("youtube", `watch-${i}`);
    const shortlink = drop.calculateActivityPartDrop("shortlink", `link-${i}`);
    const faucet = drop.calculateActivityPartDrop("faucet", `claim-${i}`);
    if (frequent.dropped) frequentHits += 1;
    if (youtube.dropped) frequentHits += 1;
    if (shortlink.dropped) frequentHits += 1;
    if (faucet.dropped) faucetHits += 1;
    for (const res of [frequent, youtube, shortlink, faucet]) {
      assert.ok(res.quantity === 0 || res.quantity === 1);
      assert.ok(catalog.PART_SLUGS.includes(res.partSlug));
    }
  }
  const frequentPct = frequentHits / (samples * 3);
  const faucetPct = faucetHits / samples;
  assert.ok(frequentPct >= 0.07 && frequentPct <= 0.13, `Frequent drop expected ~10%, got ${frequentPct}`);
  assert.ok(faucetPct >= 0.26 && faucetPct <= 0.34, `Faucet drop expected ~30%, got ${faucetPct}`);
});

test("calculateOfferwallPartDrop: drops according to value tiers deterministically", () => {
  // Test medium tier ($0.25): 100% chance (quantity = 1)
  for (let i = 0; i < 20; i++) {
    const res = drop.calculateOfferwallPartDrop("internal", `medium-${i}`, 0.25);
    assert.equal(res.dropped, true);
    assert.equal(res.quantity, 1);
    assert.ok(catalog.PART_SLUGS.includes(res.partSlug));
  }

  // Test high tier ($3.50): 1 + floor(3.50) = 4 parts guaranteed
  const resHigh = drop.calculateOfferwallPartDrop("offerwallme", "high-tx-1", 3.50);
  assert.equal(resHigh.dropped, true);
  assert.equal(resHigh.quantity, 4);

  // Test micro tier ($0.0005): 40% chance
  let microDropped = 0;
  const samples = 1000;
  for (let i = 0; i < samples; i++) {
    const res = drop.calculateOfferwallPartDrop("zerads", `micro-ptc-${i}`, 0.0005);
    if (res.dropped) microDropped++;
  }
  const pct = microDropped / samples;
  // Should be approximately ~40% (between 35% and 45%)
  assert.ok(pct >= 0.35 && pct <= 0.45, `Micro drop rate expected ~40%, got ${pct}`);
});
