import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;

const at = (iso) => new Date(iso);
const calls = {};

/** Mimics findMany: applies the where filters the scoring code relies on. */
function table(name, rows, timeField) {
  return {
    findMany: async (args) => {
      calls[name] = args;
      const w = args.where;
      return rows.filter((r) => {
        if (w.userId != null && r.userId !== w.userId) return false;
        if (w.status != null && r.status !== w.status) return false;
        if (w.user?.isBanned === false && r.banned) return false;
        const t = r[timeField];
        const range = w[timeField];
        if (range.gte && t < range.gte) return false;
        if (range.lt && t >= range.lt) return false;
        return true;
      });
    },
  };
}

const prismaMock = {
  internalOfferwallAttempt: table("internal", [
    { userId: 1, status: "COMPLETED", completedAt: at("2026-10-10T01:00:00Z") },
    { userId: 1, status: "COMPLETED", completedAt: at("2026-10-10T02:00:00Z") },
  ], "completedAt"),
  offerwallMeCallback: table("ome", [
    { userId: 1, status: 1, createdAt: at("2026-10-10T03:00:00Z") },
    { userId: 1, status: 2, createdAt: at("2026-10-10T03:30:00Z") },
  ], "createdAt"),
  moneyRainCallback: table("moneyRain", [
    { userId: 2, createdAt: at("2026-10-10T05:00:00Z") },
    // Exactly at the end of the window: belongs to the next day.
    { userId: 2, createdAt: at("2026-10-11T00:00:00Z") },
  ], "createdAt"),
  multiwallCallback: table("multiwall", [
    { userId: 3, status: 1, createdAt: at("2026-10-09T23:00:00Z") },
    { userId: 3, status: 1, createdAt: at("2026-10-10T04:00:00Z") },
  ], "createdAt"),
  offerwallGgCallback: table("gg", [
    { userId: 4, status: 1, createdAt: at("2026-10-10T06:00:00Z") },
    { userId: 9, status: 1, createdAt: at("2026-10-10T06:00:00Z"), banned: true },
  ], "createdAt"),
  zeradsCallback: table("zerads", [
    { userId: 5, callbackAt: at("2026-10-10T01:00:00Z"), clicks: 60 },
    { userId: 5, callbackAt: at("2026-10-10T02:00:00Z"), clicks: 60 },
    // Over the daily cap: counted as raw only, must not move reachedAt.
    { userId: 5, callbackAt: at("2026-10-10T09:00:00Z"), clicks: 10 },
  ], "callbackAt"),
};

mock.module(prismaSpec, { defaultExport: prismaMock });

const { computeOfferwallScores, OFFERWALL_SOURCES, sourcesForOffersMetric, offerwallScoringRules } =
  await import("../../server/modules/tournaments/tournaments.scoring-config.ts");
const { providersForOfferwallMetric } = await import(
  "../../server/modules/tournaments/tournaments.providers.ts"
);
const { assignRanks } = await import("../../server/modules/tournaments/tournaments.prize-resolution.ts");

const start = at("2026-10-10T00:00:00Z");
const end = at("2026-10-11T00:00:00Z");

test("every provider allowed for an offerwall metric has exactly one scoring source", () => {
  for (const metric of ["OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"]) {
    const providers = [...providersForOfferwallMetric(metric)].sort();
    const sources = sourcesForOffersMetric(metric).map((s) => s.provider).sort();
    assert.deepEqual(sources, providers, metric);
  }
  assert.equal(new Set(OFFERWALL_SOURCES.map((s) => s.key)).size, OFFERWALL_SOURCES.length);
});

test("OFFERS_ALL sums every source with its own rule", async () => {
  const scores = await computeOfferwallScores(start, end, { metric: "OFFERS_ALL" });
  const u1 = scores.get(1);
  assert.equal(u1.internal, 2);
  assert.equal(u1.offerwallMe, 1, "chargebacks (status 2) never score");
  assert.equal(u1.total, 3);
  assert.equal(scores.get(2).total, 1, "an event exactly at endsAt belongs to the next window");
  assert.equal(scores.get(4).offerwallGg, 1);
  assert.equal(scores.has(9), false, "banned accounts never appear on the leaderboard");
});

test("Multiwall / Offerwall.GG only count from their scoring start (no backfill)", async () => {
  const scores = await computeOfferwallScores(at("2026-10-09T00:00:00Z"), end, { metric: "OFFERS_EXTERNAL" });
  assert.equal(scores.get(3).multiwall, 1);
});

test("Zerads is capped per UTC day and reachedAt ignores clicks past the cap", async () => {
  const scores = await computeOfferwallScores(start, end, { metric: "OFFERS_EXTERNAL" });
  const z = scores.get(5);
  assert.equal(z.zeradsRaw, 130);
  assert.equal(z.zeradsCredited, 100);
  assert.equal(z.total, 100);
  assert.equal(z.reachedAt.toISOString(), "2026-10-10T02:00:00.000Z");
});

test("OFFERS_INTERNAL reads only the internal offerwall", async () => {
  for (const k of Object.keys(calls)) delete calls[k];
  const scores = await computeOfferwallScores(start, end, { metric: "OFFERS_INTERNAL" });
  assert.deepEqual(Object.keys(calls), ["internal"]);
  assert.equal(scores.get(1).total, 2);
});

test("reachedAt is the time of the player's last point and decides ties", async () => {
  const scores = await computeOfferwallScores(start, end, { metric: "OFFERS_ALL" });
  assert.equal(scores.get(1).reachedAt.toISOString(), "2026-10-10T03:00:00.000Z");
  const ranked = assignRanks([
    { id: 1, userId: 10, score: 5, firstContributionAt: at("2026-10-10T22:12:00Z") },
    { id: 2, userId: 11, score: 5, firstContributionAt: at("2026-10-10T18:32:00Z") },
    { id: 3, userId: 12, score: 5, firstContributionAt: null },
  ]);
  assert.deepEqual(ranked.map((r) => r.userId), [11, 10, 12], "first to reach the score wins the tie");
});

test("rules payload lists the sources and the Zerads cap", () => {
  const rules = offerwallScoringRules("OFFERS_EXTERNAL");
  assert.equal(rules.tieBreak, "first_to_reach");
  assert.deepEqual(rules.sources.map((s) => s.key).sort(), ["moneyRain", "multiwall", "offerwallGg", "offerwallMe", "zerads"]);
  assert.equal(rules.zeradsMaxPerUtcDay, 100);
});
