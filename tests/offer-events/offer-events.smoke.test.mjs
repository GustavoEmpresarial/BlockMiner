import test from "node:test";
import assert from "node:assert/strict";

const adminCtrl = await import(
  "../../server/modules/offer-events/offer-events.admin.controller.ts"
);
const ctrl = await import(
  "../../server/modules/offer-events/offer-events.controller.ts"
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

// ─── 1. Smoke: Listagem de Eventos Admin ──────────────────────────────────────

test("Smoke: adminListOfferEvents retorna eventos paginados", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    query: { page: "1", pageSize: "20" },
  });
  await adminCtrl.adminListOfferEvents(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.events));
});

test("Smoke: adminListOfferEvents rejeita pageSize fora dos limites (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    query: { pageSize: "999" },
  });
  await adminCtrl.adminListOfferEvents(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 2. Smoke: Criação e Validação de Eventos ─────────────────────────────────

test("Smoke: adminCreateOfferEvent rejeita body vazio (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: {},
  });
  await adminCtrl.adminCreateOfferEvent(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: adminCreateOfferEvent rejeita endsAt <= startsAt (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: {
      title: "Invalid Dates Event",
      description: "Test description",
      startsAt: "2026-09-28T12:00:00Z",
      endsAt: "2026-09-28T11:00:00Z", // no passado em relação a startsAt
    },
  });
  await adminCtrl.adminCreateOfferEvent(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
  assert.ok(res.getData()?.message.includes("endsAt must be after startsAt"));
});

// ─── 3. Smoke: Detalhe e Consulta de Evento ──────────────────────────────────

test("Smoke: adminGetOfferEvent rejeita ID não numérico (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "not-an-id" },
  });
  await adminCtrl.adminGetOfferEvent(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: adminGetOfferEvent retorna 404 para ID inexistente", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "99999999" },
  });
  await adminCtrl.adminGetOfferEvent(req, res);
  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData()?.ok, false);
});

// ─── 4. Smoke: Mineradoras de Evento ──────────────────────────────────────────

test("Smoke: adminListEventMiners rejeita eventId inválido (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { eventId: "invalid" },
  });
  await adminCtrl.adminListEventMiners(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: adminCreateEventMiner valida campos obrigatórios (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { eventId: "1" },
    body: { name: "" },
  });
  await adminCtrl.adminCreateEventMiner(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 5. Smoke: Vendas do Evento ──────────────────────────────────────────────

test("Smoke: adminListEventPurchases rejeita ID inválido (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "abc" },
  });
  await adminCtrl.adminListEventPurchases(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

// ─── 6. Smoke: Listagem Pública de Ofertas Ativas ─────────────────────────────

test("Smoke: listActiveOfferEvents exige usuário na sessão", async () => {
  const { req, res } = createMockReqRes({ user: null });
  await ctrl.listActiveOfferEvents(req, res);
  assert.equal(res.getStatusCode(), 401);
});
