import test from "node:test";
import assert from "node:assert/strict";

const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

const repo = await import(
  "../../server/modules/wallet/withdrawal/withdrawal.repository.ts"
);
const service = await import(
  "../../server/modules/wallet/withdrawal/withdrawal.service.ts"
);

test("Smoke: Direct Approved Flow (Withdrawal is created as approved and picked up by auto-send query immediately)", async () => {
  const { default: prismaPkg } = await import("@prisma/client");
  const Decimal = prismaPkg.Prisma.Decimal;

  const testEmail = `auto-send-user-${Date.now()}@blockminer.space`;
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      username: `autosend_${Date.now()}`,
      name: "Auto Send Tester",
      passwordHash: "dummyhash",
      polBalance: "50",
      shibBalance: "5000",
    },
  });

  try {
    // 1. Submit POL withdrawal request
    const polAddress = "0x" + "7".repeat(40);
    const polTx = await service.submitWithdrawalRequest(user.id, 10, polAddress);

    assert.ok(polTx);
    assert.equal(polTx.status, "approved");
    assert.equal(polTx.fundsReserved, true);

    // Verify DB row directly
    const dbTx = await prisma.transaction.findUnique({
      where: { id: polTx.id },
    });
    assert.ok(dbTx);
    assert.equal(dbTx.status, "approved");

    // 2. Verify that getApprovedWithdrawalsForAutoSend immediately picks it up
    const queue = await repo.getApprovedWithdrawalsForAutoSend();
    const foundInQueue = queue.find((t) => t.id === polTx.id);

    assert.ok(foundInQueue, "Saque recém-criado deve estar imediatamente na fila de auto-send");
    assert.equal(foundInQueue.status, "approved");
    assert.equal(foundInQueue.address, polAddress);
  } finally {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
