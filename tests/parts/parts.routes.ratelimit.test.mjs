/**
 * /parts/merge and /parts/craft debit parts and balance. Each write route must carry a
 * per-user limiter between requireAuth and the controller, and it must actually block
 * once the window is exhausted (not just be present).
 */
import test from "node:test";
import assert from "node:assert/strict";

const { partsRouter } = await import("../../server/modules/parts/parts.routes.ts");
const partsController = await import("../../server/modules/parts/parts.controller.ts");
const { requireAuth } = await import("../../server/core/http/middleware/auth.ts");

const PARTS_WRITE_MAX_PER_MINUTE = 10;

function routeHandlers(path) {
  const layer = partsRouter.stack.find((l) => l.route?.path === path && l.route.methods.post);
  assert.ok(layer, `POST ${path} must be registered`);
  return layer.route.stack.map((s) => s.handle);
}

function fakeRes() {
  const calls = { status: 200 };
  return {
    calls,
    setHeader() {},
    set() { return this; },
    status(code) { calls.status = code; return this; },
    json(body) { calls.body = body; return this; },
    send(body) { calls.body = body; return this; },
  };
}

for (const [path, controller] of [["/merge", partsController.mergeParts], ["/craft", partsController.craftPart]]) {
  test(`POST ${path} — limiter sits between requireAuth and the controller and blocks request ${PARTS_WRITE_MAX_PER_MINUTE + 1}`, () => {
    const handlers = routeHandlers(path);
    assert.equal(handlers[0], requireAuth, "requireAuth must run first");
    assert.equal(handlers.at(-1), controller, "controller must run last");
    assert.equal(handlers.length, 3, "exactly one limiter between auth and controller");

    const limiter = handlers[1];
    const req = { ip: "203.0.113.7", path, user: { id: 987654321 + path.length } };
    let passed = 0;
    let lastRes;
    for (let i = 0; i < PARTS_WRITE_MAX_PER_MINUTE + 1; i++) {
      lastRes = fakeRes();
      limiter(req, lastRes, () => { passed += 1; });
    }
    assert.equal(passed, PARTS_WRITE_MAX_PER_MINUTE, "exactly `max` requests pass in the window");
    assert.equal(lastRes.calls.status, 429, "the next request is rejected with 429");
  });
}
