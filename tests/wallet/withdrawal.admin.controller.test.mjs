import test from "node:test";
import assert from "node:assert/strict";

// Drives the real admin approve/reject/complete controllers with fake Request/Response
// objects against the real dev Postgres — same style as tests/auth/login.lockout.test.mjs.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const controller = await import("../../server/modules/wallet/withdrawal/withdrawal.controller.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `wdctl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Withdrawal Controller Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.60",
      ip: "203.0.113.60",
      userAgent: "test-agent/1.0",
      polBalance: "0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeWithdrawal(userId, overrides = {}) {
  return prisma.transaction.create({
    data: {
      userId,
      type: "withdrawal",
      amount: "10",
      fee: "0.25",
      address: "0x" + "1".repeat(40),
      status: "pending",
      fundsReserved: true,
      ...overrides,
    },
  });
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

function fakeReq({ params = {}, body = {}, ip = "127.0.0.1" } = {}) {
  return {
    params,
    body,
    ip,
    get: (header) => (header === "user-agent" ? "test-agent" : null),
  };
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("adminApproveWithdrawal: happy path approves a pending withdrawal", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id);
  const res = fakeRes();
  await controller.adminApproveWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res);
  assert.equal(res.calls.status, null, "no explicit status call means express default 200");
  assert.equal(res.calls.json.ok, true);
  const fresh = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(fresh.status, "approved");
});

test("adminApproveWithdrawal: second concurrent approve on the same row responds 409", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id);

  const [res1, res2] = [fakeRes(), fakeRes()];
  await Promise.all([
    controller.adminApproveWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res1),
    controller.adminApproveWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res2),
  ]);

  const results = [res1.calls, res2.calls];
  const okCount = results.filter((c) => c.json?.ok === true).length;
  const conflictCount = results.filter((c) => c.status === 409).length;
  assert.equal(okCount, 1, "exactly one of the two concurrent approves must win");
  assert.equal(conflictCount, 1, "the loser must get a 409, not a silent success");
});

test("adminApproveWithdrawal: approving an already-approved row (sequential) responds 400 (precondition check catches it before hitting the DB guard)", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id, { status: "approved" });
  const res = fakeRes();
  await controller.adminApproveWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.ok, false);
});

test("adminRejectWithdrawal: rejects a pending withdrawal, writes status \"rejected\", and refunds the balance", async () => {
  const user = await makeUser({ polBalance: "5" });
  const row = await makeWithdrawal(user.id);
  const res = fakeRes();
  await controller.adminRejectWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res);
  assert.equal(res.calls.json.ok, true);
  const fresh = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(fresh.status, "rejected");
  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser.polBalance.toString(), "15.25"); // 5 + (10 + 0.25)
});

test("adminRejectWithdrawal: second reject attempt on an already-rejected row responds 400 (status precondition)", async () => {
  const user = await makeUser({ polBalance: "5" });
  const row = await makeWithdrawal(user.id, { status: "rejected", fundsReserved: false });
  const res = fakeRes();
  await controller.adminRejectWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) } }), res);
  assert.equal(res.calls.status, 400);
});

test("adminCompleteWithdrawal: completes an approved withdrawal with a valid tx hash", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id, { status: "approved" });
  const txHash = "0x" + "a".repeat(64);
  const res = fakeRes();
  await controller.adminCompleteWithdrawal(fakeReq({ params: { withdrawalId: String(row.id) }, body: { txHash } }), res);
  assert.equal(res.calls.json.ok, true);
  const fresh = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(fresh.status, "completed");
  assert.equal(fresh.txHash, txHash);
});

test("adminCompleteWithdrawal: rejects an invalid tx hash with 400, never touches the row", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id, { status: "approved" });
  const res = fakeRes();
  await controller.adminCompleteWithdrawal(
    fakeReq({ params: { withdrawalId: String(row.id) }, body: { txHash: "not-a-hash" } }),
    res,
  );
  assert.equal(res.calls.status, 400);
  const fresh = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(fresh.status, "approved", "an invalid tx hash must never transition the row");
});

test("adminCompleteWithdrawal: completing an already-completed row responds 400", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await makeWithdrawal(user.id, { status: "completed", txHash: "0x" + "b".repeat(64) });
  const res = fakeRes();
  await controller.adminCompleteWithdrawal(
    fakeReq({ params: { withdrawalId: String(row.id) }, body: { txHash: "0x" + "c".repeat(64) } }),
    res,
  );
  assert.equal(res.calls.status, 400);
});

test("adminListPendingWithdrawals: returns active + recent rows with numeric amounts", async () => {
  const user = await makeUser({ polBalance: "50" });
  await makeWithdrawal(user.id);
  const res = fakeRes();
  await controller.adminListPendingWithdrawals(fakeReq(), res);
  assert.equal(res.calls.json.ok, true);
  assert.ok(Array.isArray(res.calls.json.withdrawals));
  const mine = res.calls.json.withdrawals.find((w) => w.userId === user.id);
  assert.ok(mine, "the withdrawal we just created must appear in the admin queue");
  assert.equal(typeof mine.amount, "number", "amount must be serialized as a plain number, not a Decimal object");
});
