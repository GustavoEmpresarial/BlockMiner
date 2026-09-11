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
