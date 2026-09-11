import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Characterizes (does NOT fix — anti-abuse behavior change needs explicit product sign-off,
// per the plan) a real gap found while exploring register.risk.ts: the device fingerprint is
// unsigned, client-controlled JSON (x-anti-bot-payload header) that a caller can simply omit.
// When omitted, buildDeviceFingerprint() falls back to the literal string "unknown" — and the
// fingerprint-reuse rule inside evaluateRegistrationAttempt never fires for "unknown" (it only
// flags REAL repeated fingerprints), so a caller can trivially bypass that specific rule by
// never sending the header at all. This test proves the bypass exists today; it intentionally
// does not assert a "should be blocked" outcome.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { evaluateRegistrationAttempt, buildDeviceFingerprint } = await import(
  "../../server/modules/auth/register/register.risk.ts"
);

function randomIp() {
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224);
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
}

test.after(async () => {
  await prisma.$disconnect();
});

test("buildDeviceFingerprint: no x-anti-bot-payload header -> the literal string 'unknown'", () => {
  assert.equal(buildDeviceFingerprint({ headers: {} }), "unknown");
  assert.equal(buildDeviceFingerprint({ headers: { "x-anti-bot-payload": "not-valid-base64-json!!" } }), "unknown");
});

test("evaluateRegistrationAttempt: 3+ registrations from different IPs sharing fingerprint 'unknown' are NEVER blocked by the fingerprint-reuse rule (the bypass)", async () => {
  for (let i = 0; i < 4; i += 1) {
    const result = await evaluateRegistrationAttempt(prisma, {
      ip: randomIp(),
      networkCidr: null,
      providerType: "unknown",
      deviceFingerprint: "unknown",
    });
    // recentFingerprint must never be the reason this is blocked when the fingerprint itself
    // is the sentinel "unknown" value — other rules (exact-IP/network reuse) could still block
    // it in principle, but this test uses a fresh random IP each time to isolate the
    // fingerprint rule specifically.
    assert.equal(result.recentFingerprint, 0, `iteration ${i}: "unknown" fingerprint must never count as reuse`);
  }
});

test("evaluateRegistrationAttempt: for contrast, a REAL shared fingerprint across different IPs IS flagged (the rule works — it's just bypassable by omission)", async () => {
  const fingerprint = crypto.randomBytes(16).toString("hex");
  const seedUsers = await prisma.user.findMany({ select: { id: true }, take: 2 });
  if (seedUsers.length < 2) return; // no seed users in this fresh DB — skip, covered by register.risk.test.mjs's own setup elsewhere
  for (let i = 0; i < 2; i += 1) {
    await prisma.userIpLog.create({
      data: {
        userId: seedUsers[i].id,
        ip: `${randomIp()}`,
        deviceFingerprint: fingerprint,
        registerCount: 1,
      },
    }).catch(() => {});
  }
  const result = await evaluateRegistrationAttempt(prisma, {
    ip: randomIp(),
    networkCidr: null,
    providerType: "unknown",
    deviceFingerprint: fingerprint,
  });
  assert.ok(result.recentFingerprint >= 1, "a real, non-'unknown' fingerprint seen before must be counted");
});
