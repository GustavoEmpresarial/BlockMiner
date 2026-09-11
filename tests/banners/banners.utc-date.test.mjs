import test from "node:test";
import assert from "node:assert/strict";

const { parseBannerUtcMidnight } = await import(
  "../../server/modules/banners/banners.types.ts"
);

test("parseBannerUtcMidnight maps YYYY-MM-DD to UTC midnight", () => {
  const d = parseBannerUtcMidnight("2026-04-08");
  assert.ok(d);
  assert.equal(d.toISOString(), "2026-04-08T00:00:00.000Z");
});

test("parseBannerUtcMidnight strips time from ISO and uses UTC date", () => {
  const d = parseBannerUtcMidnight("2026-04-08T15:30:00.000Z");
  assert.ok(d);
  assert.equal(d.toISOString(), "2026-04-08T00:00:00.000Z");
});

test("parseBannerUtcMidnight returns null for empty", () => {
  assert.equal(parseBannerUtcMidnight(null), null);
  assert.equal(parseBannerUtcMidnight(""), null);
});
