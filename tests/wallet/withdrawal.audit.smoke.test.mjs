import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

const { walletAdminRouter } = await import(
  "../../server/modules/wallet/wallet.admin.routes.ts"
);
const repo = await import(
  "../../server/modules/wallet/withdrawal/withdrawal.repository.ts"
);

function executeRoute(router, { method = "POST", url = "", body = {} } = {}) {
  const jwtSecret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const token = jwt.sign(
    { role: "admin", type: "admin_session" },
    jwtSecret,
    { issuer: "blockminer-admin", algorithm: "HS256" }
  );

  return new Promise((resolve) => {
    let statusCode = 200;
    let sentData = null;

    const req = {
      method,
      url,
      body,
      ip: "127.0.0.1",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "withdrawal-audit-tester/1.0",
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      },
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        sentData = data;
        resolve({ statusCode, data: sentData });
        return this;
      },
      send(data) {
        sentData = data;
        resolve({ statusCode, data: sentData });
        return this;
      },
    };

    router.handle(req, res, (err) => {
      if (err) {
        resolve({ statusCode: 500, error: err });
      } else {
        resolve({ statusCode, data: sentData });
      }
    });
  });
}

test("Smoke: Admin Actions Audit Trail (Approve, Reject, Complete emit real audit logs)", async () => {
  const { default: prismaPkg } = await import("@prisma/client");
  const Decimal = prismaPkg.Prisma.Decimal;

  // 1. Create a dummy test user with balance
  const testEmail = `audit-tester-${Date.now()}@blockminer.space`;
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      username: `audittester_${Date.now()}`,
      name: "Audit Tester",
      passwordHash: "dummyhash",
      polBalance: "200",
      shibBalance: "1000",
    },
  });

  try {
    // 2. Test Reject Action with Audit Log
    const tx1 = await repo.createWithdrawal(
      user.id,
      new Decimal("10"),
      "0x" + "1".repeat(40),
      new Decimal("0.25")
    );

    const rejectRes = await executeRoute(walletAdminRouter, {
      method: "POST",
      url: `/wallet/withdrawals/${tx1.id}/reject`,
    });
    assert.equal(rejectRes.statusCode, 200);

    // Give async logAdminAction a brief moment
    await new Promise((r) => setTimeout(r, 200));

    const rejectAudit = await prisma.adminAuditLog.findFirst({
      where: {
        action: "admin_withdrawal_rejected",
        module: "wallet",
        resourceId: String(tx1.id),
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(rejectAudit, "Deveria ter registrado audit log para reject");
    assert.equal(rejectAudit.action, "admin_withdrawal_rejected");

    // 3. Test Complete Action with Audit Log
    const tx2 = await repo.createWithdrawal(
      user.id,
      new Decimal("15"),
      "0x" + "2".repeat(40),
      new Decimal("0.375")
    );

    const testTxHash = "0x" + "a".repeat(64);
    const completeRes = await executeRoute(walletAdminRouter, {
      method: "POST",
      url: `/wallet/withdrawals/${tx2.id}/complete`,
      body: { txHash: testTxHash },
    });
    assert.equal(completeRes.statusCode, 200);

    await new Promise((r) => setTimeout(r, 200));

    const completeAudit = await prisma.adminAuditLog.findFirst({
      where: {
        action: "admin_withdrawal_completed",
        module: "wallet",
        resourceId: String(tx2.id),
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(completeAudit, "Deveria ter registrado audit log para complete");
    assert.equal(completeAudit.action, "admin_withdrawal_completed");
  } finally {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
