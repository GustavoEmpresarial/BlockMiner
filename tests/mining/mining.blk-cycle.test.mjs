import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
// Covers: runBlkRewardCycle actually credits User.blkBalance proportional to hashrate,
// is idempotent per windowStart (P2002 → "already_distributed", no double-credit), and
// fires the mini-pass / daily-task BLK hooks for each rewarded user.
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { runBlkRewardCycle, getLatestBlkRewardCycle, getBlkCyclePublicSnapshot } = await import(
  "../../server/modules/mining/mining.blk-cycle.ts"
);

const createdUserIds = [];
const createdMinerIds = [];
const createdWindowStarts = [];
let originalConfig = null;

async function makeUser(overrides = {}) {
  const suffix = `blkcyc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "BLK Cycle Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.40",
      ip: "203.0.113.40",
      userAgent: "test-agent/1.0",
      miningPayoutMode: "blk",
      lastHeartbeatAt: new Date(),
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeActiveMiner(userId, hashRate, slotIndex) {
  const m = await prisma.userMiner.create({
    data: { userId, slotIndex, hashRate, isActive: true },
  });
  createdMinerIds.push(m.id);
  return m;
}

/**
 * Eligibility for a cycle is activity-based across ALL users (miningPayoutMode "blk" +
 * recent heartbeat), same as production — it is not scoped to a single test's fixtures. So
 * each test must retire the users/miners it created (set payout mode off + deactivate the
 * miner) before the next test runs a cycle, otherwise earlier tests' users would leak into
 * later windows' hashrate pool. Real deletion happens once in test.after (final cleanup);
 * this just neutralizes eligibility between tests.
 */
async function retire(userIds, minerIds) {
  if (minerIds.length) {
    await prisma.userMiner.updateMany({ where: { id: { in: minerIds } }, data: { isActive: false } });
  }
  if (userIds.length) {
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { miningPayoutMode: "pol" } });
  }
}

async function setConfig(overrides) {
  await prisma.blkEconomyConfig.upsert({
    where: { id: 1 },
    update: overrides,
    create: {
      id: 1,
      polPerBlk: "1",
      minConvertPol: "1",
      ...overrides,
    },
  });
}

function newWindowStart() {
  // Unique, far-future window per test so it never collides with a real cron/admin run and
  // never collides between tests in this file.
  const ws = new Date(Date.UTC(2999, 0, 1, 0, 0, 0) + createdWindowStarts.length * 600_000);
  createdWindowStarts.push(ws);
  return ws;
}

test.before(async () => {
  originalConfig = await prisma.blkEconomyConfig.findUnique({ where: { id: 1 } });
});

test.after(async () => {
  if (createdWindowStarts.length) {
    await prisma.blkRewardLog.deleteMany({
      where: { cycle: { windowStart: { in: createdWindowStarts } } },
    });
    await prisma.blkRewardCycle.deleteMany({ where: { windowStart: { in: createdWindowStarts } } });
  }
  if (createdMinerIds.length) {
    await prisma.userMiner.deleteMany({ where: { id: { in: createdMinerIds } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (originalConfig) {
    await prisma.blkEconomyConfig.update({
      where: { id: 1 },
      data: {
        blkCycleReward: originalConfig.blkCycleReward,
        blkCycleIntervalSec: originalConfig.blkCycleIntervalSec,
        blkCycleActivitySec: originalConfig.blkCycleActivitySec,
        blkCycleMinHashrate: originalConfig.blkCycleMinHashrate,
        blkCyclePaused: originalConfig.blkCyclePaused,
        blkCycleBoost: originalConfig.blkCycleBoost,
      },
    });
  }
  await prisma.$disconnect();
});

test("runBlkRewardCycle: distributes BLK proportionally to hashrate and credits real blkBalance", async () => {
  await setConfig({
    blkCycleReward: "10",
    blkCycleActivitySec: 900,
    blkCycleMinHashrate: "0",
    blkCyclePaused: false,
    blkCycleBoost: "1",
  });

  const userA = await makeUser(); // 3x hashrate
  const userB = await makeUser(); // 1x hashrate
  await makeActiveMiner(userA.id, 300, 0);
  await makeActiveMiner(userB.id, 100, 0);

  const beforeA = await prisma.user.findUnique({ where: { id: userA.id }, select: { blkBalance: true } });
  const beforeB = await prisma.user.findUnique({ where: { id: userB.id }, select: { blkBalance: true } });
  assert.equal(Number(beforeA.blkBalance), 0);
  assert.equal(Number(beforeB.blkBalance), 0);

  const windowStart = newWindowStart();
  const result = await runBlkRewardCycle({ windowStart });

  assert.equal(result.ok, true);
  assert.ok(result.cycleId, "must create a real BlkRewardCycle row");
  assert.equal(result.minerCount, 2);
  assert.equal(result.distributed, "10");

  const afterA = await prisma.user.findUnique({ where: { id: userA.id }, select: { blkBalance: true } });
  const afterB = await prisma.user.findUnique({ where: { id: userB.id }, select: { blkBalance: true } });

  // 300/400 * 10 = 7.5 ; 100/400 * 10 = 2.5
  assert.equal(Number(afterA.blkBalance), 7.5);
  assert.equal(Number(afterB.blkBalance), 2.5);

  const logs = await prisma.blkRewardLog.findMany({ where: { cycleId: result.cycleId } });
  assert.equal(logs.length, 2);
  const logA = logs.find((l) => l.userId === userA.id);
  const logB = logs.find((l) => l.userId === userB.id);
  assert.equal(Number(logA.amount), 7.5);
  assert.equal(Number(logB.amount), 2.5);
  assert.equal(logA.shareBps, 7500);
  assert.equal(logB.shareBps, 2500);

  const cycle = await prisma.blkRewardCycle.findUnique({ where: { id: result.cycleId } });
  assert.equal(Number(cycle.totalHashrate), 400);
  assert.equal(Number(cycle.totalReward), 10);
  assert.equal(Number(cycle.distributed), 10);

  await retire([userA.id, userB.id], []);
});

test("runBlkRewardCycle: idempotent per windowStart — running the same window twice never double-credits", async () => {
  await setConfig({ blkCycleReward: "5", blkCycleActivitySec: 900, blkCycleMinHashrate: "0", blkCyclePaused: false, blkCycleBoost: "1" });

  const user = await makeUser();
  const miner = await makeActiveMiner(user.id, 50, 0);

  const windowStart = newWindowStart();
  const first = await runBlkRewardCycle({ windowStart });
  assert.equal(first.ok, true);
  assert.ok(first.cycleId);

  const afterFirst = await prisma.user.findUnique({ where: { id: user.id }, select: { blkBalance: true } });
  assert.equal(Number(afterFirst.blkBalance), 5);

  // Re-run the exact same window — must short-circuit via the unique-constraint check, not
  // re-distribute or double-credit.
  const second = await runBlkRewardCycle({ windowStart });
  assert.equal(second.ok, true);
  assert.equal(second.skipped, "already_distributed");
  assert.equal(second.cycleId, first.cycleId);

  const afterSecond = await prisma.user.findUnique({ where: { id: user.id }, select: { blkBalance: true } });
  assert.equal(Number(afterSecond.blkBalance), 5, "balance must not double-credit on a repeated window");

  const cycleCount = await prisma.blkRewardCycle.count({ where: { windowStart } });
  assert.equal(cycleCount, 1, "only one cycle row must exist for this window");

  await retire([user.id], [miner.id]);
});

test("runBlkRewardCycle: paused config skips distribution and credits nothing", async () => {
  await setConfig({ blkCycleReward: "5", blkCyclePaused: true });
  const user = await makeUser();
  const miner = await makeActiveMiner(user.id, 50, 0);

  const windowStart = newWindowStart();
  const result = await runBlkRewardCycle({ windowStart });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, "paused");

  const cycle = await prisma.blkRewardCycle.findUnique({ where: { windowStart } });
  assert.equal(cycle, null, "no cycle row should be created while paused");

  const after = await prisma.user.findUnique({ where: { id: user.id }, select: { blkBalance: true } });
  assert.equal(Number(after.blkBalance), 0);

  await retire([user.id], [miner.id]);
});

test("runBlkRewardCycle: users below minHashrate are excluded from the split", async () => {
  await setConfig({ blkCycleReward: "9", blkCycleMinHashrate: "10", blkCyclePaused: false, blkCycleBoost: "1" });

  const eligible = await makeUser();
  const tooSmall = await makeUser();
  const minerEligible = await makeActiveMiner(eligible.id, 100, 0);
  const minerTooSmall = await makeActiveMiner(tooSmall.id, 5, 0); // below minHashrate=10, excluded

  const windowStart = newWindowStart();
  const result = await runBlkRewardCycle({ windowStart });
  assert.equal(result.minerCount, 1);

  const afterEligible = await prisma.user.findUnique({ where: { id: eligible.id }, select: { blkBalance: true } });
  const afterTooSmall = await prisma.user.findUnique({ where: { id: tooSmall.id }, select: { blkBalance: true } });
  assert.equal(Number(afterEligible.blkBalance), 9);
  assert.equal(Number(afterTooSmall.blkBalance), 0);

  await retire([eligible.id, tooSmall.id], [minerEligible.id, minerTooSmall.id]);
});

test("getLatestBlkRewardCycle / getBlkCyclePublicSnapshot: reflect the most recently distributed cycle", async () => {
  await setConfig({ blkCycleReward: "2", blkCycleMinHashrate: "0", blkCyclePaused: false, blkCycleBoost: "1", blkCycleIntervalSec: 600, blkCycleActivitySec: 900 });
  const user = await makeUser();
  const miner = await makeActiveMiner(user.id, 42, 0);

  const windowStart = newWindowStart();
  const result = await runBlkRewardCycle({ windowStart });
  assert.ok(result.cycleId);

  const latest = await getLatestBlkRewardCycle();
  assert.ok(latest, "a latest cycle must exist");
  // windowStart is deliberately far in the future, so it must sort as the latest by windowStart desc.
  assert.equal(latest.id, result.cycleId);

  const snap = await getBlkCyclePublicSnapshot();
  assert.equal(snap.lastCycle.id, result.cycleId);
  assert.equal(snap.paused, false);
  assert.equal(snap.rewardPerCycle, 2);
  assert.ok(snap.currentWindowStart);
  assert.ok(snap.nextWindowStart);

  await retire([user.id], [miner.id]);
});
