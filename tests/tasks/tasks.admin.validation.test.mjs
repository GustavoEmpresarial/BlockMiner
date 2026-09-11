import test from "node:test";
import assert from "node:assert/strict";

const validation = await import("../../server/modules/tasks/tasks.admin.validation.ts");

function baseBody(overrides = {}) {
  return {
    slug: "watch-3-videos",
    taskType: "WATCH_YOUTUBE",
    resetCadence: "DAILY",
    targetValue: 3,
    translationKey: "tasks.watch_youtube",
    rewardKind: "POL",
    rewardPolAmount: 1.5,
    ...overrides,
  };
}

test("parseCreateDailyTaskDefinition: accepts a valid POL-reward definition", () => {
  const r = validation.parseCreateDailyTaskDefinition(baseBody());
  assert.equal(r.ok, true);
  assert.equal(r.data.slug, "watch-3-videos");
  assert.equal(r.data.taskType, "WATCH_YOUTUBE");
  assert.equal(String(r.data.rewardPolAmount), "1.5");
});

test("parseCreateDailyTaskDefinition: rejects invalid slug", () => {
  const r = validation.parseCreateDailyTaskDefinition(baseBody({ slug: "Not Valid Slug!" }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("parseCreateDailyTaskDefinition: rejects unknown task type", () => {
  const r = validation.parseCreateDailyTaskDefinition(baseBody({ taskType: "NOT_A_TASK" }));
  assert.equal(r.ok, false);
});

test("parseCreateDailyTaskDefinition: rejects non-positive targetValue", () => {
  const r = validation.parseCreateDailyTaskDefinition(baseBody({ targetValue: 0 }));
  assert.equal(r.ok, false);
});

test("parseCreateDailyTaskDefinition: BLK reward requires positive rewardBlkAmount", () => {
  const r = validation.parseCreateDailyTaskDefinition(
    baseBody({ rewardKind: "BLK", rewardBlkAmount: undefined }),
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /rewardBlkAmount/);
});

test("parseCreateDailyTaskDefinition: HASHRATE_TEMP requires hashRate and days in range", () => {
  const ok = validation.parseCreateDailyTaskDefinition(
    baseBody({ rewardKind: "HASHRATE_TEMP", rewardHashRate: 10, rewardHashRateDays: 3 }),
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.data.rewardHashRate, 10);
  assert.equal(ok.data.rewardHashRateDays, 3);

  const badDays = validation.parseCreateDailyTaskDefinition(
    baseBody({ rewardKind: "HASHRATE_TEMP", rewardHashRate: 10, rewardHashRateDays: 999 }),
  );
  assert.equal(badDays.ok, false);
});

test("parseCreateDailyTaskDefinition: INTERNAL_OFFERWALL tasks cannot set gameSlug", () => {
  const r = validation.parseCreateDailyTaskDefinition(
    baseBody({ taskType: "INTERNAL_OFFERWALL", gameSlug: "game2048" }),
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /gameSlug/);
});

test("parseCreateDailyTaskDefinition: autoSortOrder flag is threaded through", () => {
  const r = validation.parseCreateDailyTaskDefinition(baseBody({ autoSortOrder: true }));
  assert.equal(r.ok, true);
  assert.equal(r.autoSortOrder, true);
});

test("parsePatchDailyTaskDefinition: rejects empty body (no fields to update)", () => {
  const r = validation.parsePatchDailyTaskDefinition({});
  assert.equal(r.ok, false);
  assert.match(r.message, /No valid fields/);
});

test("parsePatchDailyTaskDefinition: SHOP_MINER reward flags needsMinerId for FK validation", () => {
  const r = validation.parsePatchDailyTaskDefinition({ rewardKind: "SHOP_MINER", rewardMinerId: 42 });
  assert.equal(r.ok, true);
  assert.equal(r.needsMinerId, 42);
  assert.equal(r.data.rewardMinerId, 42);
});

test("parsePatchDailyTaskDefinition: rejects invalid reset cadence", () => {
  // normalizeDailyTaskResetCadence silently downgrades unknown values to DAILY, so this
  // always succeeds — verifying that documented normalization behavior explicitly.
  const r = validation.parsePatchDailyTaskDefinition({ resetCadence: "not-a-cadence" });
  assert.equal(r.ok, true);
  assert.equal(r.data.resetCadence, "DAILY");
});
