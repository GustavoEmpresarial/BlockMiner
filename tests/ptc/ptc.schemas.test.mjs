import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/ptc/ptc.schemas.ts");

test("createCampaignSchema accepts a valid payload and rejects unknown keys (.strict())", () => {
  const good = schemas.createCampaignSchema.safeParse({
    title: "My ad",
    description: "desc",
    url: "https://example.com",
    tierId: 1,
    targetViews: 100,
  });
  assert.equal(good.success, true);

  const withExtra = schemas.createCampaignSchema.safeParse({
    title: "My ad",
    url: "https://example.com",
    tierId: 1,
    targetViews: 100,
    extraField: "nope",
  });
  assert.equal(withExtra.success, false);
});

test("createCampaignSchema rejects missing required fields", () => {
  const bad = schemas.createCampaignSchema.safeParse({ title: "", url: "", tierId: 0, targetViews: 0 });
  assert.equal(bad.success, false);
});

test("viewsAdjustSchema requires a positive integer views count", () => {
  assert.equal(schemas.viewsAdjustSchema.safeParse({ views: 5 }).success, true);
  assert.equal(schemas.viewsAdjustSchema.safeParse({ views: 0 }).success, false);
  assert.equal(schemas.viewsAdjustSchema.safeParse({ views: -1 }).success, false);
});

test("startSessionSchema coerces and requires a positive adId", () => {
  assert.equal(schemas.startSessionSchema.safeParse({ adId: "42" }).success, true);
  assert.equal(schemas.startSessionSchema.safeParse({ adId: 0 }).success, false);
});

test("adminCreateTierSchema defaults adType/isActive/sortOrder and validates currency", () => {
  const parsed = schemas.adminCreateTierSchema.parse({
    label: "30s window",
    durationSeconds: 30,
    pricePerViewShib: 1,
    rewardPerViewShib: 0.5,
  });
  assert.equal(parsed.adType, "window");
  assert.equal(parsed.isActive, true);
  assert.equal(parsed.sortOrder, 0);
  assert.equal(parsed.currency, "SHIB");

  const parsedPol = schemas.adminCreateTierSchema.parse({
    label: "15s POL",
    durationSeconds: 15,
    pricePerViewShib: 0.005,
    rewardPerViewShib: 0.004,
    currency: "POL",
  });
  assert.equal(parsedPol.currency, "POL");

  const parsedBlk = schemas.adminCreateTierSchema.parse({
    label: "15s BLK",
    durationSeconds: 15,
    pricePerViewShib: 0.05,
    rewardPerViewShib: 0.04,
    currency: "BLK",
  });
  assert.equal(parsedBlk.currency, "BLK");

  const badCurrency = schemas.adminCreateTierSchema.safeParse({
    label: "Bad currency",
    durationSeconds: 10,
    pricePerViewShib: 1,
    rewardPerViewShib: 0.5,
    currency: "INVALID",
  });
  assert.equal(badCurrency.success, false);
});

