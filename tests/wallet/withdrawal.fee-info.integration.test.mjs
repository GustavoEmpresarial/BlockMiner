import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433) for GET /wallet/withdraw-fee-info's
// service layer — pure calculation/estimation, no private key involved.
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const withdrawalService = await import("../../server/modules/wallet/withdrawal/withdrawal.service.ts");

const createdUserIds = [];

async function makeUser() {
  const suffix = `feeinfo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Fee Info Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.42",
      ip: "203.0.113.42",
      userAgent: "test-agent/1.0",
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

test("getWithdrawalFeeInfo returns the base fee with no waiver for a fresh user", async () => {
  const user = await makeUser();
  const info = await withdrawalService.getWithdrawalFeeInfo(user.id);
  assert.equal(info.feePercent, 2.5);
  assert.equal(info.feeWaived, false);
  assert.equal(info.completionsToday, 0);
  assert.equal(info.requiredForWaiver, 10);
  assert.equal(info.feeAlreadyChargedToday, false);
});

test("getWithdrawalFeeInfo reports feeAlreadyChargedToday once a fee-bearing withdrawal exists today", async () => {
  const user = await makeUser();
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "withdrawal",
      amount: "20",
      fee: "0.5",
      address: "0x" + "1".repeat(40),
      status: "pending",
    },
  });
  const info = await withdrawalService.getWithdrawalFeeInfo(user.id);
  assert.equal(info.feeAlreadyChargedToday, true);
});
