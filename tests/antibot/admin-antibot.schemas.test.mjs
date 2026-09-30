import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/antibot/antibot.schemas.ts");

// ─── antibotIdParamSchema ────────────────────────────────────────────────────

test("antibotIdParamSchema: accepts valid integer id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "10" });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 10);
});

test("antibotIdParamSchema: rejects negative id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "-5" });
  assert.equal(result.success, false);
});

test("antibotIdParamSchema: rejects zero id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "0" });
  assert.equal(result.success, false);
});

test("antibotIdParamSchema: rejects float id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "12.34" });
  assert.equal(result.success, false);
});

test("antibotIdParamSchema: rejects 32-bit overflow id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "2147483648" });
  assert.equal(result.success, false);
});

test("antibotIdParamSchema: rejects non-numeric id", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "alert-abc" });
  assert.equal(result.success, false);
});

test("antibotIdParamSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.antibotIdParamSchema.safeParse({ id: "1", role: "super_admin" });
  assert.equal(result.success, false);
});

// ─── antibotUserIdParamSchema ────────────────────────────────────────────────

test("antibotUserIdParamSchema: accepts valid integer user id", () => {
  const result = schemas.antibotUserIdParamSchema.safeParse({ id: "42" });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 42);
});

test("antibotUserIdParamSchema: rejects negative user id", () => {
  const result = schemas.antibotUserIdParamSchema.safeParse({ id: "-1" });
  assert.equal(result.success, false);
});

test("antibotUserIdParamSchema: rejects 32-bit overflow user id", () => {
  const result = schemas.antibotUserIdParamSchema.safeParse({ id: "99999999999" });
  assert.equal(result.success, false);
});

test("antibotUserIdParamSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.antibotUserIdParamSchema.safeParse({ id: "1", isAdmin: true });
  assert.equal(result.success, false);
});

// ─── adminAntibotOverviewQuerySchema ─────────────────────────────────────────

test("adminAntibotOverviewQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminAntibotOverviewQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.limit, 20);
});

test("adminAntibotOverviewQuerySchema: accepts custom valid limit", () => {
  const result = schemas.adminAntibotOverviewQuerySchema.safeParse({ limit: "50" });
  assert.equal(result.success, true);
  assert.equal(result.data.limit, 50);
});

test("adminAntibotOverviewQuerySchema: rejects limit out of bounds (< 1 or > 100)", () => {
  const low = schemas.adminAntibotOverviewQuerySchema.safeParse({ limit: "0" });
  assert.equal(low.success, false);

  const high = schemas.adminAntibotOverviewQuerySchema.safeParse({ limit: "150" });
  assert.equal(high.success, false);
});

test("adminAntibotOverviewQuerySchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminAntibotOverviewQuerySchema.safeParse({ limit: 10, rogue: true });
  assert.equal(result.success, false);
});

// ─── adminAntibotListEvidenceQuerySchema ─────────────────────────────────────

test("adminAntibotListEvidenceQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminAntibotListEvidenceQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 50);
});

test("adminAntibotListEvidenceQuerySchema: accepts valid filters and severity enum", () => {
  const result = schemas.adminAntibotListEvidenceQuerySchema.safeParse({
    page: "2",
    limit: "100",
    userId: "15",
    detector: "behavior",
    code: "impossible_speed",
    severity: "critical",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 100);
  assert.equal(result.data.userId, 15);
  assert.equal(result.data.severity, "critical");
});

test("adminAntibotListEvidenceQuerySchema: rejects invalid severity enum", () => {
  const result = schemas.adminAntibotListEvidenceQuerySchema.safeParse({ severity: "fatal_error" });
  assert.equal(result.success, false);
});

test("adminAntibotListEvidenceQuerySchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminAntibotListEvidenceQuerySchema.safeParse({ page: 1, hack: "drop" });
  assert.equal(result.success, false);
});

// ─── adminUpdateAlertSchema ──────────────────────────────────────────────────

test("adminUpdateAlertSchema: accepts open, acknowledged, resolved", () => {
  for (const status of ["open", "acknowledged", "resolved"]) {
    const res = schemas.adminUpdateAlertSchema.safeParse({ status });
    assert.equal(res.success, true);
    assert.equal(res.data.status, status);
  }
});

test("adminUpdateAlertSchema: rejects invalid status", () => {
  const res = schemas.adminUpdateAlertSchema.safeParse({ status: "closed" });
  assert.equal(res.success, false);
});

test("adminUpdateAlertSchema: rejects unknown properties (.strict)", () => {
  const res = schemas.adminUpdateAlertSchema.safeParse({ status: "resolved", force: true });
  assert.equal(res.success, false);
});

// ─── adminSetTrustedSchema ───────────────────────────────────────────────────

test("adminSetTrustedSchema: accepts valid trusted boolean and reason", () => {
  const res = schemas.adminSetTrustedSchema.safeParse({
    trusted: true,
    reason: "Jogador verificado em chamada de vídeo pelo suporte.",
  });
  assert.equal(res.success, true);
  assert.equal(res.data.trusted, true);
  assert.equal(res.data.reason, "Jogador verificado em chamada de vídeo pelo suporte.");
});

test("adminSetTrustedSchema: applies defaults when empty", () => {
  const res = schemas.adminSetTrustedSchema.safeParse({});
  assert.equal(res.success, true);
  assert.equal(res.data.trusted, true);
});

test("adminSetTrustedSchema: rejects reason exceeding 300 characters", () => {
  const res = schemas.adminSetTrustedSchema.safeParse({
    reason: "a".repeat(301),
  });
  assert.equal(res.success, false);
});

test("adminSetTrustedSchema: rejects unknown properties (.strict mass assignment)", () => {
  const res = schemas.adminSetTrustedSchema.safeParse({
    trusted: true,
    riskScore: 0,
  });
  assert.equal(res.success, false);
});

// ─── adminUserProfileQuerySchema ─────────────────────────────────────────────

test("adminUserProfileQuerySchema: applies defaults when empty", () => {
  const res = schemas.adminUserProfileQuerySchema.safeParse({});
  assert.equal(res.success, true);
  assert.equal(res.data.evidenceLimit, 100);
});

test("adminUserProfileQuerySchema: accepts custom evidenceLimit within bounds", () => {
  const res = schemas.adminUserProfileQuerySchema.safeParse({ evidenceLimit: "250" });
  assert.equal(res.success, true);
  assert.equal(res.data.evidenceLimit, 250);
});

test("adminUserProfileQuerySchema: rejects evidenceLimit exceeding 500", () => {
  const res = schemas.adminUserProfileQuerySchema.safeParse({ evidenceLimit: "1000" });
  assert.equal(res.success, false);
});

test("adminUserProfileQuerySchema: rejects unknown properties (.strict)", () => {
  const res = schemas.adminUserProfileQuerySchema.safeParse({ evidenceLimit: 50, secret: "leak" });
  assert.equal(res.success, false);
});
