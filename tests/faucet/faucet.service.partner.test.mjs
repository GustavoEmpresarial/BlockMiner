import test from "node:test";
import assert from "node:assert/strict";

const service = await import("../../server/modules/faucet/faucet.service.ts");

test("computePartnerState: no visit means not ready", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const state = service.computePartnerState(null, null, now);
  assert.equal(state.hasFreshVisit, false);
  assert.equal(state.partnerReady, false);
});

test("computePartnerState: fresh visit still waiting for the minimum time is not ready yet", () => {
  const now = new Date("2026-01-01T00:00:05Z");
  const visit = { openedAt: new Date("2026-01-01T00:00:00Z"), eligibleAt: new Date("2026-01-01T00:00:10Z") };
  const state = service.computePartnerState(null, visit, now);
  assert.equal(state.hasFreshVisit, true);
  assert.equal(state.partnerReady, false);
  assert.equal(state.waitRemainingMs, 5000);
});

test("computePartnerState: visit past its eligible time is ready", () => {
  const now = new Date("2026-01-01T00:00:15Z");
  const visit = { openedAt: new Date("2026-01-01T00:00:00Z"), eligibleAt: new Date("2026-01-01T00:00:10Z") };
  const state = service.computePartnerState(null, visit, now);
  assert.equal(state.partnerReady, true);
  assert.equal(state.waitRemainingMs, 0);
});

test("computePartnerState: a visit opened before the last claim does not count as fresh", () => {
  const now = new Date("2026-01-02T00:00:15Z");
  const record = { claimedAt: new Date("2026-01-02T00:00:00Z") };
  const visit = { openedAt: new Date("2026-01-01T00:00:00Z"), eligibleAt: new Date("2026-01-01T00:00:10Z") };
  const state = service.computePartnerState(record, visit, now);
  assert.equal(state.hasFreshVisit, false);
  assert.equal(state.partnerReady, false);
});
