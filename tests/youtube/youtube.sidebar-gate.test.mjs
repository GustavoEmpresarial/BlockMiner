import test from "node:test";
import assert from "node:assert/strict";

// Confirms the youtube module is wired to the real sidebar-nav gate (Fase 8): registry shape
// + middleware factory. The actual 403-when-disabled / 200-when-enabled round trip against the
// shared SidebarNavConfig singleton row is exercised end-to-end (sequentially, no parallel-file
// race) by scripts/smoke-fase8d-telegram-youtube.mjs and by sidebar-nav.gate.test.mjs (same
// mechanism, `/faucet` item) — deliberately NOT duplicated here with a second file mutating the
// same singleton row concurrently, which was observed to flake under `node --test`'s
// parallel-by-default file execution.
const gate = await import("../../server/modules/sidebar-nav/sidebar-nav.gate.ts");
const { SIDEBAR_ITEM_REGISTRY } = await import("../../server/modules/sidebar-nav/sidebar-nav.registry.ts");

test("youtube module registers /youtube as its gated sidebar path", () => {
  assert.equal(SIDEBAR_ITEM_REGISTRY.youtube.path, "/youtube");
  assert.equal(gate.sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.youtube.path, "youtube"), "/youtube");
});

test("requireVisibleSidebarPath('/youtube') returns a real middleware function", () => {
  const middleware = gate.requireVisibleSidebarPath("/youtube");
  assert.equal(typeof middleware, "function");
});
