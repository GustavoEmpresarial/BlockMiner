import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

const { faucetAdminRouter } = await import(
  "../../server/modules/faucet/faucet.admin.routes.ts"
);
const faucetService = await import(
  "../../server/modules/faucet/faucet.service.ts"
);

function executeRoute(router, { method = "GET", url = "/faucet/config", body = {} } = {}) {
  const jwtSecret = process.env.JWT_SECRET || "test-jwt-secret";
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
        "user-agent": "smoke-tester/1.0",
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

test("Smoke: Full Faucet Admin Lifecycle (Read -> Update -> Prisma Verify -> Audit Log Verify -> Public Status Reflection -> Restore)", async () => {
  const existingReward = await prisma.faucetReward.findFirst({
    where: { isActive: true },
    include: { miner: true },
    orderBy: { id: "asc" },
  });

  assert.ok(existingReward, "Deveria existir uma recompensa de faucet ativa no banco");
  assert.ok(existingReward.miner, "A recompensa de faucet deve possuir um miner associado");

  const originalState = {
    name: existingReward.miner.name,
    baseHashRate: existingReward.miner.baseHashRate,
    imageUrl: existingReward.miner.imageUrl,
    cooldownMs: existingReward.cooldownMs,
    isActive: existingReward.isActive,
  };

  const adminUser = {
    id: 999,
    email: "smoke-faucet-admin@blockminer.space",
    role: "admin",
    permissions: ["faucet"],
  };

  try {
    // 1. GET /api/admin/faucet/config
    const getRes = await executeRoute(faucetAdminRouter, {
      method: "GET",
      url: "/faucet/config",
      admin: adminUser,
    });

    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.data.ok, true);
    assert.equal(getRes.data.configured, true);
    assert.equal(getRes.data.reward.rewardId, existingReward.id);
    assert.equal(getRes.data.reward.miner.name, originalState.name);

    // 2. PUT /api/admin/faucet/config (Update)
    const testTag = `Smoke Faucet ${Date.now()}`;
    const testHashRate = 77.5;
    const testCooldownMs = 1800000; // 30 min
    const testImageUrl = "/media/miners/smoke-reward.webp";

    const putRes = await executeRoute(faucetAdminRouter, {
      method: "PUT",
      url: "/faucet/config",
      admin: adminUser,
      body: {
        name: testTag,
        baseHashRate: testHashRate,
        imageUrl: testImageUrl,
        cooldownMs: testCooldownMs,
      },
    });

    assert.equal(putRes.statusCode, 200);
    assert.equal(putRes.data.ok, true);
    assert.equal(putRes.data.reward.miner.name, testTag);
    assert.equal(putRes.data.reward.miner.baseHashRate, testHashRate);
    assert.equal(putRes.data.reward.cooldownMs, testCooldownMs);
    assert.equal(putRes.data.reward.miner.imageUrl, testImageUrl);

    // 3. Direct PostgreSQL Verification via Prisma
    const freshDbReward = await prisma.faucetReward.findUnique({
      where: { id: existingReward.id },
      include: { miner: true },
    });

    assert.ok(freshDbReward);
    assert.equal(freshDbReward.miner.name, testTag);
    assert.equal(freshDbReward.miner.baseHashRate, testHashRate);
    assert.equal(freshDbReward.cooldownMs, testCooldownMs);
    assert.equal(freshDbReward.miner.imageUrl, testImageUrl);

    // 4. Audit Log Verification
    // Give async logAdminAction a brief moment to write
    await new Promise((r) => setTimeout(r, 200));

    const auditLog = await prisma.adminAuditLog.findFirst({
      where: {
        action: "admin_faucet_config_updated",
        module: "faucet",
        resourceId: String(existingReward.id),
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(auditLog, "Deve ter registrado rastro em admin_audit_logs");
    assert.equal(auditLog.module, "faucet");

    // 5. Public Status Reflection (faucetService.getActiveReward)
    const activePublicReward = await faucetService.getActiveReward();
    assert.ok(activePublicReward);
    assert.equal(activePublicReward.miner.name, testTag);
    assert.equal(activePublicReward.miner.baseHashRate, testHashRate);
    assert.equal(activePublicReward.cooldownMs, testCooldownMs);
  } finally {
    // 6. Restore original state in database
    await prisma.$transaction([
      prisma.miner.update({
        where: { id: existingReward.miner.id },
        data: {
          name: originalState.name,
          baseHashRate: originalState.baseHashRate,
          imageUrl: originalState.imageUrl,
        },
      }),
      prisma.faucetReward.update({
        where: { id: existingReward.id },
        data: {
          cooldownMs: originalState.cooldownMs,
          isActive: originalState.isActive,
        },
      }),
    ]);

    // Verify restoration
    const restored = await prisma.faucetReward.findUnique({
      where: { id: existingReward.id },
      include: { miner: true },
    });
    assert.equal(restored.miner.name, originalState.name);
    assert.equal(restored.cooldownMs, originalState.cooldownMs);
  }
});
