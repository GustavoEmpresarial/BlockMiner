import test from "node:test";
import assert from "node:assert/strict";

const registry = await import("../../server/modules/sidebar-nav/sidebar-nav.registry.ts");

test("SIDEBAR_ITEM_REGISTRY: zerads is registered under rewards_group in the earn section", () => {
  const def = registry.SIDEBAR_ITEM_REGISTRY.zerads;
  assert.ok(def, "zerads must exist in registry");
  assert.equal(def.section, "earn");
  assert.equal(def.defaultParentItemId, "rewards_group");
});

test("buildDefaultSidebarEntries: zerads default entry is hardcoded visible:false", () => {
  const defaults = registry.buildDefaultSidebarEntries();
  const zerads = defaults.find((e) => e.itemId === "zerads");
  assert.ok(zerads, "zerads default entry must exist");
  assert.equal(zerads.visible, false, "zerads must default to hidden");
  assert.equal(zerads.parentItemId, "rewards_group");
});

test("coerceZeradsHidden: forces visible:false even when input says visible:true (intentional override)", () => {
  const input = [
    { itemId: "zerads", visible: true, sortOrder: 129, section: "earn", parentItemId: "rewards_group" },
    { itemId: "faucet", visible: true, sortOrder: 125, section: "earn", parentItemId: "rewards_group" },
  ];
  const { entries, changed } = registry.coerceZeradsHidden(input);
  assert.equal(changed, true);
  const zerads = entries.find((e) => e.itemId === "zerads");
  assert.equal(zerads.visible, false);
  const faucet = entries.find((e) => e.itemId === "faucet");
  assert.equal(faucet.visible, true, "coerceZeradsHidden must not touch unrelated entries");
});

test("coerceZeradsHidden: no-op (changed:false) when already hidden", () => {
  const input = [{ itemId: "zerads", visible: false, sortOrder: 129, section: "earn", parentItemId: "rewards_group" }];
  const { changed } = registry.coerceZeradsHidden(input);
  assert.equal(changed, false);
});

test("coerceParentLockedSidebarEntries: re-parents locked items (e.g. checkin) to their registry default", () => {
  const input = [{ itemId: "checkin", visible: true, sortOrder: 110, section: "earn", parentItemId: "rewards_group" }];
  const { entries, changed } = registry.coerceParentLockedSidebarEntries(input);
  assert.equal(changed, true);
  assert.equal(entries[0].parentItemId, null, "checkin is parentLocked with defaultParentItemId: null");
});

test("coerceInternalOfferwallEarnRoot: forces internal_offerwall under rewards_group", () => {
  const input = [{ itemId: "internal_offerwall", visible: true, sortOrder: 127, section: "earn", parentItemId: null }];
  const { entries, changed } = registry.coerceInternalOfferwallEarnRoot(input);
  assert.equal(changed, true);
  assert.equal(entries[0].parentItemId, "rewards_group");
});

test("mergeMissingSidebarRegistryEntries: appends defaults for registry ids missing from stored entries", () => {
  const input = [{ itemId: "dashboard", visible: true, sortOrder: 10, section: "main", parentItemId: null }];
  const { entries, changed } = registry.mergeMissingSidebarRegistryEntries(input);
  assert.equal(changed, true);
  const ids = new Set(entries.map((e) => e.itemId));
  assert.equal(ids.size, registry.ALLOWED_ITEM_IDS.size, "merged set must cover the full registry");
});

test("mergeMissingSidebarRegistryEntries: prunes entries whose itemId is no longer in the registry", () => {
  const input = [
    { itemId: "dashboard", visible: true, sortOrder: 10, section: "main", parentItemId: null },
    { itemId: "some_removed_item", visible: true, sortOrder: 999, section: "main", parentItemId: null },
  ];
  const { entries } = registry.mergeMissingSidebarRegistryEntries(input);
  assert.ok(!entries.some((e) => e.itemId === "some_removed_item"));
});

test("buildAdminItemMeta: returns metadata (no paths) for every registry item, incl. zerads", () => {
  const meta = registry.buildAdminItemMeta();
  assert.equal(Object.keys(meta).length, registry.ALLOWED_ITEM_IDS.size);
  assert.ok(!("path" in meta.zerads));
  assert.equal(meta.rewards_group.isGroup, true);
  assert.equal(meta.checkin.parentLocked, true);
});

test("validateSidebarEntriesPayload: rejects an incomplete item set", () => {
  const result = registry.validateSidebarEntriesPayload([
    { itemId: "dashboard", visible: true, sortOrder: 10, section: "main", parentItemId: null },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "incomplete_item_set");
});

test("validateSidebarEntriesPayload: accepts the full default set", () => {
  const defaults = registry.buildDefaultSidebarEntries();
  const result = registry.validateSidebarEntriesPayload(defaults);
  assert.equal(result.ok, true);
});

test("validateSidebarEntriesPayload: rejects duplicate itemId", () => {
  const defaults = registry.buildDefaultSidebarEntries();
  const result = registry.validateSidebarEntriesPayload([...defaults, defaults[0]]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "duplicate_item_id");
});

test("validateSidebarEntriesPayload: rejects an unknown itemId", () => {
  const result = registry.validationErrorForEntry({
    itemId: "not_a_real_item",
    visible: true,
    sortOrder: 1,
    section: "main",
    parentItemId: null,
  });
  assert.equal(result, "unknown_item_id");
});
