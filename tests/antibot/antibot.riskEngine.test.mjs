import test from "node:test";
import assert from "node:assert/strict";

const { analyze, bandForScore } = await import("../../server/modules/antibot/antibot.riskEngine.ts");

test("bandForScore: classifies the 0-100 range into the 5 legacy bands", () => {
  assert.equal(bandForScore(0), "trusted");
  assert.equal(bandForScore(20), "trusted");
  assert.equal(bandForScore(21), "low");
  assert.equal(bandForScore(40), "low");
  assert.equal(bandForScore(41), "suspicious");
  assert.equal(bandForScore(60), "suspicious");
  assert.equal(bandForScore(61), "high");
  assert.equal(bandForScore(80), "high");
  assert.equal(bandForScore(81), "critical");
  assert.equal(bandForScore(100), "critical");
});

function makeFakePrisma({ evidenceCodes = [], trusted = false } = {}) {
  const profile = { userId: 1, riskScore: 0, trustScore: 100, peakRiskScore: 0, trusted, lastEventAt: null };
  const alertsCreated = [];
  const evidenceRows = [];

  const base = {
    antibotSession: {
      upsert: async () => ({}),
      findMany: async () => [],
      groupBy: async () => [],
    },
    antibotDevice: {
      upsert: async () => ({ accountCount: 1 }),
      update: async () => ({ accountCount: 1 }),
    },
    user: {
      findUnique: async () => null,
      count: async () => 0,
    },
    antibotProfile: {
      upsert: async () => profile,
      update: async (args) => {
        Object.assign(profile, args.data);
        return profile;
      },
    },
    antibotEvidence: {
      createMany: async ({ data }) => {
        evidenceRows.push(...data);
        return { count: data.length };
      },
      groupBy: async () => {
        const codes = new Set(evidenceRows.map((r) => r.code));
        // Also fold in codes injected directly via the `evidenceCodes` fixture (simulates
        // pre-existing evidence already in the scoring window).
        for (const c of evidenceCodes) codes.add(c);
        return Array.from(codes).map((code) => ({ code }));
      },
      updateMany: async () => ({ count: 0 }),
    },
    antibotAlert: {
      findFirst: async () => null,
      create: async ({ data }) => {
        alertsCreated.push(data);
        return data;
      },
    },
  };
  base.$transaction = async (fn) => fn(base);
  return { prisma: base, profile, alertsCreated, evidenceRows };
}

test("analyze: anonymous user (userId null) collects evidence but persists nothing, band is trusted", async () => {
  const { prisma } = makeFakePrisma();
  const result = await analyze({
    prisma,
    userId: null,
    telemetry: { browser: { webdriver: true } },
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "anon-1",
    eventType: "game:test",
  });
  assert.equal(result.scoreBefore, 0);
  assert.equal(result.scoreAfter, 0);
  assert.equal(result.band, "trusted");
  assert.ok(result.evidence.some((e) => e.code === "navigator_webdriver"));
});

test("analyze: logged-in user with a strong automation signal gets scored and a critical alert is created", async () => {
  const { prisma, alertsCreated } = makeFakePrisma();
  const result = await analyze({
    prisma,
    userId: 7,
    telemetry: { browser: { webdriver: true, headless: true } },
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "sess-1",
    eventType: "game:test",
  });
  assert.ok(result.scoreAfter > 0, "score must increase from strong automation signals");
  assert.ok(result.evidence.some((e) => e.code === "headless_browser"));
  assert.ok(alertsCreated.some((a) => a.type === "automation_detected"));
});

test("analyze: whitelisted (trusted) user is always pinned at score 0 regardless of evidence", async () => {
  const { prisma } = makeFakePrisma({ trusted: true });
  const result = await analyze({
    prisma,
    userId: 9,
    telemetry: { browser: { webdriver: true, puppeteer: true } },
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "sess-2",
    eventType: "game:test",
  });
  assert.equal(result.scoreAfter, 0);
  assert.equal(result.band, "trusted");
});

test("analyze: detector failures never throw or block the pipeline — the rest still runs", async () => {
  const { prisma } = makeFakePrisma();
  // Poison a call used by the session/relationship detectors; other detectors must still run.
  prisma.antibotSession.upsert = async () => {
    throw new Error("boom");
  };
  const result = await analyze({
    prisma,
    userId: 1,
    telemetry: { browser: { webdriver: true } },
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "sess-3",
    eventType: "game:test",
  });
  assert.ok(result.evidence.some((e) => e.code === "navigator_webdriver"), "headless detector evidence must still be present");
});

test("analyze: impossible_speed behavior evidence triggers an impossible_behavior alert", async () => {
  const { prisma, alertsCreated } = makeFakePrisma();
  await analyze({
    prisma,
    userId: 3,
    telemetry: { behavior: { impossibleSpeed: true } },
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "sess-4",
    eventType: "game:test",
  });
  assert.ok(alertsCreated.some((a) => a.type === "impossible_behavior"));
});
