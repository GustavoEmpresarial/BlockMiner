import test from "node:test";
import assert from "node:assert/strict";

// Covers the user-facing withdrawal endpoints (getWithdrawFeeInfo, requestWithdrawal,
// getShibWithdrawMin, requestShibWithdrawal) that the admin-focused test files don't
// touch — same fake req/res + real Postgres convention as the rest of this suite.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const controller = await import("../../server/modules/wallet/withdrawal/withdrawal.controller.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `wduser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Withdrawal User Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.70",
      ip: "203.0.113.70",
      userAgent: "test-agent/1.0",
      polBalance: "0",
      shibBalance: "0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function fakeRes() {
  const calls = { status: null, json: null };
  return {
    calls,
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
}

function fakeReq(user, body = {}) {
  return { user, body };
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("getWithdrawFeeInfo: 401 without a session user", async () => {
  const res = fakeRes();
  await controller.getWithdrawFeeInfo({ body: {} }, res);
  assert.equal(res.calls.status, 401);
});

test("getWithdrawFeeInfo: returns fee info for a fresh (unwaived) user", async () => {
  const user = await makeUser();
  const res = fakeRes();
  await controller.getWithdrawFeeInfo(fakeReq(user), res);
  assert.equal(res.calls.json.ok, true);
  assert.equal(res.calls.json.feePercent, 2.5);
  assert.equal(res.calls.json.feeWaived, false);
});

test("requestWithdrawal: happy path debits polBalance and returns a public DTO", async () => {
  const user = await makeUser({ polBalance: "100" });
  const res = fakeRes();
  await controller.requestWithdrawal(fakeReq(user, { amount: 20, address: "0x" + "1".repeat(40) }), res);
  assert.equal(res.calls.json.ok, true);
  assert.equal(res.calls.json.transaction.status, "pending");
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(Number(fresh.polBalance) < 100, "balance must be debited by amount+fee");
});

test("requestWithdrawal: insufficient balance responds 400 with the exact legacy message", async () => {
  const user = await makeUser({ polBalance: "1" });
  const res = fakeRes();
  await controller.requestWithdrawal(fakeReq(user, { amount: 50, address: "0x" + "2".repeat(40) }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.message, "Insufficient balance");
});

test("requestWithdrawal: a second request while one is pending responds 409", async () => {
  const user = await makeUser({ polBalance: "100" });
  const res1 = fakeRes();
  await controller.requestWithdrawal(fakeReq(user, { amount: 20, address: "0x" + "3".repeat(40) }), res1);
  assert.equal(res1.calls.json.ok, true);

  const res2 = fakeRes();
  await controller.requestWithdrawal(fakeReq(user, { amount: 20, address: "0x" + "3".repeat(40) }), res2);
  assert.equal(res2.calls.status, 409);
  assert.equal(res2.calls.json.message, "Pending withdrawal exists");
});

test("getShibWithdrawMin: returns a fee/min payload shape", async () => {
  const res = fakeRes();
  await controller.getShibWithdrawMin({}, res);
  // Either succeeds with real fields, or 503 if the live SHIB price feed is unreachable
  // in this environment — both are valid, honest outcomes; assert the contract either way.
  if (res.calls.status === 503) {
    assert.equal(res.calls.json.ok, false);
  } else {
    assert.equal(res.calls.json.ok, true);
    assert.equal(typeof res.calls.json.fee, "number");
  }
});

// submitShibWithdrawal needs a live SHIB/USD price to compute the dynamic minimum before
// it can even reach address/balance validation — in this sandboxed dev environment (no
// outbound internet) that price fetch itself fails, so the honest, environment-independent
// assertion is "never a 5xx crash, never a 2xx success" rather than pinning an exact 400 vs
// 503 split that would be flaky depending on whether the price feed happens to be reachable.
test("requestShibWithdrawal: invalid ERC20 address never succeeds and never crashes (400 if the price feed answered, 503 if not reachable here)", async () => {
  const user = await makeUser({ shibBalance: "1000000" });
  const res = fakeRes();
  await controller.requestShibWithdrawal(fakeReq(user, { amount: 100000, address: "not-an-address" }), res);
  assert.equal(res.calls.json.ok, false);
  assert.ok([400, 503].includes(res.calls.status), `expected 400 or 503, got ${res.calls.status}`);
  if (res.calls.status === 400) assert.equal(res.calls.json.message, "Invalid ERC20 address");
});

test("requestShibWithdrawal: insufficient SHIB balance never succeeds and never crashes", async () => {
  const user = await makeUser({ shibBalance: "1" });
  const res = fakeRes();
  await controller.requestShibWithdrawal(
    fakeReq(user, { amount: 5_000_000, address: "0x" + "4".repeat(40) }),
    res,
  );
  assert.equal(res.calls.json.ok, false);
  assert.ok([400, 503].includes(res.calls.status), `expected 400 or 503, got ${res.calls.status}`);
});
