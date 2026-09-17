/**
 * Line-coverage gaps for tournaments package (mock prisma + lower deps only).
 * Run: npx tsx --import ./tests/_env-test-overrides.mjs --test --experimental-test-module-mocks tests/tournaments/coverage.gaps.test.mjs
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;

process.env.TOURNAMENT_ENGINE_V2 = "1";

const { TOURNAMENT_ACTION_PROVIDER: actionProviders } = await import(
  "../../server/modules/tournaments/tournaments.providers.ts"
);

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async () => null,
    update: async () => ({ version: 1 }),
  },
  tournamentEntry: {
    count: async () => 0,
    findFirst: async () => ({ score: 0 }),
    findMany: async () => [],
    create: async () => ({ id: 1, score: 0 }),
    upsert: async () => ({}),
    update: async () => ({}),
  },
  tournamentScoreContribution: {
    groupBy: async () => [],
    create: async () => ({}),
  },
  gameSessionLog: {
    findMany: async () => [],
  },
  shortlinkPower: {
    groupBy: async () => [],
  },
  autoMiningV2PowerGrant: {
    groupBy: async () => [],
  },
  autoMiningGpu: {
    groupBy: async () => [],
  },
  tournamentAction: {
    groupBy: async () => [],
    create: async ({ data }) => ({
      id: 1,
      userId: data.userId,
      provider: data.provider,
      actionCount: data.actionCount,
      executedAtUTC:
        data.executedAtUTC instanceof Date ? data.executedAtUTC : new Date(data.executedAtUTC),
      sourceId: data.sourceId,
      tournamentEligible: data.tournamentEligible ?? true,
      metadata: data.metadata ?? null,
    }),
    findUnique: async () => null,
  },
  tournamentDomainOutbox: {
    create: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  $executeRaw: async () => 0,
  $queryRaw: async () => [],
  userPowerGame: {
    groupBy: async () => [],
  },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
};

const recordActionCalls = [];

mock.module(prismaSpec, {
  defaultExport: prismaMock,
});

const metrics = await import("../../server/modules/tournaments/tournaments.metrics.ts");
const cache = await import("../../server/modules/tournaments/tournaments.cache.ts");
const backfill = await import("../../server/modules/tournaments/tournaments.minigame-backfill.ts");
const socketMod = await import("../../server/modules/tournaments/tournaments.socket.ts");
const { ClaimCountMetricScorer } = await import(
  "../../server/modules/tournaments/tournaments.claim-scorers.ts"
);
const hashrate = await import("../../server/modules/tournaments/ranking.hashrate.ts");
const depositScore = await import("../../server/modules/tournaments/deposit-score.ts");
const { detectOfferwallDrift } = await import(
  "../../server/modules/tournaments/tournaments.offerwall-drift.ts"
);

// ─── tournaments.metrics ───────────────────────────────────────────────────

test("is*IncrementalMetric helpers classify offerwall, minigame, and claim families", () => {
  assert.equal(metrics.isOfferwallIncrementalMetric("OFFERS_INTERNAL"), true);
  assert.equal(metrics.isOfferwallIncrementalMetric("OFFERS_EXTERNAL"), true);
  assert.equal(metrics.isOfferwallIncrementalMetric("OFFERS_ALL"), true);
  assert.equal(metrics.isOfferwallIncrementalMetric("FAUCET"), false);

  assert.equal(metrics.isMinigameIncrementalMetric("MINIGAME_WINS"), true);
  assert.equal(metrics.isMinigameIncrementalMetric("SHORTLINK"), false);

  assert.equal(metrics.isFaucetIncrementalMetric("FAUCET"), true);
  assert.equal(metrics.isShortlinkIncrementalMetric("SHORTLINK"), true);
  assert.equal(metrics.isAutoMiningIncrementalMetric("AUTO_MINING"), true);
  assert.equal(metrics.isClaimCountIncrementalMetric("FAUCET"), true);
  assert.equal(metrics.isClaimCountIncrementalMetric("SHORTLINK"), true);
  assert.equal(metrics.isClaimCountIncrementalMetric("AUTO_MINING"), true);
  assert.equal(metrics.isClaimCountIncrementalMetric("HASHRATE"), false);
});

test("tournamentUpperBound clamps to endsAt when tournament already ended", () => {
  const pastEnd = new Date("2020-01-02T00:00:00.000Z");
  const bound = metrics.tournamentUpperBound({ endsAt: pastEnd });
  assert.equal(bound.getTime(), pastEnd.getTime());
});

test("tournamentUpperBound uses now when endsAt is in the future", () => {
  const futureEnd = new Date(Date.now() + 86400000);
  const before = Date.now();
  const bound = metrics.tournamentUpperBound({ endsAt: futureEnd });
  const after = Date.now();
  assert.ok(bound.getTime() >= before && bound.getTime() <= after);
});

test("getEngineStats returns null when tournament row missing", async () => {
  prismaMock.tournament.findUnique = async () => null;
  assert.equal(await metrics.getEngineStats(404), null);
});

test("getEngineStats maps stored engineStats and version", async () => {
  prismaMock.tournament.findUnique = async () => ({
    version: 9,
    scoresReconciledAt: new Date("2026-01-01T00:00:00.000Z"),
    metricConfig: {
      engineStats: {
        participants: 3,
        totalActions: 11,
        leaderScore: 7,
        lastContributionAt: "2026-01-02T00:00:00.000Z",
        lastReconcileAt: null,
        lastDriftCheckAt: "2026-01-03T00:00:00.000Z",
        openDriftAlerts: 2,
      },
    },
  });
  const stats = await metrics.getEngineStats(1);
  assert.ok(stats);
  assert.equal(stats.participants, 3);
  assert.equal(stats.totalActions, 11);
  assert.equal(stats.leaderScore, 7);
  assert.equal(stats.cacheVersion, 9);
  assert.equal(stats.openDriftAlerts, 2);
});

test("getEngineStats synthesizes defaults without engineStats blob", async () => {
  const reconciled = new Date("2026-06-01T12:00:00.000Z");
  prismaMock.tournament.findUnique = async () => ({
    version: 2,
    scoresReconciledAt: reconciled,
    metricConfig: {},
  });
  const stats = await metrics.getEngineStats(2);
  assert.equal(stats.participants, 0);
  assert.equal(stats.lastReconcileAt, reconciled.toISOString());
  assert.equal(stats.cacheVersion, 2);
});

test("bumpCacheVersion increments via prisma and returns version", async () => {
  prismaMock.tournament.update = async () => ({ version: 42 });
  assert.equal(await metrics.bumpCacheVersion(5), 42);
});

test("touchEngineStatsOnContribution merges engineStats and updates tournament", async () => {
  let updatePayload;
  prismaMock.tournamentEntry.count = async () => 4;
  prismaMock.tournamentEntry.findFirst = async () => ({ score: 99 });
  prismaMock.tournament.findUnique = async () => ({
    version: 3,
    metricConfig: { engineStats: { totalActions: 10, lastReconcileAt: "2026-01-01T00:00:00.000Z" } },
  });
  prismaMock.tournament.update = async ({ data }) => {
    updatePayload = data;
    return { version: 4 };
  };
  const at = new Date("2026-06-15T00:00:00.000Z");
  await metrics.touchEngineStatsOnContribution(7, 100, 2, at);
  assert.ok(updatePayload?.metricConfig?.engineStats);
  assert.equal(updatePayload.metricConfig.engineStats.participants, 4);
  assert.equal(updatePayload.metricConfig.engineStats.totalActions, 12);
  assert.equal(updatePayload.metricConfig.engineStats.leaderScore, 99);
  assert.equal(updatePayload.metricConfig.engineStats.lastContributionAt, at.toISOString());
});

// ─── tournaments.cache ───────────────────────────────────────────────────────

test("leaderboard cache miss, hit, expire, set, and invalidate", async () => {
  const tid = 9001;
  assert.equal(await cache.getCachedLeaderboard(tid), null);

  const t0 = 5_000_000;
  let nowMs = t0;
  const realDateNow = Date.now;
  Date.now = () => nowMs;

  try {
    await cache.setCachedLeaderboard(tid, [{ score: 1 }]);
    assert.deepEqual(await cache.getCachedLeaderboard(tid), [{ score: 1 }]);

    nowMs = t0 + 16_000;
    assert.equal(await cache.getCachedLeaderboard(tid), null);

    await cache.setCachedLeaderboard(tid, [{ score: 2 }]);
    prismaMock.tournament.update = async () => ({ version: 77 });
    await cache.invalidateLeaderboardCache(tid);
    assert.equal(await cache.getCachedLeaderboard(tid), null);
  } finally {
    Date.now = realDateNow;
  }
});

// ─── minigame backfill ───────────────────────────────────────────────────────

test("resolveTournamentStatusForWindow covers SCHEDULED, ACTIVE, ENDED and boundaries", () => {
  const start = new Date("2026-09-10T00:00:00.000Z");
  const end = new Date("2026-09-11T00:00:00.000Z");
  assert.equal(backfill.resolveTournamentStatusForWindow(start, end, new Date("2026-09-09T00:00:00.000Z")), "SCHEDULED");
  assert.equal(backfill.resolveTournamentStatusForWindow(start, end, new Date("2026-09-10T12:00:00.000Z")), "ACTIVE");
  assert.equal(backfill.resolveTournamentStatusForWindow(start, end, new Date("2026-09-11T00:00:00.000Z")), "ENDED");
  assert.equal(backfill.resolveTournamentStatusForWindow(start, end, end), "ENDED");
});

test("backfillMinigameTournamentFromLogs returns 0 for missing, wrong metric, and upper before starts", async () => {
  recordActionCalls.length = 0;
  prismaMock.tournament.findUnique = async () => null;
  assert.equal(await backfill.backfillMinigameTournamentFromLogs(1), 0);

  prismaMock.tournament.findUnique = async () => ({
    id: 2,
    metric: "FAUCET",
    startsAt: new Date("2026-09-01T00:00:00.000Z"),
    endsAt: new Date("2026-09-02T00:00:00.000Z"),
  });
  assert.equal(await backfill.backfillMinigameTournamentFromLogs(2), 0);

  prismaMock.tournament.findUnique = async () => ({
    id: 3,
    metric: "MINIGAME_WINS",
    startsAt: new Date("2099-01-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-02T00:00:00.000Z"),
  });
  assert.equal(await backfill.backfillMinigameTournamentFromLogs(3), 0);
  assert.equal(recordActionCalls.length, 0);
});

test("backfillMinigameTournamentFromLogs applies recordTournamentAction for log rows", async () => {
  recordActionCalls.length = 0;
  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2026-09-01T00:00:00.000Z");
  prismaMock.tournament.findUnique = async () => ({
    id: 10,
    metric: "MINIGAME_WINS",
    startsAt,
    endsAt,
  });
  prismaMock.gameSessionLog.findMany = async () => [
    { id: 55, userId: 7, createdAt: new Date("2026-08-15T00:00:00.000Z"), gameSlug: "dice" },
  ];
  prismaMock.tournamentAction.create = async ({ data }) => {
    recordActionCalls.push({ providerEventId: data.sourceId, userId: data.userId });
    return {
      id: 55,
      userId: data.userId,
      provider: data.provider,
      actionCount: data.actionCount,
      executedAtUTC:
        data.executedAtUTC instanceof Date ? data.executedAtUTC : new Date(data.executedAtUTC),
      sourceId: data.sourceId,
      tournamentEligible: true,
      metadata: null,
    };
  };
  const applied = await backfill.backfillMinigameTournamentFromLogs(10);
  assert.equal(applied, 1);
  assert.equal(recordActionCalls.length, 1);
  assert.equal(recordActionCalls[0].providerEventId, "gsl:55");
});

// ─── socket handlers ─────────────────────────────────────────────────────────

test("registerTournamentSocketHandlers subscribe valid/invalid and unsubscribe", () => {
  let connectionHandler;
  const io = {
    on(event, cb) {
      if (event === "connection") connectionHandler = cb;
    },
  };

  function makeSocket() {
    const rooms = new Set();
    const handlers = {};
    return {
      id: "test-socket",
      handlers,
      on(event, cb) {
        handlers[event] = cb;
      },
      join(room) {
        rooms.add(room);
      },
      leave(room) {
        rooms.delete(room);
      },
      inRoom(room) {
        return rooms.has(room);
      },
    };
  }

  socketMod.registerTournamentSocketHandlers(io);
  assert.ok(connectionHandler);

  const good = makeSocket();
  connectionHandler(good);
  good.handlers["tournament:subscribe"](12);
  assert.equal(good.inRoom("tournament:12"), true);

  const bad = makeSocket();
  connectionHandler(bad);
  bad.handlers["tournament:subscribe"]("nope");
  bad.handlers["tournament:subscribe"](0);
  bad.handlers["tournament:subscribe"](-3);
  assert.equal(bad.inRoom("tournament:12"), false);

  good.handlers["tournament:unsubscribe"](12);
  assert.equal(good.inRoom("tournament:12"), false);
});

// ─── ClaimCountMetricScorer ──────────────────────────────────────────────────

const activeTournament = {
  id: 1,
  name: "T",
  metric: "SHORTLINK",
  startsAt: new Date("2026-08-31T00:00:00.000Z"),
  endsAt: new Date("2026-09-01T00:00:00.000Z"),
  status: "ACTIVE",
};

test("ClaimCountMetricScorer onTournamentAction null branches", () => {
  const scorer = new ClaimCountMetricScorer("SHORTLINK", actionProviders.SHORTLINK);
  const base = {
    actionId: "1",
    userId: 1,
    provider: actionProviders.SHORTLINK,
    actionCount: 1,
    executedAtUTC: "2026-08-31T12:00:00.000Z",
    sourceId: "sl:1",
    tournamentEligible: true,
    metadata: null,
  };

  assert.equal(scorer.onTournamentAction({ ...base, tournamentEligible: false }, activeTournament), null);
  assert.equal(scorer.onTournamentAction({ ...base, actionCount: 0 }, activeTournament), null);
  assert.equal(
    scorer.onTournamentAction(base, { ...activeTournament, metric: "FAUCET" }),
    null,
  );
  assert.equal(
    scorer.onTournamentAction({ ...base, provider: actionProviders.FAUCET }, activeTournament),
    null,
  );
  assert.equal(
    scorer.onTournamentAction({ ...base, executedAtUTC: "2026-07-01T00:00:00.000Z" }, activeTournament),
    null,
  );
});

test("ClaimCountMetricScorer reconcile SHORTLINK and AUTO_MINING via mocked groupBy", async () => {
  const window = {
    startsAt: new Date("2026-08-31T00:00:00.000Z"),
    endsAt: new Date("2026-09-01T00:00:00.000Z"),
  };

  prismaMock.shortlinkPower.groupBy = async () => [
    { userId: 10, _count: { id: 3 } },
    { userId: 11, _count: { id: 0 } },
  ];
  const sl = new ClaimCountMetricScorer("SHORTLINK", actionProviders.SHORTLINK);
  const slMap = await sl.reconcile({ ...activeTournament, metric: "SHORTLINK" }, window);
  assert.equal(slMap.get(10)?.total, 3);
  assert.equal(slMap.has(11), false);

  prismaMock.autoMiningV2PowerGrant.groupBy = async () => [{ userId: 20, _count: { id: 2 } }];
  prismaMock.autoMiningGpu.groupBy = async () => [{ userId: 20, _count: { id: 1 } }];
  const am = new ClaimCountMetricScorer("AUTO_MINING", actionProviders.AUTO_MINING);
  const amMap = await am.reconcile({ ...activeTournament, metric: "AUTO_MINING" }, window);
  assert.equal(amMap.get(20)?.total, 3);
  assert.equal(amMap.get(20)?.txCount, 3);
});

// ─── ranking.hashrate ────────────────────────────────────────────────────────

test("aggregateUserHashrates edge cases and buildRankingRows default username", () => {
  const agg = hashrate.aggregateUserHashrates(
    {
      id: 1,
      miners: [
        { hashRate: 5, isActive: true },
        { hashRate: 100, isActive: false },
      ],
      gamePowers: [
        { hashRate: 2, game: { slug: hashrate.CHECKIN_BONUS_GAME_SLUG } },
        { hashRate: 3, game: { slug: "other-game" } },
      ],
      ytPowers: [{ hashRate: 1 }],
      gpuAccess: [{ gpuHashRate: 4 }],
      autoMiningV2Grants: [{ hashRate: 6 }],
    },
    { onlyActiveMiners: true },
  );
  assert.equal(agg.permanentHashrate, 5);
  assert.equal(agg.temporaryCheckinHashrate, 2);
  assert.equal(agg.temporaryMinigameHashrate, 3);
  assert.equal(agg.temporaryAutoMiningHashrate, 10);

  const allMiners = hashrate.aggregateUserHashrates(
    { id: 2, miners: [{ hashRate: 7, isActive: false }] },
    { onlyActiveMiners: false },
  );
  assert.equal(allMiners.permanentHashrate, 7);

  const rows = hashrate.buildRankingRows([{ id: 99, miners: [{ hashRate: 1, isActive: true }] }]);
  assert.equal(rows[0].username, "Miner");
});

test("rankingUserSelect omits autoMiningV2Grants when includeAutoMiningV2 is false", () => {
  const now = new Date("2026-09-17T00:00:00.000Z");
  const slim = hashrate.rankingUserSelect(now, { includeAutoMiningV2: false });
  assert.equal("autoMiningV2Grants" in slim, false);
  const full = hashrate.rankingUserSelect(now, { includeAutoMiningV2: true });
  assert.ok(full.autoMiningV2Grants);
});

// ─── deposit-score pure ──────────────────────────────────────────────────────

test("parseDepositSource countsForDepositTournament depositInWindowWhere shapes", () => {
  assert.equal(depositScore.parseDepositSource(null), null);
  assert.equal(depositScore.parseDepositSource(JSON.stringify({ source: "treasury" })), "treasury");
  assert.equal(depositScore.parseDepositSource(JSON.stringify({ nope: 1 })), null);
  assert.equal(depositScore.parseDepositSource("{"), null);

  assert.equal(depositScore.countsForDepositTournament(undefined), true);

  const start = new Date("2026-09-01T00:00:00.000Z");
  const upper = new Date("2026-09-02T00:00:00.000Z");
  const where = depositScore.depositInWindowWhere(start, upper, 5);
  assert.equal(where.userId, 5);
  assert.equal(where.type, "deposit");
  assert.equal(where.status, "completed");
  assert.equal(where.OR.length, 2);

  const open = depositScore.depositInWindowWhere(start, upper);
  assert.equal("userId" in open, false);
});

// ─── offerwall drift ─────────────────────────────────────────────────────────

test("detectOfferwallDrift skips source scoring for non-offerwall metrics", async () => {
  prismaMock.tournamentScoreContribution.groupBy = async () => [];
  prismaMock.tournamentEntry.findMany = async () => [];
  let touchCalled = false;
  prismaMock.tournament.update = async () => {
    touchCalled = true;
    return { id: 1 };
  };

  const report = await detectOfferwallDrift({
    id: 1,
    name: "Faucet cup",
    metric: "FAUCET",
    startsAt: new Date("2026-09-01T00:00:00.000Z"),
    endsAt: new Date("2026-09-02T00:00:00.000Z"),
    status: "ACTIVE",
  });

  assert.equal(report.driftCount, 0);
  assert.equal(report.actionTotals.length, 0);
  assert.equal(report.totals.actions, 0);
  assert.ok(touchCalled);
});

test("restore module mocks after coverage gaps suite", () => {
  mock.restoreAll();
});
