import test from "node:test";
import assert from "node:assert/strict";

const {
  externalInvestmentCreateSchema,
  externalInvestmentUpdateSchema,
  parsePositiveIntParam,
  isSafeHttpUrl,
} = await import("../../server/modules/transparency/transparency.validation.ts");

test("parsePositiveIntParam: clamps to 32-bit positive integer", () => {
  assert.equal(parsePositiveIntParam("1"), 1);
  assert.equal(parsePositiveIntParam("42"), 42);
  assert.equal(parsePositiveIntParam(2_147_483_647), 2_147_483_647);
  // Rejects out of range (32-bit overflow)
  assert.equal(parsePositiveIntParam(2_147_483_648), null);
  assert.equal(parsePositiveIntParam("99999999999999999"), null);
  // Rejects invalid strings / negative / zero
  assert.equal(parsePositiveIntParam("0"), null);
  assert.equal(parsePositiveIntParam("-1"), null);
  assert.equal(parsePositiveIntParam("invalid"), null);
  assert.equal(parsePositiveIntParam(null), null);
});

test("isSafeHttpUrl: allows safe HTTP/HTTPS and relative asset paths", () => {
  assert.equal(isSafeHttpUrl("https://uniswap.org"), true);
  assert.equal(isSafeHttpUrl("http://localhost:3000"), true);
  assert.equal(isSafeHttpUrl("/uploads/transparency/logo.png"), true);
  assert.equal(isSafeHttpUrl(null), true);
  assert.equal(isSafeHttpUrl(""), true);
});

test("isSafeHttpUrl: rejects malicious schemes, data URIs and protocol-relative links", () => {
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="), false);
  assert.equal(isSafeHttpUrl("//attacker.com/evil.js"), false);
  assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
  assert.equal(isSafeHttpUrl("vbscript:msgbox(1)"), false);
});

test("externalInvestmentCreateSchema: validates clean input and sets defaults", () => {
  const payload = {
    name: "Aave V3 Protocol",
    amountInvestedUsd: 15000,
    amountWithdrawnUsd: 3200,
    linkUrl: "https://aave.com",
    imageUrl: "https://blockminer.space/logos/aave.png",
    roiForecast: "12% APY",
  };
  const parsed = externalInvestmentCreateSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.name, "Aave V3 Protocol");
  assert.equal(parsed.data.amountInvestedUsd, 15000);
  assert.equal(parsed.data.amountWithdrawnUsd, 3200);
  assert.equal(parsed.data.isActive, true);
  assert.equal(parsed.data.sortOrder, 0);
});

test("externalInvestmentCreateSchema: rejects negative amounts", () => {
  const badInvested = externalInvestmentCreateSchema.safeParse({
    name: "Bad Invested",
    amountInvestedUsd: -100,
  });
  assert.equal(badInvested.success, false);

  const badWithdrawn = externalInvestmentCreateSchema.safeParse({
    name: "Bad Withdrawn",
    amountWithdrawnUsd: -50,
  });
  assert.equal(badWithdrawn.success, false);
});

test("externalInvestmentCreateSchema: rejects short names < 2 chars", () => {
  assert.equal(externalInvestmentCreateSchema.safeParse({ name: "A" }).success, false);
  assert.equal(externalInvestmentCreateSchema.safeParse({ name: "  " }).success, false);
});

test("externalInvestmentCreateSchema: rejects mass assignment via .strict()", () => {
  const result = externalInvestmentCreateSchema.safeParse({
    name: "Valid Name",
    unrecognizedField: "malicious_injection",
    role: "superadmin",
  });
  assert.equal(result.success, false);
});

test("externalInvestmentUpdateSchema: allows partial fields and rejects mass assignment", () => {
  const partial = externalInvestmentUpdateSchema.safeParse({
    amountWithdrawnUsd: 5000,
    isActive: false,
  });
  assert.equal(partial.success, true);
  assert.equal(partial.data.amountWithdrawnUsd, 5000);
  assert.equal(partial.data.isActive, false);

  const extra = externalInvestmentUpdateSchema.safeParse({
    name: "Updated Name",
    unknownKey: true,
  });
  assert.equal(extra.success, false);
});
