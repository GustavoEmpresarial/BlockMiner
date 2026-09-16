/**
 * Unit: client-safe error messages + infrastructure classification.
 *
 * Production leak (15/09/2026, admin "Erros de cliente"): /api/auto-mining-gpu/v2/claim/normal
 * and /api/ptc/... answered 400 with the raw Prisma text, e.g.
 *   Invalid `prisma.autoMiningV2PowerGrant.create()` invocation:
 *   Transaction API error: A query cannot be executed on an expired transaction...
 * That is internal schema disclosure AND the wrong status (the user did nothing wrong).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyInfrastructureError,
  isPrismaInfrastructureError,
  looksLikeInternalErrorMessage,
  safeClientErrorMessage,
} from "../../server/shared/errors/prismaHttpErrors.ts";

const REAL_P2028 = Object.assign(
  new Error(
    "\nInvalid `prisma.autoMiningV2PowerGrant.create()` invocation:\n\n\nTransaction API error: " +
      "A query cannot be executed on an expired transaction. The timeout for this transaction was " +
      "15000 ms, however 15021 ms passed since the start of the transaction.",
  ),
  { code: "P2028" },
);

describe("safeClientErrorMessage", () => {
  it("never echoes a raw Prisma invocation dump", () => {
    const out = safeClientErrorMessage(REAL_P2028, "Request failed");
    assert.equal(out, "Request failed");
    assert.ok(!out.includes("prisma."));
    assert.ok(!out.includes("autoMiningV2PowerGrant"));
  });

  it("keeps a real business message the UI is meant to show", () => {
    assert.equal(
      safeClientErrorMessage(new Error("Saldo insuficiente para essa compra."), "Request failed"),
      "Saldo insuficiente para essa compra.",
    );
  });

  it("falls back for an empty or oversized message", () => {
    assert.equal(safeClientErrorMessage(new Error("   "), "fallback"), "fallback");
    assert.equal(safeClientErrorMessage(new Error("x".repeat(400)), "fallback"), "fallback");
  });

  it("flags Prisma error codes embedded in a message", () => {
    assert.equal(looksLikeInternalErrorMessage("Unique constraint failed (P2002)"), true);
    assert.equal(looksLikeInternalErrorMessage("Você não minerou nada ontem."), false);
  });
});

describe("classifyInfrastructureError", () => {
  it("maps an expired interactive transaction to a retryable 503", () => {
    const out = classifyInfrastructureError(REAL_P2028);
    assert.ok(out, "P2028 must classify as infrastructure");
    assert.equal(out.status, 503);
    assert.equal(out.code, "SERVICE_BUSY");
    assert.ok(!out.message.includes("prisma"));
  });

  it("maps a write conflict / deadlock (P2034) to the same retryable 503", () => {
    const out = classifyInfrastructureError(Object.assign(new Error("write conflict"), { code: "P2034" }));
    assert.equal(out?.status, 503);
  });

  it("maps a schema mismatch to SCHEMA_OUT_OF_DATE", () => {
    const out = classifyInfrastructureError(Object.assign(new Error("column does not exist"), { code: "P2021" }));
    assert.equal(out?.code, "SCHEMA_OUT_OF_DATE");
  });

  it("leaves real business errors alone (they stay 4xx)", () => {
    assert.equal(classifyInfrastructureError(new Error("CLAIM_NOT_DUE")), null);
    assert.equal(isPrismaInfrastructureError(new Error("CLAIM_NOT_DUE")), false);
  });

  it("does not treat a unique-constraint conflict as infrastructure", () => {
    // P2002 is a real conflict to answer 409, not a retryable 503.
    assert.equal(classifyInfrastructureError(Object.assign(new Error("unique"), { code: "P2002" })), null);
  });
});
