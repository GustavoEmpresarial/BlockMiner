import assert from "node:assert/strict";
import test from "node:test";
import {
  FAUCET_CLAIM_MEASURED,
  buildFaucetClaimMeasurement,
  emitFaucetClaimMeasurement,
  normalizeFaucetPartnerVisitSource,
} from "../../server/modules/faucet/faucet.measure.ts";

test("a missing or unexpected visit source is unknown", () => {
  assert.equal(normalizeFaucetPartnerVisitSource(undefined), "unknown");
  assert.equal(normalizeFaucetPartnerVisitSource(null), "unknown");
  assert.equal(normalizeFaucetPartnerVisitSource(""), "unknown");
  assert.equal(normalizeFaucetPartnerVisitSource("CLICK"), "unknown");
  assert.equal(normalizeFaucetPartnerVisitSource("script"), "unknown");
});

test("click and blur are kept", () => {
  assert.equal(normalizeFaucetPartnerVisitSource("click"), "click");
  assert.equal(normalizeFaucetPartnerVisitSource("blur"), "blur");
});

test("the claim record measures both clocks and keeps the audit fields it was given", () => {
  const now = new Date("2026-01-01T00:00:12.500Z");
  const measured = buildFaucetClaimMeasurement({
    userId: 42,
    now,
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    eligibleAt: new Date("2026-01-01T00:00:10.000Z"),
    source: "blur",
    userAgent: "lab-agent",
    ipHash: "abc",
    correlationId: "corr-1",
  });
  assert.equal(measured.msSinceVisitOpened, 12_500);
  assert.equal(measured.msSinceEligible, 2_500);
  assert.equal(measured.source, "blur");
  assert.equal(measured.userAgent, "lab-agent");
  assert.equal(measured.ipHash, "abc");
  assert.equal(measured.correlationId, "corr-1");
  assert.equal("ip" in measured, false);
  assert.equal("email" in measured, false);
});

test("a stored null source is logged as unknown", () => {
  const measured = buildFaucetClaimMeasurement({
    userId: 1,
    now: new Date("2026-01-01T00:00:10.000Z"),
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    eligibleAt: new Date("2026-01-01T00:00:10.000Z"),
    source: null,
    userAgent: null,
    ipHash: null,
    correlationId: null,
  });
  assert.equal(measured.source, "unknown");
  assert.equal(measured.msSinceEligible, 0);
});

test("a throwing measurement sink does not escape", () => {
  const warnings = [];
  emitFaucetClaimMeasurement(
    {
      info() {
        throw new Error("disk full");
      },
      warn(_message, details) {
        warnings.push(details);
      },
    },
    buildFaucetClaimMeasurement({
      userId: 7,
      now: new Date("2026-01-01T00:00:10.000Z"),
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      eligibleAt: new Date("2026-01-01T00:00:10.000Z"),
      source: "click",
      userAgent: null,
      ipHash: null,
      correlationId: null,
    }),
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].userId, 7);

  emitFaucetClaimMeasurement(
    {
      info() {
        throw new Error("disk full");
      },
      warn() {
        throw new Error("still full");
      },
    },
    buildFaucetClaimMeasurement({
      userId: 7,
      now: new Date("2026-01-01T00:00:10.000Z"),
      openedAt: null,
      eligibleAt: null,
      source: "click",
      userAgent: null,
      ipHash: null,
      correlationId: null,
    }),
  );
  assert.equal(FAUCET_CLAIM_MEASURED, "faucet.claim.measured");
});
