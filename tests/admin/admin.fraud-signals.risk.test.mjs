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
  const sharedIp = `198.51.100.${(Date.now() % 200) + 10}`; // TEST-NET-2, not private/infrastructure — real scoring path.
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

  const result = await listAdminFraudSignals(prisma, { scope: "ips", q: sharedIp });
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

test("listAdminFraudSignals: duplicate device_fingerprint cluster is scored with the fingerprint identity vector", async (t) => {
  const suffix = `fraudriskfp_${Date.now()}`;
  const sharedFingerprint = `fp_shared_${Date.now()}`;
  const userA = await prisma.user.create({
    data: {
      name: "Fraud Risk Device A",
      username: `${suffix}_a`,
      email: `${suffix}_a@fraudtest.example`,
      passwordHash: "x",
    },
  });
  const userB = await prisma.user.create({
    data: {
      name: "Fraud Risk Device B",
      username: `${suffix}_b`,
      email: `${suffix}_b@fraudtest.example`,
      passwordHash: "x",
    },
  });

  const logA = await prisma.userIpLog.create({
    data: {
      userId: userA.id,
      ip: "198.51.100.88",
      deviceFingerprint: sharedFingerprint,
    },
  });
  const logB = await prisma.userIpLog.create({
    data: {
      userId: userB.id,
      ip: "198.51.100.89",
      deviceFingerprint: sharedFingerprint,
    },
  });

  t.after(async () => {
    await prisma.userIpLog.deleteMany({ where: { id: { in: [logA.id, logB.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }).catch(() => undefined);
  });

  const result = await listAdminFraudSignals(prisma, { scope: "devices", limit: 100 });
  const cluster = result.signals.find((s) => s.signalType === "device_fingerprint" && s.key === sharedFingerprint);
  assert.ok(cluster, "expected a device_fingerprint cluster for the shared device seeded above");
  assert.notEqual(cluster.riskLevel, "not_computed");
  assert.ok(cluster.riskScore > 0, "shared device fingerprint is a real identity vector, score must be > 0");
  assert.ok(cluster.identityVectors.includes("fingerprint"));
});

test.after(async () => {
  await prisma.$disconnect();
});
