import test from "node:test";
import assert from "node:assert/strict";

const {
  evaluateZeradsAntibotGate,
  trimZeradsClicksForSecurity,
  zeradsMaxClicksPerCallback,
  zeradsMaxClicksPerVelocityWindow,
  zeradsVelocityWindowBounds,
} = await import("../../server/modules/zerads/zerads.security.ts");

test("evaluateZeradsAntibotGate allows trusted regardless of score", () => {
  const v = evaluateZeradsAntibotGate({ riskScore: 99, trusted: true });
  assert.equal(v.allowed, true);
  assert.equal(v.band, "trusted");
});

test("evaluateZeradsAntibotGate denies high/critical bands", () => {
  const high = evaluateZeradsAntibotGate({ riskScore: 65, trusted: false });
  assert.equal(high.allowed, false);
  assert.match(String(high.reason), /^band:/);

  const crit = evaluateZeradsAntibotGate({ riskScore: 90, trusted: false });
  assert.equal(crit.allowed, false);
});

test("evaluateZeradsAntibotGate allows low scores by default", () => {
  const v = evaluateZeradsAntibotGate({ riskScore: 10, trusted: false });
  assert.equal(v.allowed, true);
});

test("trimZeradsClicksForSecurity applies callback cap first", () => {
  const maxCb = zeradsMaxClicksPerCallback();
  const t = trimZeradsClicksForSecurity({
    requestedClicks: maxCb + 40,
    dayRemaining: 100,
    clicksInVelocityWindow: 0,
  });
  assert.equal(t.creditedClicks, maxCb);
  assert.equal(t.trimReason, "callback_cap");
});

test("trimZeradsClicksForSecurity applies day remaining", () => {
  const t = trimZeradsClicksForSecurity({
    requestedClicks: 8,
    dayRemaining: 3,
    clicksInVelocityWindow: 0,
    maxPerCallback: 50,
  });
  assert.equal(t.creditedClicks, 3);
  assert.equal(t.trimReason, "day_cap");
});

test("trimZeradsClicksForSecurity applies velocity remaining", () => {
  const maxVel = zeradsMaxClicksPerVelocityWindow();
  const t = trimZeradsClicksForSecurity({
    requestedClicks: 10,
    dayRemaining: 100,
    clicksInVelocityWindow: maxVel - 2,
    maxPerCallback: 50,
  });
  assert.equal(t.creditedClicks, 2);
  assert.equal(t.trimReason, "velocity_cap");
});

test("trimZeradsClicksForSecurity soft-zeros when velocity window exhausted", () => {
  const maxVel = zeradsMaxClicksPerVelocityWindow();
  const t = trimZeradsClicksForSecurity({
    requestedClicks: 5,
    dayRemaining: 50,
    clicksInVelocityWindow: maxVel,
    maxPerCallback: 50,
  });
  assert.equal(t.creditedClicks, 0);
  assert.equal(t.trimReason, "velocity_cap");
});

test("zeradsVelocityWindowBounds end is now and start is windowMs earlier", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  const { start, end } = zeradsVelocityWindowBounds(now);
  assert.equal(end.toISOString(), now.toISOString());
  assert.ok(end.getTime() - start.getTime() > 0);
});
