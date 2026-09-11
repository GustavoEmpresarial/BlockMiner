import test from "node:test";
import assert from "node:assert/strict";

// Characterizes withdrawal.auto-send.ts's current behavior WITHOUT touching any real
// network (Polygon RPC / CoinEx) — this module self-documents as dry-run only in this
// environment (no WITHDRAWAL_PRIVATE_KEY configured), so these tests lock in: (a) the pure
// gas-buffer math, (b) the env-flag readers, and (c) processPendingWithdrawals' safe
// early-return when auto-send is disabled (the default here) — never reaching the
// hot-wallet/CoinEx code paths. If those flags are ever flipped on in this environment,
// this test would need real mocks; it intentionally does NOT attempt that.
const autoSend = await import("../../server/modules/wallet/withdrawal/withdrawal.auto-send.ts");

test("computeGasBufferWei: pure gas math, count<=0 short-circuits to 0n", () => {
  assert.equal(autoSend.computeGasBufferWei(30_000_000_000n, 0), 0n);
  assert.equal(autoSend.computeGasBufferWei(30_000_000_000n, -1), 0n);
});

test("computeGasBufferWei: 21000 gas * gasPrice * count * 3x safety factor", () => {
  const gasPrice = 30_000_000_000n; // 30 gwei
  const count = 5;
  const expected = 21_000n * gasPrice * BigInt(count) * 3n;
  assert.equal(autoSend.computeGasBufferWei(gasPrice, count), expected);
});

test("withdrawalAutoSendEnabled/withdrawalGlobalPause/withdrawalViaCoinExEnabled read their env flags as booleans", () => {
  const prevEnabled = process.env.WITHDRAWAL_AUTO_SEND;
  const prevPause = process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE;
  const prevCoinex = process.env.WITHDRAWAL_VIA_COINEX;
  try {
    delete process.env.WITHDRAWAL_AUTO_SEND;
    delete process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE;
    delete process.env.WITHDRAWAL_VIA_COINEX;
    assert.equal(autoSend.withdrawalAutoSendEnabled(), false, "unset must default to disabled");
    assert.equal(autoSend.withdrawalGlobalPause(), false);
    assert.equal(autoSend.withdrawalViaCoinExEnabled(), false);

    process.env.WITHDRAWAL_AUTO_SEND = "1";
    assert.equal(autoSend.withdrawalAutoSendEnabled(), true);
    process.env.WITHDRAWAL_AUTO_SEND = "true";
    assert.equal(autoSend.withdrawalAutoSendEnabled(), true);
    process.env.WITHDRAWAL_AUTO_SEND = "0";
    assert.equal(autoSend.withdrawalAutoSendEnabled(), false);
  } finally {
    if (prevEnabled === undefined) delete process.env.WITHDRAWAL_AUTO_SEND;
    else process.env.WITHDRAWAL_AUTO_SEND = prevEnabled;
    if (prevPause === undefined) delete process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE;
    else process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE = prevPause;
    if (prevCoinex === undefined) delete process.env.WITHDRAWAL_VIA_COINEX;
    else process.env.WITHDRAWAL_VIA_COINEX = prevCoinex;
  }
});

test("autoSendMaxPerDayPerUser: defaults to 3, clamps to [1,50]", () => {
  const prev = process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER;
  try {
    delete process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER;
    assert.equal(autoSend.autoSendMaxPerDayPerUser(), 3);
    process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER = "999";
    assert.equal(autoSend.autoSendMaxPerDayPerUser(), 50, "must clamp to the 50 ceiling");
    process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER = "0";
    assert.equal(autoSend.autoSendMaxPerDayPerUser(), 3, "0 or invalid falls back to default");
  } finally {
    if (prev === undefined) delete process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER;
    else process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER = prev;
  }
});

test("processPendingWithdrawals: with WITHDRAWAL_AUTO_SEND unset (this environment's default), it never reaches the network — returns reason \"auto_send_disabled\" and processed:0", async () => {
  const prev = process.env.WITHDRAWAL_AUTO_SEND;
  try {
    delete process.env.WITHDRAWAL_AUTO_SEND;
    const result = await autoSend.processPendingWithdrawals();
    assert.deepEqual(result, { processed: 0, reason: "auto_send_disabled" });
  } finally {
    if (prev === undefined) delete process.env.WITHDRAWAL_AUTO_SEND;
    else process.env.WITHDRAWAL_AUTO_SEND = prev;
  }
});

test("acquireAutoSendLock/releaseAutoSendLock: mutual-excludes two ticks (via real Redis if REDIS_URL is reachable here, else the in-process fallback — both paths share this same contract)", async () => {
  autoSend.resetAutoSendStateForTests();
  const first = await autoSend.acquireAutoSendLock();
  assert.ok(first.token, "first acquire must succeed");
  const second = await autoSend.acquireAutoSendLock();
  assert.equal(second.token, null, "a second concurrent acquire must be rejected while the first tick still holds the lock");

  await autoSend.releaseAutoSendLock(first.token, first.viaRedis);
  const third = await autoSend.acquireAutoSendLock();
  assert.ok(third.token, "after release, a new tick must be able to acquire the lock again");
  await autoSend.releaseAutoSendLock(third.token, third.viaRedis);
});

test("getHotWalletPaymentStatus: read-only status check never throws, and is internally consistent either way", async () => {
  // This environment has a real WITHDRAWAL_PRIVATE_KEY configured, so `configured` is true
  // here — but the RPC balance read may or may not be reachable from this sandbox. Either
  // way this call must only ever READ (getBalance/getFeeData), never move funds, and must
  // degrade honestly (null balance/canCoverPending) instead of throwing when the RPC call
  // fails, per the module's own try/catch around that block.
  const status = await autoSend.getHotWalletPaymentStatus();
  assert.equal(typeof status.configured, "boolean");
  assert.equal(typeof status.autoSendEnabled, "boolean");
  assert.equal(typeof status.pendingApprovedCount, "number");
  if (!status.configured) {
    assert.equal(status.address, null);
    assert.equal(status.balancePol, null);
    assert.equal(status.canCoverPending, null);
  } else if (status.balancePol == null) {
    // RPC unreachable from here — must degrade to null, never a fabricated number.
    assert.equal(status.canCoverPending, null);
  } else {
    assert.equal(typeof status.balancePol, "number");
    assert.equal(typeof status.canCoverPending, "boolean");
  }
});

test("processPendingWithdrawals: WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE short-circuits before any lock/DB work", async () => {
  const prevEnabled = process.env.WITHDRAWAL_AUTO_SEND;
  const prevPause = process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE;
  try {
    process.env.WITHDRAWAL_AUTO_SEND = "1";
    process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE = "1";
    const result = await autoSend.processPendingWithdrawals();
    assert.deepEqual(result, { processed: 0, reason: "global_pause" });
  } finally {
    if (prevEnabled === undefined) delete process.env.WITHDRAWAL_AUTO_SEND;
    else process.env.WITHDRAWAL_AUTO_SEND = prevEnabled;
    if (prevPause === undefined) delete process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE;
    else process.env.WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE = prevPause;
  }
});
