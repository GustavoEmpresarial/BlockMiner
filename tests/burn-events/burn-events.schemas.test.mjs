import test from "node:test";
import assert from "node:assert/strict";

const {
  startBurnBodySchema,
  claimBurnBodySchema,
  adminCreateBurnEventSchema,
  adminUpdateBurnEventSchema,
} = await import("../../server/modules/burn-events/burn-events.schemas.ts");

test("startBurnBodySchema accepts a valid start payload", () => {
  const parsed = startBurnBodySchema.safeParse({ minerIds: [11, 12], feeCurrency: "SHIB" });
  assert.equal(parsed.success, true);
});

test("startBurnBodySchema rejects mass-assignment extras and invalid currency", () => {
  const extra = startBurnBodySchema.safeParse({
    minerIds: [11],
    feeCurrency: "SHIB",
    claimLimitPerUser: 1,
  });
  assert.equal(extra.success, false);

  const badFee = startBurnBodySchema.safeParse({ minerIds: [11], feeCurrency: "BTC" });
  assert.equal(badFee.success, false);

  const empty = startBurnBodySchema.safeParse({ minerIds: [], feeCurrency: "SHIB" });
  assert.equal(empty.success, false);
});

test("claimBurnBodySchema requires a positive sessionId and rejects extras", () => {
  assert.equal(claimBurnBodySchema.safeParse({ sessionId: 9 }).success, true);
  assert.equal(claimBurnBodySchema.safeParse({ sessionId: 0 }).success, false);
  assert.equal(claimBurnBodySchema.safeParse({ sessionId: 9, userId: 2 }).success, false);
});

test("admin create schema: claimLimitPerUser is per-player burns; stockTotal is global pool", () => {
  const ok = adminCreateBurnEventSchema.safeParse({
    title: "Queima 15 Set–31 Out",
    requiredHashRate: 100,
    rewardMinerId: 7,
    claimLimitPerUser: 10,
    stockTotal: null,
  });
  assert.equal(ok.success, true);

  const swappedLooksLikeBug = adminCreateBurnEventSchema.safeParse({
    title: "x",
    requiredHashRate: 100,
    rewardMinerId: 7,
    claimLimitPerUser: 0,
    stockTotal: 10,
  });
  assert.equal(swappedLooksLikeBug.success, false, "per-user limit of 0 is invalid (min 1)");
});

test("admin update schema rejects unknown fields (mass assignment)", () => {
  const extra = adminUpdateBurnEventSchema.safeParse({ isActive: true, role: "admin" });
  assert.equal(extra.success, false);
});
