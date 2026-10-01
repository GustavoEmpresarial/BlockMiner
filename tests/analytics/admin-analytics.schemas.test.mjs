import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsPeriodEnum,
  analyticsQuerySchema,
  executiveQuerySchema,
} from "../../server/modules/analytics/analytics.schemas.ts";
import {
  parsePeriodParam,
  queryPositiveInt,
  siteLaunchDate,
} from "../../server/modules/analytics/analytics.helpers.ts";

test("Schemas: analyticsPeriodEnum accepts valid periods and defaults to month", () => {
  for (const p of ["day", "week", "month", "year", "all"]) {
    const res = analyticsPeriodEnum.safeParse(p);
    assert.equal(res.success, true);
    assert.equal(res.data, p);
  }
});

test("Schemas: analyticsPeriodEnum rejects invalid period", () => {
  const res = analyticsPeriodEnum.safeParse("invalid_period");
  assert.equal(res.success, false);
});

test("Schemas: analyticsQuerySchema defaults period to month when empty", () => {
  const res = analyticsQuerySchema.safeParse({});
  assert.equal(res.success, true);
  assert.equal(res.data.period, "month");
  assert.equal(res.data.userId, undefined);
});

test("Schemas: analyticsQuerySchema accepts valid period and positive userId", () => {
  const res = analyticsQuerySchema.safeParse({ period: "week", userId: "42" });
  assert.equal(res.success, true);
  assert.equal(res.data.period, "week");
  assert.equal(res.data.userId, 42);
});

test("Schemas: analyticsQuerySchema accepts integer userId up to 32-bit max", () => {
  const res = analyticsQuerySchema.safeParse({ userId: 2_147_483_647 });
  assert.equal(res.success, true);
  assert.equal(res.data.userId, 2_147_483_647);
});

test("Schemas: analyticsQuerySchema rejects userId <= 0", () => {
  const resZero = analyticsQuerySchema.safeParse({ userId: 0 });
  assert.equal(resZero.success, false);

  const resNeg = analyticsQuerySchema.safeParse({ userId: -5 });
  assert.equal(resNeg.success, false);
});

test("Schemas: analyticsQuerySchema rejects float userId", () => {
  const res = analyticsQuerySchema.safeParse({ userId: "42.5" });
  assert.equal(res.success, false);
});

test("Schemas: analyticsQuerySchema rejects non-numeric string userId", () => {
  const res = analyticsQuerySchema.safeParse({ userId: "admin" });
  assert.equal(res.success, false);
});

test("Schemas: analyticsQuerySchema rejects userId exceeding 32-bit integer limit", () => {
  const res = analyticsQuerySchema.safeParse({ userId: 3_000_000_000 });
  assert.equal(res.success, false);
});

test("Schemas: analyticsQuerySchema rejects rogue properties (.strict mass assignment protection)", () => {
  const res = analyticsQuerySchema.safeParse({ period: "month", injectAdmin: true });
  assert.equal(res.success, false);
});

test("Schemas: executiveQuerySchema accepts valid period and rejects extra properties", () => {
  const valid = executiveQuerySchema.safeParse({ period: "year" });
  assert.equal(valid.success, true);
  assert.equal(valid.data.period, "year");

  const extra = executiveQuerySchema.safeParse({ period: "year", extra: 123 });
  assert.equal(extra.success, false);
});

test("Helpers: parsePeriodParam normalizes strings safely", () => {
  assert.equal(parsePeriodParam("DAY"), "day");
  assert.equal(parsePeriodParam("week"), "week");
  assert.equal(parsePeriodParam("month"), "month");
  assert.equal(parsePeriodParam("YEAR"), "year");
  assert.equal(parsePeriodParam("all"), "all");
  assert.equal(parsePeriodParam(undefined), "month");
  assert.equal(parsePeriodParam("other"), "month");
});

test("Helpers: queryPositiveInt parses safe integers only", () => {
  assert.equal(queryPositiveInt("10"), 10);
  assert.equal(queryPositiveInt(99), 99);
  assert.equal(queryPositiveInt(""), undefined);
  assert.equal(queryPositiveInt(undefined), undefined);
  assert.equal(queryPositiveInt(null), undefined);
  assert.equal(queryPositiveInt("0"), undefined);
  assert.equal(queryPositiveInt("-5"), undefined);
  assert.equal(queryPositiveInt("1.5"), undefined);
  assert.equal(queryPositiveInt("abc"), undefined);
});

test("Helpers: siteLaunchDate returns a valid Date instance", () => {
  const d = siteLaunchDate();
  assert.ok(d instanceof Date);
  assert.equal(Number.isNaN(d.getTime()), false);
  assert.ok(d.getFullYear() >= 2026);
});
