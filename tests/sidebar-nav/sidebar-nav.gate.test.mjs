import test from "node:test";
import assert from "node:assert/strict";

const gate = await import("../../server/modules/sidebar-nav/sidebar-nav.gate.ts");
const service = await import("../../server/modules/sidebar-nav/sidebar-nav.service.ts");
const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

test.after(async () => {
  await prisma.$disconnect();
});

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("sidebarRegistryPath: throws when the registry path is null (misconfigured feature)", () => {
  assert.throws(() => gate.sidebarRegistryPath(null, "some_feature"), /Missing sidebar path/);
  assert.throws(() => gate.sidebarRegistryPath(undefined, "some_feature"), /Missing sidebar path/);
  assert.throws(() => gate.sidebarRegistryPath("", "some_feature"), /Missing sidebar path/);
});

test("sidebarRegistryPath: returns the path unchanged when present", () => {
  assert.equal(gate.sidebarRegistryPath("/faucet", "faucet"), "/faucet");
});

test("requireVisibleSidebarPath: responds 403 feature_disabled (exact shape) when the item is hidden via admin", async () => {
  const initial = await service.getSidebarNavForAdmin();
  const faucetHidden = initial.entries.map((e) => (e.itemId === "faucet" ? { ...e, visible: false } : e));
  const saved = await service.saveSidebarNavEntries(faucetHidden);
  assert.equal(saved.ok, true);

  try {
    const middleware = gate.requireVisibleSidebarPath("/faucet");
    const res = fakeRes();
    let nextCalled = false;
    await middleware({}, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false, "next() must not be called when the feature is disabled");
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      ok: false,
      code: "feature_disabled",
      message: "This feature is not available.",
    });
  } finally {
    // restore
    const restore = saved.entries.map((e) => (e.itemId === "faucet" ? { ...e, visible: true } : e));
    await service.saveSidebarNavEntries(restore);
  }
});

test("requireVisibleSidebarPath: calls next() with no response when the item is visible", async () => {
  const initial = await service.getSidebarNavForAdmin();
  const visible = initial.entries.map((e) =>
    e.itemId === "faucet" || e.itemId === "rewards_group" ? { ...e, visible: true } : e,
  );
  const saved = await service.saveSidebarNavEntries(visible);
  assert.equal(saved.ok, true);

  const middleware = gate.requireVisibleSidebarPath("/faucet");
  const res = fakeRes();
  let nextCalled = false;
  await middleware({}, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null, "no response should be sent when the feature is visible");
});

test("requireVisibleSidebarPath: an unknown/never-registered path is treated as not visible (403)", async () => {
  const middleware = gate.requireVisibleSidebarPath("/this-path-does-not-exist-anywhere");
  const res = fakeRes();
  let nextCalled = false;
  await middleware({}, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "feature_disabled");
});
