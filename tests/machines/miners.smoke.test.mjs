import test from "node:test";
import assert from "node:assert/strict";

const { minersAdminRouter } = await import(
  "../../server/modules/machines/miners.admin.routes.ts"
);

function createMockReqRes({ admin = null, body = {}, params = {}, query = {}, method = "GET", url = "/" } = {}) {
  const req = {
    method,
    url,
    admin,
    body,
    params,
    query,
    headers: { "user-agent": "miners-smoke-test" },
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

test("Smoke: minersAdminRouter is a valid Express Router instance", () => {
  assert.equal(typeof minersAdminRouter, "function");
  assert.equal(Array.isArray(minersAdminRouter.stack), true);
  assert.ok(minersAdminRouter.stack.length > 5);
});

test("Smoke: minersAdminRouter has routes for list, create, update, toggle and repair", () => {
  const routes = minersAdminRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes("/miners"));
  assert.ok(paths.includes("/miners/orphan-types"));
  assert.ok(paths.includes("/miners/orphan-types/relink"));
  assert.ok(paths.includes("/miners/broken-machines"));
  assert.ok(paths.includes("/miners/broken-machines/assign"));
  assert.ok(paths.includes("/miners/:id"));
  assert.ok(paths.includes("/miners/:id/toggle-active"));
  assert.ok(paths.includes("/miners/:id/toggle-store"));
});
