import test from "node:test";
import assert from "node:assert/strict";
import { MiningEngine, ALLOCATION_BPS_MAX } from "../../server/modules/mining/mining.engine.ts";

test("createOrGetMiner is idempotent per userId and updates mutable fields", () => {
  const engine = new MiningEngine();
  const m1 = engine.createOrGetMiner({ userId: 1, username: "a", profile: { rigs: 1, base_hash_rate: 5 } });
  const m2 = engine.createOrGetMiner({ userId: 1, username: "a-renamed", profile: { rigs: 2, base_hash_rate: 8 } });
  assert.equal(m1.id, m2.id);
  assert.equal(m2.username, "a-renamed");
  assert.equal(m2.rigs, 2);
  assert.equal(m2.baseHashRate, 8);
  assert.equal(engine.miners.size, 1);
});

test("createOrGetMiner defaults allocation to 100% POL", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 2, username: "b" });
  assert.equal(m.miningAllocationPolBps, ALLOCATION_BPS_MAX);
});

test("setActive/setConnected/setWallet mutate the right miner and no-op on unknown id", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 3, username: "c" });

  assert.equal(engine.setActive("missing", true), null);
  const active = engine.setActive(m.id, false);
  assert.equal(active.active, false);

  engine.setConnected(m.id, true);
  assert.equal(m.connected, true);
  engine.setConnected("missing", true); // no throw

  assert.equal(engine.setWallet("missing", "0xabc"), null);
  const walleted = engine.setWallet(m.id, "0xabc");
  assert.equal(walleted.walletAddress, "0xabc");
});

test("setMinerAllocation normalizes and reports the complementary SHIB bps", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 4, username: "d" });

  const missing = engine.setMinerAllocation("missing", 5000);
  assert.equal(missing.ok, false);

  const outcome = engine.setMinerAllocation(m.id, 2600);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.polBps, 2500);
  assert.equal(outcome.shibBps, ALLOCATION_BPS_MAX - 2500);
  assert.equal(m.miningAllocationPolBps, 2500);
});

test("createOrGetMiner profile merge mirrors the DB and adds back the pending (not-yet-persisted) delta", () => {
  // This is the fix documented in the legacy engine: naive max(db, engine) got stuck when the
  // DB balance DROPPED (a spend) because it refused to move down. The correct behavior mirrors
  // the DB and re-adds whatever reward hasn't been flushed yet.
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 5, username: "e", profile: { balance: 10 } });
  assert.equal(m.balance, 10);
  assert.equal(m.lastPersistedBalance, 10);

  // Simulate an unsettled block reward: balance moves ahead of lastPersistedBalance.
  m.balance = 10.5; // +0.5 pending reward, lastPersistedBalance still 10

  // DB balance drops to 3 (a purchase settled directly against the DB, e.g. shop).
  engine.createOrGetMiner({ userId: 5, username: "e", profile: { balance: 3 } });
  assert.ok(Math.abs(m.balance - 3.5) < 1e-9, "engine balance must mirror new DB value + pending reward, not get stuck at old high-water mark");
  assert.equal(m.lastPersistedBalance, 3);
});

test("reloadMinerProfile with forceBalanceSync mirrors the DB 1:1, dropping any pending delta", async () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 6, username: "f", profile: { balance: 10 } });
  m.balance = 10.5;

  engine.setProfileLoader(async () => ({ balance: 4, rigs: 1, base_hash_rate: 0 }));
  await engine.reloadMinerProfile(6, { forceBalanceSync: true });

  assert.equal(m.balance, 4);
  assert.equal(m.lastPersistedBalance, 4);
});

test("applyBoost costs 0.35, sets x1.25 for 30s, and fails on insufficient balance", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 7, username: "g", profile: { balance: 0.1 } });

  const insufficient = engine.applyBoost(m.id);
  assert.equal(insufficient.ok, false);

  m.balance = 1;
  const before = Date.now();
  const ok = engine.applyBoost(m.id);
  assert.equal(ok.ok, true);
  assert.ok(Math.abs(m.balance - 0.65) < 1e-12);
  assert.equal(m.boostMultiplier, 1.25);
  assert.ok(m.boostEndsAt >= before + 30000);

  assert.equal(engine.applyBoost("missing").ok, false);
});

test("upgradeRig costs 2 + (rigs-1)*0.8 and adds +18 hashrate", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 8, username: "h", profile: { balance: 0.5, rigs: 1, base_hash_rate: 10 } });

  const insufficient = engine.upgradeRig(m.id);
  assert.equal(insufficient.ok, false);

  m.balance = 10;
  const ok = engine.upgradeRig(m.id);
  assert.equal(ok.ok, true);
  assert.equal(m.rigs, 2);
  assert.equal(m.baseHashRate, 28);
  assert.ok(Math.abs(m.balance - 8) < 1e-12); // 10 - 2

  // Second upgrade: cost = 2 + (2-1)*0.8 = 2.8
  const ok2 = engine.upgradeRig(m.id);
  assert.equal(ok2.ok, true);
  assert.equal(m.rigs, 3);
  assert.ok(Math.abs(m.balance - 5.2) < 1e-9);

  assert.equal(engine.upgradeRig("missing").ok, false);
});

test("getMinerHashRate is zero when inactive and applies boostMultiplier when active", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 9, username: "i", profile: { base_hash_rate: 10 } });
  assert.equal(engine.getMinerHashRate(m), 10);
  m.active = false;
  assert.equal(engine.getMinerHashRate(m), 0);
  m.active = true;
  m.boostMultiplier = 1.25;
  assert.equal(engine.getMinerHashRate(m), 12.5);
});

test("tickAsync accrues roundWork and expires boosts", async () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 10, username: "j", profile: { base_hash_rate: 10 } });
  m.boostMultiplier = 1.25;
  m.boostEndsAt = Date.now() - 1; // already expired

  await engine.tickAsync();

  assert.equal(m.boostMultiplier, 1);
  assert.equal(m.boostEndsAt, 0);
  assert.equal(engine.roundWork.get(m.id), 10); // boost expired before hashrate computed this tick
  assert.equal(engine.activeMiners, 1);
  assert.equal(engine.currentNetworkHashRate, 10);
});
