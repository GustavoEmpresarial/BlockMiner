import test from "node:test";
import assert from "node:assert/strict";

const {
  fingerprintOf,
  decorate,
  buildClipboardText,
  computeStats,
  groupByUser,
} = await import("../../client/src/features/admin/client-errors/adminClientErrors.logic.ts");

const mockRow = {
  id: 101,
  action: "client_error_report",
  severity: "error",
  label: "TypeError: Cannot read property 'map' of undefined",
  description: "TypeError at MiningRoom.tsx:42:15",
  ip: "192.168.1.50",
  userAgent: "Mozilla/5.0 Chrome/120.0",
  createdAt: "2026-09-21T20:00:00.000Z",
  userId: 7,
  user: { id: 7, name: "MinerTester" },
  metadata: {
    category: "crash",
    url: "https://blockminer.space/mining",
    operation: "react_error_boundary",
    fingerprint: "crash:cannot_read:mining",
    breadcrumbs: [
      { ts: 1758500000000, type: "navigation", message: "nav_to:/mining" },
      { ts: 1758500005000, type: "click", message: "click:button [Ativar]" },
    ],
    environment: {
      viewport: "1920x1080",
      connection: "4g",
      language: "pt-BR",
      online: true,
    },
  },
};

test("fingerprintOf returns metadata fingerprint if present or generates fallback", () => {
  assert.equal(fingerprintOf(mockRow), "crash:cannot_read:mining");
  assert.equal(
    fingerprintOf({
      action: "client_api_failure",
      label: "Failed to load",
      metadata: { category: "api_failure", code: "NOT_FOUND", statusCode: 404 },
    }),
    "api_failure:Failed to load:NOT_FOUND:404"
  );
});

test("decorate attaches category, criticality, endpoint, and fingerprint", () => {
  const dec = decorate(mockRow);
  assert.equal(dec.category, "crash");
  assert.equal(dec.criticality, "critical");
  assert.equal(dec.fingerprint, "crash:cannot_read:mining");
  assert.ok(dec.endpoint);
});

test("buildClipboardText includes breadcrumbs, environment, and fingerprint", () => {
  const dec = decorate(mockRow);
  const text = buildClipboardText(dec);
  assert.match(text, /Fingerprint: crash:cannot_read:mining/);
  assert.match(text, /Environment: \{"viewport":"1920x1080"/);
  assert.match(text, /## Breadcrumbs/);
  assert.match(text, /\(navigation\) nav_to:\/mining/);
  assert.match(text, /\(click\) click:button \[Ativar\]/);
});

test("groupByUser groups rows by user and calculates counts", () => {
  const dec1 = decorate(mockRow);
  const dec2 = decorate({
    ...mockRow,
    id: 102,
    createdAt: "2026-09-21T20:05:00.000Z",
  });

  const groups = groupByUser([dec1, dec2]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "user:7");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[0].counts.critical, 2);
});

test("computeStats aggregates totals, affected users and categories", () => {
  const dec = decorate(mockRow);
  const stats = computeStats([dec]);
  assert.equal(stats.total, 1);
  assert.equal(stats.affectedUsers, 1);
  assert.equal(stats.byCategory.crash, 1);
  assert.equal(stats.byCriticality.critical, 1);
});
