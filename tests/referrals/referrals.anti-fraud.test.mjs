import test from "node:test";
import assert from "node:assert/strict";
import { isDisposableEmail, extractEmailDomain } from "../../server/shared/security/disposableEmail.ts";
import { evaluateReferralLinkFraud } from "../../server/modules/referrals/referrals.anti-abuse.ts";
import { tournamentHubCategory } from "../../client/src/features/tournaments/lib/tournamentHubCategory.ts";
import {
  isReferralMetric,
  scoreColumnI18nKey,
  scoreTotalI18nKey,
} from "../../client/src/features/tournaments/lib/tournamentMetricDisplay.ts";

test("extractEmailDomain correctly parses domains", () => {
  assert.equal(extractEmailDomain("user@example.com"), "example.com");
  assert.equal(extractEmailDomain("USER@GMAIL.COM"), "gmail.com");
  assert.equal(extractEmailDomain("invalid-email"), "");
});

test("isDisposableEmail allows legitimate email providers", () => {
  const legit = [
    "gustavo@gmail.com",
    "player@outlook.com",
    "miner@yahoo.com.br",
    "user@hotmail.com",
    "crypto@proton.me",
    "admin@blockminer.space",
    "test@icloud.com",
  ];
  for (const email of legit) {
    assert.equal(isDisposableEmail(email), false, `${email} should be allowed`);
  }
});

test("isDisposableEmail blocks known burner and disposable providers", () => {
  const disposable = [
    "bot@temp-mail.org",
    "fake@10minutemail.com",
    "cheat@guerrillamail.biz",
    "anon@mailinator.com",
    "throw@yopmail.com",
    "trash@trashmail.com",
    "spammer@dispostable.com",
    "bad@fakeinbox.com",
    "bot@sharklasers.com",
    "subdomain@box.yopmail.com",
    "custom@my-tempmail-service.net",
  ];
  for (const email of disposable) {
    assert.equal(isDisposableEmail(email), true, `${email} should be blocked`);
  }
});

test("evaluateReferralLinkFraud blocks exact same IP", async () => {
  const mockPrisma = {
    user: {
      findUnique: async () => ({ userAgent: "Mozilla/5.0 Chrome/120" }),
      findMany: async () => [],
    },
    antibotSession: { findFirst: async () => null },
    userIpLog: { findFirst: async () => null },
  };

  const verdict = await evaluateReferralLinkFraud(mockPrisma, {
    referrer: {
      id: 10,
      username: "padrinho",
      ip: "187.20.10.5",
      registrationIp: "187.20.10.5",
    },
    refereeIp: "187.20.10.5",
    refereeFingerprint: "fp_xyz_123456789",
    refereeUserAgent: "Mozilla/5.0 Firefox/120",
  });

  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.includes("same_exact_ip"));
});

test("evaluateReferralLinkFraud blocks same subnet + same user agent", async () => {
  const mockPrisma = {
    user: {
      findUnique: async () => ({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }),
      findMany: async () => [],
    },
    antibotSession: { findFirst: async () => null },
    userIpLog: { findFirst: async () => null },
  };

  const verdict = await evaluateReferralLinkFraud(mockPrisma, {
    referrer: {
      id: 10,
      username: "padrinho",
      ip: "192.168.1.10",
      registrationIp: "192.168.1.10",
    },
    refereeIp: "192.168.1.20", // Same /24
    refereeFingerprint: "fp_xyz_clean",
    refereeUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });

  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.includes("same_subnet_and_user_agent"));
});

test("evaluateReferralLinkFraud blocks matching device fingerprint", async () => {
  const mockPrisma = {
    user: {
      findUnique: async () => ({ userAgent: "Chrome" }),
      findMany: async () => [],
    },
    antibotSession: {
      findFirst: async () => ({ id: 99 }), // Found matching session for referrer!
    },
    userIpLog: { findFirst: async () => null },
  };

  const verdict = await evaluateReferralLinkFraud(mockPrisma, {
    referrer: {
      id: 10,
      username: "padrinho",
      ip: "200.50.10.1",
      registrationIp: "200.50.10.1",
    },
    refereeIp: "177.30.20.2", // Different IP
    refereeFingerprint: "fp_attacker_canvas_hash_12345",
    refereeUserAgent: "Mozilla/5.0 Different",
  });

  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.includes("same_device_fingerprint"));
});

test("evaluateReferralLinkFraud allows legitimate separate users", async () => {
  const mockPrisma = {
    user: {
      findUnique: async () => ({ userAgent: "Mozilla/5.0 (Windows)" }),
      findMany: async () => [],
    },
    antibotSession: { findFirst: async () => null },
    userIpLog: { findFirst: async () => null },
  };

  const verdict = await evaluateReferralLinkFraud(mockPrisma, {
    referrer: {
      id: 10,
      username: "padrinho",
      ip: "200.50.10.1",
      registrationIp: "200.50.10.1",
    },
    refereeIp: "189.60.70.80",
    refereeFingerprint: "fp_distinct_device_987654321",
    refereeUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reasons.length, 0);
});

test("frontend tournament display helpers support REFERRALS metric", () => {
  assert.equal(tournamentHubCategory("REFERRALS"), "referral");
  assert.equal(isReferralMetric("REFERRALS"), true);
  assert.equal(isReferralMetric("YOUTUBE"), false);
  assert.equal(scoreColumnI18nKey("REFERRALS"), "tournaments.referrals_column");
  assert.equal(scoreTotalI18nKey("REFERRALS"), "tournaments.referrals_total");
});
