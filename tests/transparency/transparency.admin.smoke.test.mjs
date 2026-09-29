import test from "node:test";
import assert from "node:assert/strict";

const { transparencyAdminRouter } = await import(
  "../../server/modules/transparency/transparency.admin.routes.ts"
);

test("Smoke: transparencyAdminRouter is a valid Express Router instance", () => {
  assert.equal(typeof transparencyAdminRouter, "function");
  assert.equal(Array.isArray(transparencyAdminRouter.stack), true);
  assert.ok(transparencyAdminRouter.stack.length >= 10);
});

test("Smoke: transparencyAdminRouter exposes external-investments routes with all CRUD methods", () => {
  const routes = transparencyAdminRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes("/transparency/external-investments"));
  assert.ok(paths.includes("/transparency/external-investments/:id"));

  const idRoutes = routes.filter((r) => r.path === "/transparency/external-investments/:id");
  const idMethods = idRoutes.flatMap((r) => r.methods);
  assert.ok(idMethods.includes("put"));
  assert.ok(idMethods.includes("patch"));
  assert.ok(idMethods.includes("delete"));
});
