import test from "node:test";
import assert from "node:assert/strict";

const {
  listCheckinMilestones,
  createCheckinMilestone,
  updateCheckinMilestone,
  deleteCheckinMilestone,
  listCheckinStreakAnomalies,
} = await import("../../server/modules/checkin/checkin.admin.controller.ts");

function createMockReqRes({ admin = null, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    admin,
    body,
    params,
    query,
    headers: { "user-agent": "smoke-test", ...headers },
    ip: "127.0.0.1",
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };

  let statusCode = 200;
  let sentData = null;

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

// ─── 1. Smoke: Listagem de Marcos Admin ───────────────────────────────────────

test("Smoke: listCheckinMilestones retorna array de marcos e status 200", async () => {
  const { req, res } = createMockReqRes({ admin: { adminId: 1, role: "admin" } });
  await listCheckinMilestones(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.milestones));
});

// ─── 2. Smoke: Criação de Marcos & Validações de Payload ──────────────────────

test("Smoke: createCheckinMilestone rejeita body vazio com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: {},
  });
  await createCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: createCheckinMilestone rejeita dayThreshold inválido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: { dayThreshold: -5, rewardType: "pol", rewardValue: 1 },
  });
  await createCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: createCheckinMilestone rejeita máquina sem minerId com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: { dayThreshold: 50, rewardType: "machine" },
  });
  await createCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 3. Smoke: Atualização de Marcos & Validações de ID ───────────────────────

test("Smoke: updateCheckinMilestone rejeita ID inválido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "not-an-id" },
    body: { dayThreshold: 10, rewardType: "pol", rewardValue: 1 },
  });
  await updateCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: updateCheckinMilestone retorna 404 para ID inexistente", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "2147483640" },
    body: { dayThreshold: 9999, rewardType: "pol", rewardValue: 1 },
  });
  await updateCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData()?.ok, false);
});

// ─── 4. Smoke: Exclusão de Marcos & Validações de ID ─────────────────────────

test("Smoke: deleteCheckinMilestone rejeita ID inválido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "-1" },
  });
  await deleteCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: deleteCheckinMilestone retorna 404 para ID inexistente", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "2147483640" },
  });
  await deleteCheckinMilestone(req, res);
  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData()?.ok, false);
});

// ─── 5. Smoke: Scanner de Anomalias de Streak ────────────────────────────────

test("Smoke: listCheckinStreakAnomalies retorna 200 com array de anomalias", async () => {
  const { req, res } = createMockReqRes({ admin: { adminId: 1, role: "admin" } });
  await listCheckinStreakAnomalies(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.equal(typeof res.getData()?.anomalyCount, "number");
  assert.ok(Array.isArray(res.getData()?.anomalies));
});
