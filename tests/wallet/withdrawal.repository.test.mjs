import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration tests for withdrawal.repository.ts's admin transitions
// (markWithdrawalApproved/Rejected/Completed) and the financial invariants around
// them: atomic status guards, balance reserve/refund correctness (POL vs SHIB),
// and Decimal-precision fee math. Same style as withdrawal.fee-info.integration.test.mjs.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const repo = await import("../../server/modules/wallet/withdrawal/withdrawal.repository.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `wdrepo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Withdrawal Repo Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.50",
      ip: "203.0.113.50",
      userAgent: "test-agent/1.0",
      polBalance: "0",
      shibBalance: "0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("createWithdrawal reserves amount+fee atomically from polBalance", async () => {
  const user = await makeUser({ polBalance: "100" });
  const { default: prismaPkg } = await import("@prisma/client");
  const Decimal = prismaPkg.Prisma.Decimal;
  const row = await repo.createWithdrawal(user.id, new Decimal("20"), "0x" + "1".repeat(40), new Decimal("0.5"));
  assert.equal(row.status, "approved");
  assert.equal(row.fundsReserved, true);
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(fresh.polBalance.toString(), "79.5"); // 100 - (20 + 0.5)
});

test("markWithdrawalApproved: only transitions from pending, second call loses the race", async () => {
  const user = await makeUser({ polBalance: "50" });
  const row = await prisma.transaction.create({
    data: { userId: user.id, type: "withdrawal", amount: "10", fee: "0.25", address: "0x" + "2".repeat(40), status: "pending", fundsReserved: true },
  });

  const first = await repo.markWithdrawalApproved(row.id);
  assert.equal(first, true);
  const second = await repo.markWithdrawalApproved(row.id);
  assert.equal(second, false, "already approved — a second approve must lose the atomic guard");

  const fresh = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(fresh.status, "approved");
});

test("markWithdrawalRejected: writes status \"rejected\" (not \"failed\") and refunds amount+fee to polBalance exactly once", async () => {
  const user = await makeUser({ polBalance: "10" });
  const row = await prisma.transaction.create({
    data: { userId: user.id, type: "withdrawal", amount: "10", fee: "0.25", address: "0x" + "3".repeat(40), status: "pending", fundsReserved: true },
  });

  const applied = await repo.markWithdrawalRejected(row.id);
  assert.equal(applied, true);

  const freshRow = await prisma.transaction.findUnique({ where: { id: row.id } });
  assert.equal(freshRow.status, "rejected");
  assert.equal(freshRow.fundsReserved, false);

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser.polBalance.toString(), "20.25"); // 10 + (10 + 0.25) refunded

  // Idempotency / no double refund: rejecting an already-rejected row must be a no-op.
  const second = await repo.markWithdrawalRejected(row.id);
  assert.equal(second, false);
  const userAfterSecond = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(userAfterSecond.polBalance.toString(), "20.25", "must not refund twice");
});

test("markWithdrawalRejected on a SHIB withdrawal refunds shibBalance, not polBalance", async () => {
  const user = await makeUser({ polBalance: "5", shibBalance: "1000" });
  const row = await prisma.transaction.create({
    data: { userId: user.id, type: "shib_withdrawal", amount: "500", fee: "7800", address: "0x" + "4".repeat(40), status: "pending", fundsReserved: true },
  });

  await repo.markWithdrawalRejected(row.id);

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser.polBalance.toString(), "5", "POL balance must be untouched");
  assert.equal(freshUser.shibBalance.toString(), "9300", "1000 + (500 + 7800) refunded");
});

test("markWithdrawalCompleted: only transitions from pending/approved, returns null on a lost race", async () => {
  const user = await makeUser({ polBalance: "30" });
  const row = await prisma.transaction.create({
    data: { userId: user.id, type: "withdrawal", amount: "10", fee: "0.25", address: "0x" + "5".repeat(40), status: "approved", fundsReserved: true },
  });

  const completed = await repo.markWithdrawalCompleted(row.id, "0x" + "a".repeat(64));
  assert.ok(completed, "first complete call must succeed");
  assert.equal(completed.status, "completed");
  assert.equal(completed.txHash, "0x" + "a".repeat(64));

  const second = await repo.markWithdrawalCompleted(row.id, "0x" + "b".repeat(64));
  assert.equal(second, null, "completing an already-completed withdrawal must be rejected by the guard");
});

test("markWithdrawalCompleted never refunds — funds stay deducted", async () => {
  const user = await makeUser({ polBalance: "30" });
  const row = await prisma.transaction.create({
    data: { userId: user.id, type: "withdrawal", amount: "10", fee: "0.25", address: "0x" + "6".repeat(40), status: "pending", fundsReserved: true },
  });
  await repo.markWithdrawalCompleted(row.id, "0x" + "c".repeat(64));
  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser.polBalance.toString(), "30", "balance was already deducted at creation time, completing must not touch it again");
});

test("submitWithdrawalRequest: 2.5% fee is computed via Decimal (8 dp), not float, for a non-round amount", async () => {
  const user = await makeUser({ polBalance: "1000" });
  const withdrawalService = await import("../../server/modules/wallet/withdrawal/withdrawal.service.ts");
  const row = await withdrawalService.submitWithdrawalRequest(user.id, 33.33333333, "0x" + "7".repeat(40));
  // 33.33333333 * 2.5 / 100 = 0.833333333325 -> toDecimalPlaces(8) = 0.83333333
  assert.equal(row.fee.toString(), "0.83333333");
  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser.polBalance.toString(), "965.83333334"); // 1000 - 33.33333333 - 0.83333333
});
