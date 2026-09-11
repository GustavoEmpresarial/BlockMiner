import test from "node:test";
import assert from "node:assert/strict";

const { calculateMultiAccountRisk } = await import("../../server/modules/admin/admin.multi-account-risk.ts");

test("calculateMultiAccountRisk: infrastructure/private IP is ignored (score 0, low, infrastructure_ignored)", () => {
  const risk = calculateMultiAccountRisk({
    signalType: "registration_ip",
    key: "172.18.0.5",
    userCount: 3,
    users: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  assert.equal(risk.score, 0);
  assert.equal(risk.level, "low");
  assert.equal(risk.recommendedAction, "infrastructure_ignored");
  assert.equal(risk.correlation.mandatorySatisfied, false);
});

test("calculateMultiAccountRisk: shared IP alone (weak metadata) never reaches destructive action", () => {
  const risk = calculateMultiAccountRisk({
    signalType: "registration_ip",
    key: "203.0.113.10",
    userCount: 2,
    users: [{ id: 1 }, { id: 2 }],
  });
  assert.ok(risk.score < 45, `expected weak IP-only score, got ${risk.score}`);
  assert.equal(risk.decision.destructiveAllowed, false);
  assert.ok(
    ["monitor", "shared_ip_low_confidence", "ignore"].includes(risk.recommendedAction),
    `expected a conservative action, got ${risk.recommendedAction}`,
  );
  assert.ok(risk.falsePositiveWarnings.some((w) => /IP compartilhado/i.test(w)));
});

test("calculateMultiAccountRisk: same profile wallet across accounts scores as a real identity vector", () => {
  const risk = calculateMultiAccountRisk({
    signalType: "profile_wallet",
    key: "0xabc0000000000000000000000000000000dead",
    userCount: 2,
    users: [
      { id: 1, walletAddress: "0xabc0000000000000000000000000000000dead" },
      { id: 2, walletAddress: "0xabc0000000000000000000000000000000dead" },
    ],
  });
  assert.ok(risk.score > 0);
  assert.ok(risk.identityVectors.includes("wallet"));
  assert.equal(risk.correlation.wallet, true);
});

test("calculateMultiAccountRisk: device_fingerprint signal is a strong identity vector", () => {
  const risk = calculateMultiAccountRisk({
    signalType: "device_fingerprint",
    key: "fp-shared-1",
    userCount: 2,
    users: [{ id: 1 }, { id: 2 }],
  });
  assert.ok(risk.identityVectors.includes("fingerprint"));
  assert.equal(risk.correlation.fingerprint, true);
  assert.ok(risk.score >= 34);
});

test("calculateMultiAccountRisk: wallet + fingerprint + suspicious ASN/provider converge into high_confidence_cluster only above threshold", () => {
  const users = [
    { id: 1, walletAddress: "0xabc0000000000000000000000000000000dead", userAgent: "shared-ua" },
    { id: 2, walletAddress: "0xabc0000000000000000000000000000000dead", userAgent: "shared-ua" },
    { id: 3, walletAddress: "0xabc0000000000000000000000000000000dead", userAgent: "shared-ua" },
  ];
  const risk = calculateMultiAccountRisk({
    signalType: "device_fingerprint",
    key: "fp-shared-2",
    userCount: 3,
    users,
    sameWalletCount: 1,
    sameDeviceCount: 1,
    ipIntelligence: { providerType: "hosting" },
  });
  assert.equal(risk.correlation.mandatorySatisfied, true);
  assert.ok(["review_candidate", "high_confidence_cluster"].includes(risk.recommendedAction));
  assert.equal(risk.decision.destructiveAllowed, false, "engine never authorizes automatic destructive action");
});

test("calculateMultiAccountRisk: level thresholds follow score bands (low/medium/high/critical)", () => {
  const low = calculateMultiAccountRisk({ signalType: "registration_ip", key: "203.0.113.20", userCount: 2, users: [{ id: 1 }, { id: 2 }] });
  assert.equal(low.level, "low");

  const medium = calculateMultiAccountRisk({
    signalType: "profile_wallet",
    key: "0xdef0000000000000000000000000000000beef",
    userCount: 4,
    users: [
      { id: 1, walletAddress: "0xdef0000000000000000000000000000000beef" },
      { id: 2, walletAddress: "0xdef0000000000000000000000000000000beef" },
      { id: 3, walletAddress: "0xdef0000000000000000000000000000000beef" },
      { id: 4, walletAddress: "0xdef0000000000000000000000000000000beef" },
    ],
    sameDeviceCount: 1,
    shortCreationWindow: true,
    ipIntelligence: { providerType: "hosting" },
  });
  assert.ok(["medium", "high", "critical"].includes(medium.level), `expected a bumped level, got ${medium.level} (score ${medium.score})`);
});

test("calculateMultiAccountRisk: never returns a score outside [0,100]", () => {
  const risk = calculateMultiAccountRisk({
    signalType: "device_fingerprint",
    key: "fp-extreme",
    userCount: 50,
    users: Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      walletAddress: "0xabc0000000000000000000000000000000dead",
      userAgent: "same-ua",
    })),
    sameWalletCount: 1,
    sameDeviceCount: 1,
    similarIdentityCount: 1,
    shortCreationWindow: true,
    ipIntelligence: { providerType: "hosting", proxyDetected: true, proxyType: "vpn" },
  });
  assert.ok(risk.score >= 0 && risk.score <= 100);
});
