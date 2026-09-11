import test from "node:test";
import assert from "node:assert/strict";
import { MiningEngine } from "../../server/modules/mining/mining.engine.ts";

/** Settling is synchronous; the DB write is queued. Await both to observe the final state. */
async function settle(engine) {
  engine.distributeRewards();
  await engine.drainSettlements();
}

test("MiningEngine.distributeRewards distributes proportionally", async () => {
  const engine = new MiningEngine();
  engine.setPersistBlockRewardsCallback(async () => {});
  const minerA = engine.createOrGetMiner({ userId: 101, username: "alpha", profile: { rigs: 1, baseHashRate: 10 } });
  const minerB = engine.createOrGetMiner({ userId: 202, username: "beta", profile: { rigs: 1, baseHashRate: 20 } });

  engine.roundWork.set(minerA.id, 100);
  engine.roundWork.set(minerB.id, 300);
  engine.activeMiners = 2;

  await settle(engine);

  // rewardBase is 0.30 POL; shares follow roundWork (100 : 300)
  assert.ok(Math.abs(minerA.balance - 0.075) < 1e-12);
  assert.ok(Math.abs(minerB.balance - 0.225) < 1e-12);
  assert.equal(engine.blockNumber, 2);
  assert.equal(engine.lastReward, 0.3);
});

test("MiningEngine.distributeRewards handles zero-work round", async () => {
  const engine = new MiningEngine();
  engine.setPersistBlockRewardsCallback(async () => {});
  const miner = engine.createOrGetMiner({ userId: 303, username: "idle", profile: { rigs: 1, baseHashRate: 0 } });

  engine.roundWork.set(miner.id, 0);
  engine.activeMiners = 0;

  await settle(engine);

  assert.equal(miner.balance, 0);
  assert.equal(engine.lastReward, 0);
  assert.equal(engine.blockNumber, 2);
});

test("MiningEngine.distributeRewards rollback restores balance when persist fails", async () => {
  const prevMax = process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = "1";
  try {
    const engine = new MiningEngine();
    const miner = engine.createOrGetMiner({
      userId: 404,
      username: "persist_fail",
      profile: { rigs: 1, base_hash_rate: 10, balance: 5 },
    });
    miner.balance = 5;
    miner.lastPersistedBalance = 5;

    engine.roundWork.set(miner.id, 100);
    engine.activeMiners = 1;
    engine.setPersistBlockRewardsCallback(() => Promise.reject(new Error("simulated DB failure")));

    await settle(engine);

    assert.ok(Math.abs(miner.balance - 5) < 1e-12, "balance must revert so persist does not apply a bogus negative delta");
    assert.ok(Math.abs(miner.lastPersistedBalance - 5) < 1e-12, "lastPersistedBalance must revert with balance");
    assert.equal(engine.blockNumber, 2, "block schedule must advance so ticks do not freeze at countdown 0");
    assert.ok(engine.nextBlockAt > Date.now(), "nextBlockAt must move into the future after a failed persist");
  } finally {
    if (prevMax !== undefined) process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = prevMax;
    else delete process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  }
});

test("rollback subtracts only this block's delta, preserving concurrent credits", async () => {
  const prevMax = process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = "1";
  try {
    const engine = new MiningEngine();
    const miner = engine.createOrGetMiner({
      userId: 707,
      username: "concurrent",
      profile: { rigs: 1, base_hash_rate: 10, balance: 10 },
    });
    miner.balance = 10;
    miner.lastPersistedBalance = 10;
    engine.roundWork.set(miner.id, 100);
    engine.activeMiners = 1;

    let releaseFailure;
    const failureGate = new Promise((resolve) => {
      releaseFailure = resolve;
    });
    engine.setPersistBlockRewardsCallback(async () => {
      await failureGate;
      throw new Error("late DB failure");
    });

    engine.distributeRewards();
    assert.ok(Math.abs(miner.balance - 10.3) < 1e-12, "block reward credited immediately");

    // A purchase or other credit lands while the write is still in flight.
    miner.balance += 7;
    releaseFailure();
    await engine.drainSettlements();

    assert.ok(
      Math.abs(miner.balance - 17) < 1e-9,
      `expected the 7 credited mid-flight to survive the rollback, got ${miner.balance}`,
    );
  } finally {
    if (prevMax !== undefined) process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = prevMax;
    else delete process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  }
});

test("settlements never run concurrently", async () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({
    userId: 808,
    username: "serial",
    profile: { rigs: 1, base_hash_rate: 10, balance: 0 },
  });
  engine.activeMiners = 1;

  let inFlight = 0;
  let maxInFlight = 0;
  engine.setPersistBlockRewardsCallback(async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight -= 1;
  });

  const blockNumbers = [];
  for (let i = 0; i < 4; i += 1) {
    engine.roundWork.set(miner.id, 100);
    blockNumbers.push(engine.blockNumber);
    engine.distributeRewards();
  }
  await engine.drainSettlements();

  assert.equal(maxInFlight, 1, "two settlements at once would double-pay work and collide on block_number");
  assert.deepEqual(blockNumbers, [1, 2, 3, 4], "each settle must consume its own block number");
  assert.equal(engine.blockNumber, 5);
});

test("a duplicate block_number is treated as an already-committed block, not a failure", async () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({
    userId: 909,
    username: "idempotent",
    profile: { rigs: 1, base_hash_rate: 10, balance: 2 },
  });
  miner.balance = 2;
  engine.roundWork.set(miner.id, 100);
  engine.activeMiners = 1;

  engine.setPersistBlockRewardsCallback(async () => {
    const err = new Error("Unique constraint failed");
    err.code = "P2002";
    err.meta = { target: ["block_number"] };
    throw err;
  });

  await settle(engine);

  assert.ok(Math.abs(miner.balance - 2.3) < 1e-12, "the reward must stand — the row is already in the database");
});

test("block schedule lands on wall-clock boundaries", async () => {
  const engine = new MiningEngine();
  engine.setPersistBlockRewardsCallback(async () => {});
  const miner = engine.createOrGetMiner({
    userId: 1010,
    username: "clock",
    profile: { rigs: 1, base_hash_rate: 10, balance: 0 },
  });

  assert.equal(engine.nextBlockAt % engine.blockDurationMs, 0, "constructor must anchor to the clock, not to boot time");
  assert.ok(engine.nextBlockAt > Date.now());

  engine.roundWork.set(miner.id, 100);
  engine.activeMiners = 1;
  await settle(engine);

  assert.equal(engine.nextBlockAt % engine.blockDurationMs, 0, "settling must re-anchor to the clock");
  assert.ok(engine.nextBlockAt > Date.now());
});

test("MiningEngine retries persist on transient failure", async () => {
  const prevMax = process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  const prevBase = process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS;
  process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = "4";
  process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS = "1";
  try {
    const engine = new MiningEngine();
    const miner = engine.createOrGetMiner({
      userId: 606,
      username: "retry_ok",
      profile: { rigs: 1, base_hash_rate: 10, balance: 1 },
    });
    miner.balance = 1;
    miner.lastPersistedBalance = 1;
    engine.roundWork.set(miner.id, 100);
    engine.activeMiners = 1;
    let calls = 0;
    engine.setPersistBlockRewardsCallback(async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
    });
    await settle(engine);
    assert.equal(calls, 2);
    assert.ok(miner.balance > 1);
    assert.equal(engine.blockNumber, 2);
  } finally {
    if (prevMax !== undefined) process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = prevMax;
    else delete process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
    if (prevBase !== undefined) process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS = prevBase;
    else delete process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS;
  }
});

test("MiningEngine.getPublicState omits leaderboard by default and only includes it on demand", () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({
    userId: 505,
    username: "leader",
    profile: { rigs: 1, base_hash_rate: 25, balance: 1.5 },
  });

  const defaultState = engine.getPublicState(miner.id);
  assert.equal(Object.prototype.hasOwnProperty.call(defaultState, "leaderboard"), false);

  const withLeaderboard = engine.getPublicState(miner.id, { includeLeaderboard: true });
  assert.equal(Array.isArray(withLeaderboard.leaderboard), true);
  assert.equal(withLeaderboard.leaderboard[0]?.username, "leader");
});

test("dual-pool: SHIB and POL split by miningAllocationPolBps independently", async () => {
  const engine = new MiningEngine();
  engine.setPersistBlockRewardsCallback(async () => {});
  // miner A: 100% POL. miner B: 0% POL (100% SHIB). Equal raw work.
  const minerA = engine.createOrGetMiner({
    userId: 1,
    username: "pol-only",
    profile: { base_hash_rate: 10, mining_allocation_pol_bps: 10000 },
  });
  const minerB = engine.createOrGetMiner({
    userId: 2,
    username: "shib-only",
    profile: { base_hash_rate: 10, mining_allocation_pol_bps: 0 },
  });

  engine.roundWork.set(minerA.id, 100);
  engine.roundWork.set(minerB.id, 100);
  engine.activeMiners = 2;

  await settle(engine);

  // All POL reward goes to A (100% of totalWorkPol), all SHIB reward goes to B.
  assert.ok(Math.abs(minerA.balance - engine.blockHistory[0].reward) < 1e-9);
  assert.equal(minerB.balance, 0);
  assert.ok(Math.abs(minerB.shibBalance - engine.blockHistory[0].rewardShib) < 1e-9);
  assert.equal(minerA.shibBalance, 0);
});
