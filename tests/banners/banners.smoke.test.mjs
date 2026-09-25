import test from "node:test";
import assert from "node:assert/strict";

const bannersController = await import(
  "../../server/modules/banners/banners.controller.ts"
);
const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

function createMockReqRes({
  admin = { id: 99, email: "smoke-admin@test.com", role: "admin", permissions: ["banners"] },
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
    headers: { "user-agent": "smoke-tester/1.0" },
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

test("Smoke: Full Banner Lifecycle (Create -> List -> Public View -> Deactivate -> Public Hidden -> Delete -> 404)", async () => {
  const existingAdmin = (await prisma.adminUser.findFirst()) || {
    id: null,
    email: "smoke-admin@test.com",
    role: "admin",
    permissions: ["banners"],
  };

  const adminUser = {
    id: existingAdmin.id,
    email: existingAdmin.email,
    role: "admin",
    permissions: ["banners"],
  };

  const testTitle = `Smoke Banner ${Date.now()}`;
  let bannerId = null;

  try {
    // 1. Create Banner
    const createReqRes = createMockReqRes({
      admin: adminUser,
      body: {
        title: testTitle,
        message: "Mensagem do banner de teste smoke",
        type: "promo",
        link: "/shop",
        linkLabel: "Comprar Agora",
        isActive: true,
      },
    });

    await bannersController.adminCreate(createReqRes.req, createReqRes.res);
    assert.equal(createReqRes.res.getStatusCode(), 201);
    const createdData = createReqRes.res.getData();
    assert.equal(createdData.ok, true);
    assert.ok(createdData.banner?.id);
    bannerId = createdData.banner.id;

    // 2. Admin List contains created banner
    const listReqRes = createMockReqRes({ admin: adminUser });
    await bannersController.adminList(listReqRes.req, listReqRes.res);
    assert.equal(listReqRes.res.getStatusCode(), 200);
    const adminBanners = listReqRes.res.getData().banners;
    assert.ok(adminBanners.some((b) => b.id === bannerId));

    // 3. Public getActiveBanners returns the banner
    const publicReqRes = createMockReqRes();
    await bannersController.getActiveBanners(publicReqRes.req, publicReqRes.res);
    assert.equal(publicReqRes.res.getStatusCode(), 200);
    const activeBanners = publicReqRes.res.getData().banners;
    assert.ok(activeBanners.some((b) => b.id === bannerId));

    // 4. Update banner to isActive: false
    const updateReqRes = createMockReqRes({
      admin: adminUser,
      params: { id: String(bannerId) },
      body: { isActive: false, title: `${testTitle} (Desativado)` },
    });
    await bannersController.adminUpdate(updateReqRes.req, updateReqRes.res);
    assert.equal(updateReqRes.res.getStatusCode(), 200);
    assert.equal(updateReqRes.res.getData().ok, true);

    // 5. Public getActiveBanners NO LONGER returns the deactivated banner
    const publicReqRes2 = createMockReqRes();
    await bannersController.getActiveBanners(publicReqRes2.req, publicReqRes2.res);
    assert.equal(publicReqRes2.res.getStatusCode(), 200);
    const activeBannersAfter = publicReqRes2.res.getData().banners;
    assert.ok(!activeBannersAfter.some((b) => b.id === bannerId));

    // 6. Delete the banner
    const deleteReqRes = createMockReqRes({
      admin: adminUser,
      params: { id: String(bannerId) },
    });
    await bannersController.adminDelete(deleteReqRes.req, deleteReqRes.res);
    assert.equal(deleteReqRes.res.getStatusCode(), 200);
    assert.equal(deleteReqRes.res.getData().ok, true);

    // 7. Verify banner is gone (404 on subsequent update/delete)
    const notFoundReqRes = createMockReqRes({
      admin: adminUser,
      params: { id: String(bannerId) },
    });
    await bannersController.adminDelete(notFoundReqRes.req, notFoundReqRes.res);
    assert.equal(notFoundReqRes.res.getStatusCode(), 404);

    // 8. Verify audit logs were persisted for operations
    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        resource: "dashboard_banner",
        resourceId: String(bannerId),
      },
    });
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes("admin_banner_created"), "Audit should contain creation log");
    assert.ok(actions.includes("admin_banner_updated"), "Audit should contain update log");
    assert.ok(actions.includes("admin_banner_deleted"), "Audit should contain deletion log");
  } finally {
    if (bannerId) {
      await prisma.dashboardBanner.deleteMany({ where: { id: bannerId } });
      await prisma.adminAuditLog.deleteMany({
        where: { resource: "dashboard_banner", resourceId: String(bannerId) },
      });
    }
    await prisma.$disconnect();
  }
});
