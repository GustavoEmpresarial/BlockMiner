import test from "node:test";
import assert from "node:assert/strict";

const adminCtrl = await import(
  "../../server/modules/mini-pass/mini-pass.admin.controller.ts"
);
const ctrl = await import(
  "../../server/modules/mini-pass/mini-pass.controller.ts"
);

function createMockReqRes({ admin = null, user = null, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    admin,
    user,
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

// ─── 1. Smoke: Listagem de Temporadas Admin ───────────────────────────────────

test("Smoke: adminListMiniPassSeasons retorna array de temporadas", async () => {
  const { req, res } = createMockReqRes({ admin: { adminId: 1, role: "admin" } });
  await adminCtrl.adminListMiniPassSeasons(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.seasons));
});

// ─── 2. Smoke: Criação de Temporada & Validações de Payload ───────────────────

test("Smoke: adminCreateMiniPassSeason rejeita slug inválido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: { slug: "INVALID SLUG WITH SPACES!" },
  });
  await adminCtrl.adminCreateMiniPassSeason(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: adminCreateMiniPassSeason rejeita endsAt <= startsAt com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: {
      slug: "smoke-season-invalid-dates",
      titleI18n: { en: "Test" },
      startsAt: "2026-09-28T12:00:00Z",
      endsAt: "2026-09-28T11:00:00Z", // no passado
    },
  });
  await adminCtrl.adminCreateMiniPassSeason(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
  assert.ok(res.getData()?.message.includes("endsAt must be after startsAt"));
});

// ─── 3. Smoke: Detalhe e Validação de IDs ────────────────────────────────────

test("Smoke: adminGetMiniPassSeason rejeita ID inválido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "not-an-id" },
  });
  await adminCtrl.adminGetMiniPassSeason(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: adminGetMiniPassSeason retorna 404 para ID inexistente", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "2147483640" },
  });
  await adminCtrl.adminGetMiniPassSeason(req, res);
  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData()?.ok, false);
});

// ─── 4. Smoke: Recompensas de Nível ──────────────────────────────────────────

test("Smoke: adminUpsertLevelReward rejeita rewardKind desconhecido com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { seasonId: "1" },
    body: { level: 1, rewardKind: "UNSUPPORTED_CRYPTO" },
  });
  await adminCtrl.adminUpsertLevelReward(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 5. Smoke: Missões de Temporada ──────────────────────────────────────────

test("Smoke: adminUpsertMission rejeita cadence inválida com 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { seasonId: "1" },
    body: { cadence: "YEARLY", missionType: "PLAY_GAMES" },
  });
  await adminCtrl.adminUpsertMission(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 6. Smoke: Endpoints de Usuário ──────────────────────────────────────────

test("Smoke: listMiniPassSeasons exige usuário na sessão (401)", async () => {
  const { req, res } = createMockReqRes({ user: null });
  await ctrl.listMiniPassSeasons(req, res);
  assert.equal(res.getStatusCode(), 401);
});

test("Smoke: getMiniPassSeason exige usuário na sessão (401)", async () => {
  const { req, res } = createMockReqRes({ user: null, params: { seasonId: "1" } });
  await ctrl.getMiniPassSeason(req, res);
  assert.equal(res.getStatusCode(), 401);
});
