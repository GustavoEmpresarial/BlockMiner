/**
 * /energy-tax/summary is polled by every sidebar and ran ~60-110 aggregate queries per call.
 * Closed mining periods do not change, so the summary reuses them; only the open period is
 * re-read. Charging paths (payDailyTax / weekly sweep) must keep reading fresh.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

const miningCalls = [];
const activityCalls = [];
let miningTotal = 1;
mock.module(spec("server/modules/energy-tax/energy-tax.activity.ts"), {
  namedExports: {
    ACTIVITY_DISCOUNT_THRESHOLD: 10,
    getMiningRewardsForPeriod: async (userId, start) => {
      miningCalls.push(`${userId}:${start.toISOString()}`);
      return { total: miningTotal, blockMiner: miningTotal, zerads: 0, offerwallMe: 0, internalOfferwall: 0, moneyRain: 0, multiwall: 0, offerwallGg: 0 };
    },
    getActivitiesForPeriod: async (userId, start) => {
      activityCalls.push(`${userId}:${start.toISOString()}`);
      return { offerwallMe: 0, moneyRain: 0, offerwallInt: 0, zeradsClicks: 0, faucet: 0, shortlink: 0, youtube: 0, games: 0, total: 0, exempt: false };
    },
    findUsersWithRewardsInWindow: async () => [],
  },
});
mock.module(spec("server/modules/energy-tax/energy-tax.repository.ts"), {
  namedExports: {
    listChargesInWindowFull: async () => [],
    listChargesInWindow: async () => [],
    listRecentCharges: async () => [],
    findUserBalances: async () => ({ polBalance: 1, blkBalance: 0, shibBalance: 0 }),
  },
});

const svc = await import("../../server/modules/energy-tax/energy-tax.service.ts");
const now = new Date(Math.max(Date.now(), svc.ENERGY_TAX_STARTS_AT.getTime() + 30 * 86_400_000));
const currentStart = svc.miningPeriodStart(now).toISOString();

test("second summary only re-reads the open period, with identical output", async () => {
  svc.clearClosedPeriodCache();
  miningCalls.length = 0;
  activityCalls.length = 0;
  const first = await svc.computeWeekSummary(77, now);
  const firstMining = miningCalls.length;
  assert.ok(firstMining >= 7, `expected the 7 days to be read once, got ${firstMining}`);
  // No duplicate reads of the same period inside one summary.
  assert.equal(new Set(miningCalls).size, miningCalls.length);

  miningCalls.length = 0;
  activityCalls.length = 0;
  const second = await svc.computeWeekSummary(77, now);
  assert.deepEqual(miningCalls, [`77:${currentStart}`]);
  assert.ok(activityCalls.every((k) => k === `77:${currentStart}`), JSON.stringify(activityCalls));
  assert.deepEqual(second, first);
});

test("cache is per user", async () => {
  svc.clearClosedPeriodCache();
  await svc.computeWeekSummary(1, now);
  miningCalls.length = 0;
  await svc.computeWeekSummary(2, now);
  assert.ok(miningCalls.length >= 7);
  assert.ok(miningCalls.every((k) => k.startsWith("2:")));
});

test("the open period is always fresh", async () => {
  svc.clearClosedPeriodCache();
  miningTotal = 1;
  const a = await svc.computeWeekSummary(5, now);
  miningTotal = 9;
  const b = await svc.computeWeekSummary(5, now);
  assert.equal(b.todayRewards, 9);
  assert.equal(a.days[0].rewards, b.days[0].rewards); // closed day reused
  miningTotal = 1;
});

test("charging paths never use the summary cache", async () => {
  svc.clearClosedPeriodCache();
  await svc.computeWeekSummary(9, now);
  miningCalls.length = 0;
  const closed = svc.lastClosedMiningPeriodStart(now);
  await svc.miningBreakdownForUtcDay(9, closed);
  await svc.rewardsForUtcDay(9, closed);
  assert.equal(miningCalls.length, 2);
});
