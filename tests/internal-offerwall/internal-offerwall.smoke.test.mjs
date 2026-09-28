import test from "node:test";
import assert from "node:assert/strict";

const adminCtrl = await import(
  "../../server/modules/internal-offerwall/internal-offerwall.admin.controller.ts"
);
const ctrl = await import(
  "../../server/modules/internal-offerwall/internal-offerwall.controller.ts"
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

// ─── 1. Smoke: Feature Status ────────────────────────────────────────────────

test("Smoke: getFeatureStatus retorna status booleano da flag", () => {
  const { req, res } = createMockReqRes();
  ctrl.getFeatureStatus(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.equal(typeof res.getData()?.enabled, "boolean");
});

// ─── 2. Smoke: Listagem de Ofertas Admin ──────────────────────────────────────

test("Smoke: listOffers retorna array de ofertas", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "super_admin", email: "admin@blockminer.test" },
  });
  await adminCtrl.listOffers(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.offers));
});

// ─── 3. Smoke: Listagem de Tentativas Admin ───────────────────────────────────

test("Smoke: listAttempts retorna fila de tentativas", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "super_admin", email: "admin@blockminer.test" },
    query: { limit: 10 },
  });
  await adminCtrl.listAttempts(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.attempts));
});

// ─── 4. Smoke: Listagem de Frame Hosts Admin ─────────────────────────────────

test("Smoke: listFrameHosts retorna lista de hostnames para CSP", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "super_admin", email: "admin@blockminer.test" },
  });
  await adminCtrl.listFrameHosts(req, res);
  assert.equal(res.getStatusCode(), 200);
  assert.equal(res.getData()?.ok, true);
  assert.ok(Array.isArray(res.getData()?.frameHosts));
});

// ─── 5. Smoke: Validações de Parâmetros e Erros 400 ──────────────────────────

test("Smoke: createOffer rejeita payload vazio ou malformado (400)", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    body: { title: "" },
  });
  await adminCtrl.createOffer(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: approveAttempt com ID inválido retorna 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "invalid-id" },
  });
  await adminCtrl.approveAttempt(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});

test("Smoke: deactivateFrameHost com ID inválido retorna 400", async () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin" },
    params: { id: "-5" },
  });
  await adminCtrl.deactivateFrameHost(req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData()?.ok, false);
});
