import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const adminCtrl = await import("../../server/modules/ptc/ptc.admin.controller.ts");
const userCtrl = await import("../../server/modules/ptc/ptc.controller.ts");
const svc = await import("../../server/modules/ptc/ptc.service.ts");

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

// ─── Admin Controller ────────────────────────────────────────────────────────

test("admin.controller: getSettings returns settings", async () => {
  const req = {};
  const res = createMockRes();
  await adminCtrl.getSettings(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(res.getData()?.settings);
});

test("admin.controller: updateSettings rejects invalid payload and accepts valid", async () => {
  const resBad = createMockRes();
  await adminCtrl.updateSettings({ body: { minViews: -10 } }, resBad);
  assert.equal(resBad.getStatusCode(), 400);

  const resGood = createMockRes();
  await adminCtrl.updateSettings({ body: { isEnabled: true }, ip: "127.0.0.1", headers: {} }, resGood);
  assert.equal(resGood.getStatusCode(), 200);
  assert.equal(resGood.getData()?.ok, true);
});

test("admin.controller: listPending and listAll return 200", async () => {
  const req = { query: { page: 1, limit: 10 } };
  const res = createMockRes();
  await adminCtrl.listPending(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.ok(Array.isArray(res.getData()?.campaigns));

  const resAll = createMockRes();
  await adminCtrl.listAll(req, resAll);
  assert.equal(resAll.getStatusCode(), 200);
  assert.ok(Array.isArray(resAll.getData()?.items));
});

test("admin.controller: approve and reject reject invalid ID", async () => {
  const req = { params: { id: "invalid" }, body: {} };
  const res = createMockRes();
  await adminCtrl.approve(req, res);
  assert.equal(res.getStatusCode(), 400);

  const resRej = createMockRes();
  await adminCtrl.reject(req, resRej);
  assert.equal(resRej.getStatusCode(), 400);
});

test("admin.controller: approve and reject handle non-existent campaigns gracefully", async () => {
  const resApprove = createMockRes();
  await adminCtrl.approve({ params: { id: "999999" } }, resApprove);
  assert.equal(resApprove.getStatusCode(), 400);

  const resReject = createMockRes();
  await adminCtrl.reject({ params: { id: "999999" }, body: { reason: "test" } }, resReject);
  assert.equal(resReject.getStatusCode(), 400);
});

test("admin.controller: getTiers returns active tiers", async () => {
  const req = {};
  const res = createMockRes();
  await adminCtrl.getTiers(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.ok(Array.isArray(res.getData()?.tiers));
});

test("admin.controller: tier CRUD operations with valid and invalid payloads", async () => {
  // Invalid create
  const resCreateBad = createMockRes();
  await adminCtrl.createTier({ body: { label: "" } }, resCreateBad);
  assert.equal(resCreateBad.getStatusCode(), 400);

  // Valid create
  const resCreateGood = createMockRes();
  await adminCtrl.createTier(
    {
      body: {
        label: `Controller Tier ${Date.now()}`,
        durationSeconds: 10,
        pricePerViewShib: 1,
        rewardPerViewShib: 0.8,
      },
      ip: "127.0.0.1",
      headers: {},
    },
    resCreateGood,
  );
  assert.equal(resCreateGood.getStatusCode(), 200);
  const createdTier = resCreateGood.getData()?.tier;
  assert.ok(createdTier?.id);

  // Invalid update ID
  const resUpdateBad = createMockRes();
  await adminCtrl.updateTier({ params: { id: "0" }, body: {} }, resUpdateBad);
  assert.equal(resUpdateBad.getStatusCode(), 400);

  // Valid update
  const resUpdateGood = createMockRes();
  await adminCtrl.updateTier(
    { params: { id: String(createdTier.id) }, body: { label: "Updated Label" }, ip: "127.0.0.1", headers: {} },
    resUpdateGood,
  );
  assert.equal(resUpdateGood.getStatusCode(), 200);

  // Valid delete
  const resDeleteGood = createMockRes();
  await adminCtrl.deleteTier(
    { params: { id: String(createdTier.id) }, ip: "127.0.0.1", headers: {} },
    resDeleteGood,
  );
  assert.equal(resDeleteGood.getStatusCode(), 200);
});

// ─── User Controller ─────────────────────────────────────────────────────────

test("user.controller: getSettings and getActiveTiers return 200", async () => {
  const resSettings = createMockRes();
  await userCtrl.getSettings({}, resSettings);
  assert.equal(resSettings.getStatusCode(), 200);

  const resTiers = createMockRes();
  await userCtrl.getActiveTiers({}, resTiers);
  assert.equal(resTiers.getStatusCode(), 200);
});

test("user.controller: authenticated routes reject unauthenticated requests", async () => {
  const endpoints = [
    (req, res) => userCtrl.createCampaign(req, res),
    (req, res) => userCtrl.getMyCampaigns(req, res),
    (req, res) => userCtrl.editCampaign(req, res),
    (req, res) => userCtrl.addViews(req, res),
    (req, res) => userCtrl.removeViews(req, res),
    (req, res) => userCtrl.getAvailableAds(req, res),
    (req, res) => userCtrl.getEarningsHistory(req, res),
    (req, res) => userCtrl.startSession(req, res),
    (req, res) => userCtrl.heartbeat(req, res),
    (req, res) => userCtrl.pauseSession(req, res),
    (req, res) => userCtrl.cancelSession(req, res),
    (req, res) => userCtrl.claimSession(req, res),
  ];

  for (const handler of endpoints) {
    const res = createMockRes();
    await handler({ user: null, params: {}, body: {}, query: {} }, res);
    assert.equal(res.getStatusCode(), 401, `Endpoint deve rejeitar request sem sessão de usuário`);
  }
});

test("user.controller: getEarningsHistory, getAvailableAds and getActiveSession with authenticated user", async () => {
  const mockUser = { id: 999999 };
  const req = { user: mockUser };

  const resEarnings = createMockRes();
  await userCtrl.getEarningsHistory(req, resEarnings);
  assert.equal(resEarnings.getStatusCode(), 200);
  assert.ok(Array.isArray(resEarnings.getData()?.history));

  const resAds = createMockRes();
  await userCtrl.getAvailableAds(req, resAds);
  assert.equal(resAds.getStatusCode(), 200);
  assert.ok(resAds.getData()?.daily);

  const resSession = createMockRes();
  await userCtrl.getActiveSession(req, resSession);
  assert.equal(resSession.getStatusCode(), 200);
});


test("user.controller: editCampaign, addViews, removeViews reject invalid ID", async () => {
  const mockUser = { id: 1 };
  const resEdit = createMockRes();
  await userCtrl.editCampaign({ user: mockUser, params: { id: "bad" }, body: {} }, resEdit);
  assert.equal(resEdit.getStatusCode(), 400);

  const resAdd = createMockRes();
  await userCtrl.addViews({ user: mockUser, params: { id: "bad" }, body: { views: 10 } }, resAdd);
  assert.equal(resAdd.getStatusCode(), 400);

  const resRemove = createMockRes();
  await userCtrl.removeViews({ user: mockUser, params: { id: "bad" }, body: { views: 10 } }, resRemove);
  assert.equal(resRemove.getStatusCode(), 400);
});

test("user.controller: schema validation failures return 400 Bad Request", async () => {
  const mockUser = { id: 1 };

  // createCampaign with invalid schema
  const resCreate = createMockRes();
  await userCtrl.createCampaign({ user: mockUser, body: { title: "" } }, resCreate);
  assert.equal(resCreate.getStatusCode(), 400);
  assert.equal(resCreate.getData()?.message, "Invalid campaign payload.");

  // editCampaign with invalid schema
  const resEditBad = createMockRes();
  await userCtrl.editCampaign({ user: mockUser, params: { id: "10" }, body: { title: 123 } }, resEditBad);
  assert.equal(resEditBad.getStatusCode(), 400);

  // addViews and removeViews with invalid views schema
  const resAddBad = createMockRes();
  await userCtrl.addViews({ user: mockUser, params: { id: "10" }, body: { views: -5 } }, resAddBad);
  assert.equal(resAddBad.getStatusCode(), 400);

  const resRemoveBad = createMockRes();
  await userCtrl.removeViews({ user: mockUser, params: { id: "10" }, body: { views: 0 } }, resRemoveBad);
  assert.equal(resRemoveBad.getStatusCode(), 400);

  // startSession with missing adId
  const resStart = createMockRes();
  await userCtrl.startSession({ user: mockUser, body: { adId: -1 } }, resStart);
  assert.equal(resStart.getStatusCode(), 400);

  // heartbeat / pause / cancel / claim with non-existent session triggers sendServiceError
  const resHb = createMockRes();
  await userCtrl.heartbeat({ user: mockUser, params: { sessionId: "non-existent" } }, resHb);
  assert.equal(resHb.getStatusCode(), 400);

  const resPause = createMockRes();
  await userCtrl.pauseSession({ user: mockUser, params: { sessionId: "non-existent" } }, resPause);
  assert.equal(resPause.getStatusCode(), 400);

  const resCancel = createMockRes();
  await userCtrl.cancelSession({ user: mockUser, params: { sessionId: "non-existent" }, body: {} }, resCancel);
  assert.equal(resCancel.getStatusCode(), 200); // cancelSession catches gracefully

  const resClaim = createMockRes();
  await userCtrl.claimSession({ user: mockUser, params: { sessionId: "non-existent" } }, resClaim);
  assert.equal(resClaim.getStatusCode(), 400);
});

