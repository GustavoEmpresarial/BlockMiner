import test from "node:test";
import assert from "node:assert/strict";

const ctrl = await import("../../server/modules/tournaments/tournaments.admin.controller.ts");
const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

function createMockReqRes({
  admin = { id: 1, email: "smoke-admin@test.com", role: "admin", permissions: ["tournaments"] },
  params = {},
  body = {},
  query = {},
  ip = "127.0.0.1",
} = {}) {
  let statusCode = 200;
  let sentData = null;

  const req = {
    admin,
    params,
    body,
    query,
    ip,
    headers: { "user-agent": "audit-smoke-agent/1.0" },
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
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return sentData;
    },
  };

  return { req, res };
}

test("Smoke: Tournament Admin Lifecycle & Audit Log Persistence", async () => {
  const existingAdmin = (await prisma.adminUser.findFirst()) || {
    id: null,
    email: "smoke-admin@test.com",
    role: "admin",
    permissions: ["tournaments"],
  };

  const adminCtx = {
    id: existingAdmin.id,
    email: existingAdmin.email,
    role: "admin",
    permissions: ["tournaments"],
  };

  let createdId = null;
  const start = new Date(Date.now() + 60_000);
  const end = new Date(Date.now() + 86_400_000);

  try {
    // 1. Create Tournament
    const createReqRes = createMockReqRes({
      admin: adminCtx,
      body: {
        name: `Smoke Audit Tournament ${Date.now()}`,
        description: "Tournament created for audit logging verification",
        type: "CUSTOM",
        metric: "FAUCET",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        recurring: false,
        prizes: [
          { rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 25 },
        ],
      },
    });

    await ctrl.create(createReqRes.req, createReqRes.res);
    assert.equal(createReqRes.res.getStatusCode(), 200);
    const createdData = createReqRes.res.getData();
    assert.equal(createdData.ok, true);
    assert.ok(createdData.tournament?.id);
    createdId = createdData.tournament.id;

    // 2. Update Tournament
    const updateReqRes = createMockReqRes({
      admin: adminCtx,
      params: { id: String(createdId) },
      body: {
        description: "Updated description for audit check",
      },
    });

    await ctrl.update(updateReqRes.req, updateReqRes.res);
    assert.equal(updateReqRes.res.getStatusCode(), 200);
    assert.equal(updateReqRes.res.getData().ok, true);

    // 3. Cancel Tournament
    const cancelReqRes = createMockReqRes({
      admin: adminCtx,
      params: { id: String(createdId) },
    });

    await ctrl.cancel(cancelReqRes.req, cancelReqRes.res);
    assert.equal(cancelReqRes.res.getStatusCode(), 200);
    assert.equal(cancelReqRes.res.getData().ok, true);

    // 4. Verify Audit Logs
    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        resource: "tournament",
        resourceId: String(createdId),
      },
    });

    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes("admin_tournament_created"), "Audit should record tournament creation");
    assert.ok(actions.includes("admin_tournament_updated"), "Audit should record tournament update");
    assert.ok(actions.includes("admin_tournament_cancelled"), "Audit should record tournament cancellation");
  } finally {
    if (createdId) {
      await prisma.tournament.deleteMany({ where: { id: createdId } });
      await prisma.adminAuditLog.deleteMany({
        where: { resource: "tournament", resourceId: String(createdId) },
      });
    }
    await prisma.$disconnect();
  }
});
