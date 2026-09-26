import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission, resolvePermissions, hasPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({ admin = null, body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    body,
    ip,
    headers: { "user-agent": "test-agent" },
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

// ─── Matriz de Permissões Básica ─────────────────────────────────────────────

test("resolvePermissions: atribui permissões padrão corretamente", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("faucet"), true);

  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("faucet.view"), true);
  assert.equal(modPerms.includes("faucet"), false);

  const supportPerms = resolvePermissions("support");
  assert.equal(supportPerms.includes("faucet"), false);
  assert.equal(supportPerms.includes("faucet.view"), false);
});

test("hasPermission: checa hierarquia de permissões", () => {
  assert.equal(hasPermission(["*"], "faucet"), true);
  assert.equal(hasPermission(["*"], "faucet.view"), true);
  assert.equal(hasPermission(["faucet"], "faucet"), true);
  assert.equal(hasPermission(["faucet"], "faucet.view"), true); // prefix match
  assert.equal(hasPermission(["faucet.view"], "faucet"), false);
  assert.equal(hasPermission(["faucet.view"], "faucet.view"), true);
  assert.equal(hasPermission(["support"], "faucet"), false);
});

// ─── Middleware RBAC GET (Leitura) ──────────────────────────────────────────

test("RBAC GET: requireAdminPermission('faucet.view', 'faucet') rejeita requisição não autenticada com 401", () => {
  const middleware = requireAdminPermission("faucet.view", "faucet");
  const { req, res } = createMockReqRes({ admin: null });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData().ok, false);
});

test("RBAC GET: rejeita admin sem permissões de faucet com 403 (ex.: support)", () => {
  const middleware = requireAdminPermission("faucet.view", "faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 10, email: "support@test.com", permissions: ["support", "dashboard"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC GET: permite moderador com 'faucet.view'", () => {
  const middleware = requireAdminPermission("faucet.view", "faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 11, email: "mod@test.com", permissions: ["dashboard", "faucet.view"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC GET: permite admin com permissão 'faucet'", () => {
  const middleware = requireAdminPermission("faucet.view", "faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 12, email: "admin@test.com", permissions: ["dashboard", "faucet"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC GET: permite super_admin com wildcard '*'", () => {
  const middleware = requireAdminPermission("faucet.view", "faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "super@test.com", permissions: ["*"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── Middleware RBAC PUT (Mutação) ──────────────────────────────────────────

test("RBAC PUT: requireAdminPermission('faucet') rejeita moderador com apenas 'faucet.view' com 403", () => {
  const middleware = requireAdminPermission("faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 11, email: "mod@test.com", permissions: ["dashboard", "faucet.view"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC PUT: permite admin com permissão 'faucet'", () => {
  const middleware = requireAdminPermission("faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 12, email: "admin@test.com", permissions: ["dashboard", "faucet"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC PUT: permite super_admin com wildcard '*'", () => {
  const middleware = requireAdminPermission("faucet");
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "super@test.com", permissions: ["*"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
