import test from "node:test";
import assert from "node:assert/strict";

const { burnEventsAdminRouter } = await import(
  "../../server/modules/burn-events/burn-events.admin.routes.ts"
);

test("Smoke: burnEventsAdminRouter is a valid Express Router instance", () => {
  assert.equal(typeof burnEventsAdminRouter, "function");
  assert.equal(Array.isArray(burnEventsAdminRouter.stack), true);
  assert.ok(burnEventsAdminRouter.stack.length >= 5);
});

test("Smoke: burnEventsAdminRouter has routes for list, create, update, remove and claims", () => {
  const routes = burnEventsAdminRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/:id"));
  assert.ok(paths.includes("/:id/claims"));

  // Check methods on /:id
  const idRoutes = routes.filter((r) => r.path === "/:id");
  const idMethods = idRoutes.flatMap((r) => r.methods);
  assert.ok(idMethods.includes("put"));
  assert.ok(idMethods.includes("patch"));
  assert.ok(idMethods.includes("delete"));
});
