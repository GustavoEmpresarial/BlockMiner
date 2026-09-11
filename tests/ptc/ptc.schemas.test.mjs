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

test("adminCreateTierSchema defaults adType/isActive/sortOrder", () => {
  const parsed = schemas.adminCreateTierSchema.parse({
    label: "30s window",
    durationSeconds: 30,
    pricePerViewShib: 1,
    rewardPerViewShib: 0.5,
  });
  assert.equal(parsed.adType, "window");
  assert.equal(parsed.isActive, true);
  assert.equal(parsed.sortOrder, 0);
});
