import test from "node:test";
import assert from "node:assert/strict";

const { adminTrafficQuerySchema } = await import(
  "../../server/modules/traffic/traffic.admin.schemas.ts"
);

// ─── adminTrafficQuerySchema ──────────────────────────────────────────────────

test("Schemas: adminTrafficQuerySchema applies default days=30 when query is empty", () => {
  const result = adminTrafficQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.days, 30);
});

test("Schemas: adminTrafficQuerySchema coerces string days to number", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: "7" });
  assert.equal(result.success, true);
  assert.equal(result.data.days, 7);
});

test("Schemas: adminTrafficQuerySchema accepts all supported preset days", () => {
  for (const d of [7, 14, 30, 60, 90, 180, 365]) {
    const result = adminTrafficQuerySchema.safeParse({ days: String(d) });
    assert.equal(result.success, true);
    assert.equal(result.data.days, d);
  }
});

test("Schemas: adminTrafficQuerySchema rejects zero days", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: 0 });
  assert.equal(result.success, false);
});

test("Schemas: adminTrafficQuerySchema rejects negative days", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: -10 });
  assert.equal(result.success, false);
});

test("Schemas: adminTrafficQuerySchema rejects days greater than 365", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: 366 });
  assert.equal(result.success, false);
});

test("Schemas: adminTrafficQuerySchema rejects floating point days", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: "14.5" });
  assert.equal(result.success, false);
});

test("Schemas: adminTrafficQuerySchema rejects non-numeric string days", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: "thirty" });
  assert.equal(result.success, false);
});

test("Schemas: adminTrafficQuerySchema rejects rogue properties (.strict mass assignment protection)", () => {
  const result = adminTrafficQuerySchema.safeParse({ days: 30, bypassLimit: true });
  assert.equal(result.success, false);
});
