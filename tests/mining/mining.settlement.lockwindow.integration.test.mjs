/**
 * Block settlement must not hold the miners' user rows locked while it writes the reward
 * logs. With 2k miners those inserts take ~12s in production, and every YouTube/auto-mining
 * heartbeat (UPDATE users ... last_heartbeat_at) queued behind the settlement for seconds.
 * A test-only trigger makes the mining_rewards_log insert slow; a concurrent heartbeat on
 * the same user must still go through within a short lock_timeout.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { persistBlockRewards } = await import("../../server/modules/mining/mining.repository.ts");

const SLOW_INSERT_SECONDS = 1.5;
const HEARTBEAT_LOCK_TIMEOUT_MS = 400;
const HEARTBEAT_DELAY_MS = 500;
const createdUserIds = [];
let blockNumber = 910_000_000 + Math.floor(Math.random() * 1_000_000);
const raw = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function rewardRow(userId, pol) {
  return {
    minerId: `m-${userId}`, userId, username: `u${userId}`, walletAddress: null, rigs: 1, baseHashRate: 100,
    workAccumulated: 100, sharePercentage: 100, rewardAmount: pol, balanceAfter: pol, lifetimeMined: pol,
    workPol: 100, workShib: 0, shareShibPercentage: 0, allocationPolBps: 10000, rewardAmountShib: 0,
  };
}

test.before(async () => {
  await raw.query(`
    CREATE OR REPLACE FUNCTION test_slow_mining_log() RETURNS trigger AS $$
    BEGIN PERFORM pg_sleep(${SLOW_INSERT_SECONDS}); RETURN NULL; END $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS test_slow_mining_log ON mining_rewards_log;
    CREATE TRIGGER test_slow_mining_log AFTER INSERT ON mining_rewards_log
      FOR EACH STATEMENT EXECUTE FUNCTION test_slow_mining_log();`);
});

test.after(async () => {
  await raw.query(`DROP TRIGGER IF EXISTS test_slow_mining_log ON mining_rewards_log; DROP FUNCTION IF EXISTS test_slow_mining_log();`);
  if (createdUserIds.length) {
    await prisma.miningRewardsLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.blockMinerReward.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await raw.end();
  await prisma.$disconnect();
});

test("settlement: heartbeat on a miner's user row is not blocked while reward logs are written", async () => {
  const suffix = `lockwin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: { name: "Lock Window", username: suffix, email: `${suffix}@blockminer.test`, passwordHash: "x",
      registrationIp: "203.0.113.7", ip: "203.0.113.7", userAgent: "test-agent/1.0" },
  });
  createdUserIds.push(user.id);

  const settlement = persistBlockRewards({
    blockNumber: blockNumber++, blockReward: 10, blockRewardShib: 0, totalWork: 100, totalWorkPol: 100, totalWorkShib: 0,
    minerRewards: [rewardRow(user.id, 10)], now: Date.now(),
  });

  await new Promise((r) => setTimeout(r, HEARTBEAT_DELAY_MS));
  const client = await raw.connect();
  let heartbeat;
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${HEARTBEAT_LOCK_TIMEOUT_MS}ms'`);
    heartbeat = await client
      .query(`UPDATE users SET last_heartbeat_at = now() WHERE id = $1`, [user.id])
      .then(() => "ok", (e) => e.code);
    await client.query(heartbeat === "ok" ? "COMMIT" : "ROLLBACK");
  } finally {
    client.release();
  }
  await settlement;

  assert.equal(heartbeat, "ok", `heartbeat waited on the settlement row lock (pg code ${heartbeat})`);
  const after = await prisma.user.findUnique({ where: { id: user.id }, select: { polBalance: true, lifetimeMinedPol: true } });
  assert.equal(Number(after.polBalance), 10, "settlement still credits the miner");
  assert.equal(Number(after.lifetimeMinedPol), 10);
});
