import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env). Verifies that
// listAdminFraudSignals now returns REAL risk scores (via admin.multi-account-risk.ts,
// a port of legacy multiAccountRiskService.js) instead of the old
// `riskScore: null, riskLevel: "not_computed"` placeholders.
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { listAdminFraudSignals } = await import("../../server/modules/admin/admin.fraud-signals.service.ts");

test("listAdminFraudSignals: duplicate registration_ip cluster gets a real (non-null) risk score", async (t) => {
  const suffix = `fraudrisk_${Date.now()}`;
  const sharedIp = "198.51.100.77"; // TEST-NET-2, not private/infrastructure — real scoring path.
  const userA = await prisma.user.create({
    data: {
      name: "Fraud Risk Smoke A",
      username: `${suffix}_a`,
      email: `${suffix}_a@fraudtest.example`,
      passwordHash: "x",
      registrationIp: sharedIp,
    },
  });
  const userB = await prisma.user.create({
    data: {
      name: "Fraud Risk Smoke B",
      username: `${suffix}_b`,
      email: `${suffix}_b@fraudtest.example`,
      passwordHash: "x",
      registrationIp: sharedIp,
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }).catch(() => undefined);
    await prisma.ipIntelligenceCache.deleteMany({ where: { ip: sharedIp } }).catch(() => undefined);
  });

  const result = await listAdminFraudSignals(prisma, { scope: "ips" });
  assert.equal(result.ok, undefined); // service returns the payload, route wraps ok:true
  assert.ok(Array.isArray(result.signals));

  const cluster = result.signals.find((s) => s.signalType === "registration_ip" && s.key === sharedIp);
  assert.ok(cluster, "expected a registration_ip cluster for the shared IP seeded above");
  assert.equal(cluster.userCount, 2);

  // The core assertion: no more "not_computed" placeholder.
  assert.notEqual(cluster.riskLevel, "not_computed");
  assert.equal(typeof cluster.riskScore, "number");
  assert.ok(cluster.riskScore >= 0 && cluster.riskScore <= 100);
  assert.ok(["low", "medium", "high", "critical"].includes(cluster.riskLevel));
  assert.ok(["low", "medium", "high"].includes(cluster.confidence));
  assert.ok(Array.isArray(cluster.reasons) && cluster.reasons.length > 0);
  assert.ok(cluster.decision && typeof cluster.decision.recommendedAction === "string");
  // Shared IP alone is weak metadata — engine must never authorize automatic destructive action.
  assert.equal(cluster.decision.destructiveAllowed, false);

  assert.match(
    result.note,
    /risk-scored/i,
    "note should no longer claim 'no risk scoring'",
  );
});

test("listAdminFraudSignals: duplicate wallet_address cluster is scored with the wallet identity vector", async (t) => {
  const suffix = `fraudriskw_${Date.now()}`;
  const sharedWallet = "0x00000000000000000000000000000000c0ffee";
  const userA = await prisma.user.create({
    data: {
      name: "Fraud Risk Wallet A",
      username: `${suffix}_a`,
      email: `${suffix}_a@fraudtest.example`,
      passwordHash: "x",
      walletAddress: sharedWallet,
    },
  });
  const userB = await prisma.user.create({
    data: {
      name: "Fraud Risk Wallet B",
      username: `${suffix}_b`,
      email: `${suffix}_b@fraudtest.example`,
      passwordHash: "x",
      walletAddress: sharedWallet,
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }).catch(() => undefined);
  });

  const result = await listAdminFraudSignals(prisma, { scope: "wallets" });
  const cluster = result.signals.find((s) => s.signalType === "wallet" && s.key === sharedWallet.toLowerCase());
  assert.ok(cluster, "expected a wallet cluster for the shared wallet_address seeded above");
  assert.notEqual(cluster.riskLevel, "not_computed");
  assert.ok(cluster.riskScore > 0, "same profile wallet is a real identity vector, score must be > 0");
  assert.ok(cluster.identityVectors.includes("wallet"));
});

test.after(async () => {
  await prisma.$disconnect();
});
