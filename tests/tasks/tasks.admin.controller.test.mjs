import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const adminCtrl = await import("../../server/modules/tasks/tasks.admin.controller.ts");

function createMockRes() {
  let statusCode = 200;
  let sentData = null;

  return {
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
}

test("tasks.admin.controller: listDefinitions returns all definitions", async () => {
  const req = { admin: { adminId: 1, email: "admin@test.com" } };
  const res = createMockRes();
  await adminCtrl.listDefinitions(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.definitions));
});

test("tasks.admin.controller: createDefinition validates payload, creates task and writes audit log", async () => {
  const ts = Date.now();
  const slug = `admin-ctrl-test-${ts}`;

  // Invalid payload (empty body)
  const resBad = createMockRes();
  await adminCtrl.createDefinition({ body: {}, admin: { adminId: 1 } }, resBad);
  assert.equal(resBad.getStatusCode(), 400);

  // Missing FK (rewardMinerId does not exist)
  const resFk = createMockRes();
  await adminCtrl.createDefinition({
    body: {
      slug: `${slug}-badfk`,
      taskType: "LOGIN_DAY",
      targetValue: 1,
      translationKey: "test.key",
      rewardKind: "SHOP_MINER",
      rewardMinerId: 99999999,
    },
    admin: { adminId: 1 },
  }, resFk);
  assert.equal(resFk.getStatusCode(), 400);
  assert.match(resFk.getData()?.message, /rewardMinerId/);

  // Successful create
  const resGood = createMockRes();
  const reqGood = {
    body: {
      slug,
      taskType: "LOGIN_DAY",
      resetCadence: "DAILY",
      targetValue: 3,
      translationKey: "dailyTasks.login_3",
      rewardKind: "BLK",
      rewardBlkAmount: 2.5,
    },
    admin: { adminId: 1, email: "admin@test.com", sessionId: "sess-1" },
    ip: "127.0.0.1",
    headers: { "user-agent": "test-suite" },
  };

  await adminCtrl.createDefinition(reqGood, resGood);
  assert.equal(resGood.getStatusCode(), 201);
  assert.equal(resGood.getData()?.ok, true);
  const created = resGood.getData()?.definition;
  assert.equal(created.slug, slug);

  // Check audit log
  const audit = await prisma.adminAuditLog.findFirst({
    where: {
      action: "TASK_DEFINITION_CREATE",
      resourceId: String(created.id),
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit, "Audit log for TASK_DEFINITION_CREATE must exist");

  // Duplicate slug returns 409
  const resDup = createMockRes();
  await adminCtrl.createDefinition(reqGood, resDup);
  assert.equal(resDup.getStatusCode(), 409);

  // Cleanup
  await prisma.dailyTaskDefinition.delete({ where: { id: created.id } }).catch(() => {});
});

test("tasks.admin.controller: patchDefinition updates definition and writes audit log", async () => {
  const ts = Date.now();
  const slug = `admin-patch-test-${ts}`;

  // Pre-create definition
  const def = await prisma.dailyTaskDefinition.create({
    data: {
      slug,
      taskType: "MINE_BLK",
      resetCadence: "DAILY",
      targetValue: 10,
      translationKey: "test.key",
      rewardKind: "POL",
      rewardPolAmount: 0.5,
    },
  });

  // Invalid ID
  const resBadId = createMockRes();
  await adminCtrl.patchDefinition({ params: { id: "not-a-number" }, body: {}, admin: { adminId: 1 } }, resBadId);
  assert.equal(resBadId.getStatusCode(), 400);

  // Non-existent ID returns 404
  const res404 = createMockRes();
  await adminCtrl.patchDefinition({ params: { id: "999999" }, body: { targetValue: 20 }, admin: { adminId: 1 } }, res404);
  assert.equal(res404.getStatusCode(), 404);

  // Successful patch
  const resGood = createMockRes();
  await adminCtrl.patchDefinition({
    params: { id: String(def.id) },
    body: { targetValue: 25, isActive: false },
    admin: { adminId: 1, email: "admin@test.com", sessionId: "sess-2" },
    ip: "127.0.0.1",
    headers: { "user-agent": "test-suite" },
  }, resGood);
  assert.equal(resGood.getStatusCode(), 200);
  assert.equal(Number(resGood.getData()?.definition?.targetValue), 25);
  assert.equal(resGood.getData()?.definition?.isActive, false);

  // Check audit log
  const audit = await prisma.adminAuditLog.findFirst({
    where: {
      action: "TASK_DEFINITION_UPDATE",
      resourceId: String(def.id),
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit, "Audit log for TASK_DEFINITION_UPDATE must exist");

  // Cleanup
  await prisma.dailyTaskDefinition.delete({ where: { id: def.id } }).catch(() => {});
});

test("tasks.admin.controller: deleteDefinition deletes definition and writes audit log", async () => {
  const ts = Date.now();
  const slug = `admin-del-test-${ts}`;

  const def = await prisma.dailyTaskDefinition.create({
    data: {
      slug,
      taskType: "WATCH_YOUTUBE",
      resetCadence: "DAILY",
      targetValue: 2,
      translationKey: "test.yt",
      rewardKind: "BLK",
      rewardBlkAmount: 1,
    },
  });

  // Non-existent ID returns 404
  const res404 = createMockRes();
  await adminCtrl.deleteDefinition({ params: { id: "999999" }, admin: { adminId: 1 } }, res404);
  assert.equal(res404.getStatusCode(), 404);

  // Successful delete
  const resGood = createMockRes();
  await adminCtrl.deleteDefinition({
    params: { id: String(def.id) },
    admin: { adminId: 1, email: "admin@test.com", sessionId: "sess-3" },
    ip: "127.0.0.1",
    headers: { "user-agent": "test-suite" },
  }, resGood);
  assert.equal(resGood.getStatusCode(), 200);

  // Confirm deleted from DB
  const check = await prisma.dailyTaskDefinition.findUnique({ where: { id: def.id } });
  assert.equal(check, null);

  // Check audit log
  const audit = await prisma.adminAuditLog.findFirst({
    where: {
      action: "TASK_DEFINITION_DELETE",
      resourceId: String(def.id),
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit, "Audit log for TASK_DEFINITION_DELETE must exist");
});
