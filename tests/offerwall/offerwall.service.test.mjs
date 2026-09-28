import test from "node:test";
import assert from "node:assert/strict";

const {
  sanitizeAdminDateRange,
  parseOptionalUserId,
} = await import("../../server/modules/offerwall/offerwall.service.ts");

test("sanitizeAdminDateRange: defaults to last 7 days when inputs are empty", () => {
  const res = sanitizeAdminDateRange(null, null);
  assert.equal(res.ok, true);
  if (res.ok) {
    const { from, to, serverNow } = res.range;
    assert.ok(to.getTime() <= new Date().getTime());
    assert.ok(from.getTime() < to.getTime());
    // Difference should be roughly 6-7 days
    const diffDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(diffDays >= 6 && diffDays <= 7.1);
    assert.ok(serverNow);
  }
});

test("sanitizeAdminDateRange: clamps future 'to' date to current time", () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const res = sanitizeAdminDateRange(past, future);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.ok(res.range.to.getTime() <= Date.now() + 1000);
  }
});

test("sanitizeAdminDateRange: rejects when from > to", () => {
  const from = new Date("2026-09-28T00:00:00Z").toISOString();
  const to = new Date("2026-09-20T00:00:00Z").toISOString();
  const res = sanitizeAdminDateRange(from, to);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.message, /from must be before or equal to to/);
  }
});

test("sanitizeAdminDateRange: rejects range exceeding 90 days", () => {
  const from = new Date("2026-01-01T00:00:00Z").toISOString();
  const to = new Date("2026-05-01T00:00:00Z").toISOString();
  const res = sanitizeAdminDateRange(from, to);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.message, /Date range cannot exceed 90 days/);
  }
});

test("parseOptionalUserId: correctly parses valid integer IDs and rejects invalid ones", () => {
  assert.equal(parseOptionalUserId(null), null);
  assert.equal(parseOptionalUserId(""), null);
  assert.equal(parseOptionalUserId(undefined), null);
  assert.equal(parseOptionalUserId("123"), 123);
  assert.equal(parseOptionalUserId(456), 456);

  assert.equal(parseOptionalUserId("0"), null);
  assert.equal(parseOptionalUserId("-5"), null);
  assert.equal(parseOptionalUserId("abc"), null);
  assert.equal(parseOptionalUserId("12.34"), null);
});
