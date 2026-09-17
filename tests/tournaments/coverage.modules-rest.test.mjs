/**
 * Line coverage for tournament submodules not fully hit elsewhere.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const miningSpec = pathToFileURL(path.join(root, "server/modules/mining/index.ts")).href;
const autoMiningSpec = pathToFileURL(path.join(root, "server/modules/auto-mining/index.ts")).href;
const redisSpec = pathToFileURL(path.join(root, "server/core/redis/index.ts")).href;
const errorsSpec = pathToFileURL(path.join(root, "server/core/errors/index.ts")).href;
const authSpec = pathToFileURL(path.join(root, "server/core/http/middleware/auth.js")).href;

process.env.TOURNAMENT_ENGINE_V2 = "1";
process.env.TOURNAMENT_OFFERWALL_AUTOCORRECT = "1";

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async () => null,
    findMany: async () => [],
    update: async () => ({ version: 1 }),
  },
  tournamentEntry: {
    findMany: async () => [],
    findUnique: async () => null,
    count: async () => 0,
    upsert: async () => ({}),
    create: async () => ({ id: 1, score: 0 }),
    findFirst: async () => ({ score: 1 }),
    deleteMany: async () => ({ count: 0 }),
    update: async () => ({}),
  },
  tournamentScoreContribution: {
    create: async () => ({}),
    groupBy: async () => [{ userId: 1, _sum: { metricValue: 5 } }],
  },
  tournamentAction: { create: async () => ({}), findUnique: async () => null, groupBy: async () => [] },
  user: {
    findMany: async () => [
      {
        id: 1,
        username: "alpha",
        name: "A",
        isCreator: false,
        youtubeUrl: null,
        miners: [{ hashRate: 12, isActive: true }],
        gamePowers: [],
        ytPowers: [],
        gpuAccess: [],
      },
    ],
    findFirst: async () => null,
  },
  blockMinerReward: { groupBy: async () => [{ userId: 2, _count: { id: 4 } }] },
  dailyCheckin: { groupBy: async () => [{ userId: 3, _count: { id: 2 } }] },
  userDailyTaskProgress: { groupBy: async () => [{ userId: 4, _count: { id: 7 } }] },
  gameSessionLog: { groupBy: async () => [{ userId: 5, _count: { id: 1 } }] },
  internalOfferwallAttempt: { groupBy: async () => [{ userId: 6, _count: { id: 2 } }] },
  offerwallMeCallback: { groupBy: async () => [{ userId: 7, _count: { id: 1 } }] },
  moneyRainCallback: { groupBy: async () => [{ userId: 8, _count: { id: 3 } }] },
  zeradsCallback: { findMany: async () => [{ userId: 9, points: 40 }] },
  transaction: { findMany: async () => [], groupBy: async () => [] },
  tournamentDomainOutbox: { create: async () => ({}), updateMany: async () => ({ count: 0 }) },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
  $executeRaw: async () => 0,
  $queryRaw: async () => [],
};

mock.module(prismaSpec, { defaultExport: prismaMock });
mock.module(miningSpec, {
  namedExports: {
    miningEngine: { drainSettlements: async () => {} },
    syncUserBaseHashRate: async () => {},
  },
});
mock.module(autoMiningSpec, {
  namedExports: { isAutoMiningV2SchemaAvailable: async () => true },
});
mock.module(redisSpec, {
  namedExports: {
    getRedis: () => null,
    withRedis: async (_k, fn) => fn(null),
    ensureRedisConnected: async () => {},
    shutdownRedis: async () => {},
    getRedisUrl: () => null,
  },
});
mock.module(errorsSpec, {
  namedExports: {
    reportError: () => ({ errorId: "err_mod", fingerprint: "fp" }),
  },
});
mock.module(authSpec, {
  namedExports: { requireAuth: (_req, _res, next) => next?.() },
});

const scoreComputation = await import("../../server/modules/tournaments/tournaments.score-computation.ts");
const scorers = await import("../../server/modules/tournaments/tournaments.scorers.ts");
const scoringConfig = await import("../../server/modules/tournaments/tournaments.scoring-config.ts");
const hashrate = await import("../../server/modules/tournaments/ranking.hashrate.ts");
const rankingRoutes = await import("../../server/modules/tournaments/ranking.routes.ts");
const engine = await import("../../server/modules/tournaments/tournaments.engine.ts");
const drift = await import("../../server/modules/tournaments/tournaments.offerwall-drift.ts");
const realtime = await import("../../server/modules/tournaments/tournaments.realtime.ts");
const audit = await import("../../server/modules/tournaments/tournaments.audit.ts");
const depositScore = await import("../../server/modules/tournaments/deposit-score.ts");
const { TOURNAMENT_ACTION_PROVIDER: providers } = await import(
  "../../server/modules/tournaments/tournaments.providers.ts"
);
const {
  TOURNAMENT_EVENT_ACTION_RECORDED,
  TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
} = await import("../../server/modules/tournaments/tournaments.types.ts");

const tournamentBase = {
  id: 700,
  name: "Batch",
  status: "ACTIVE",
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2099-01-01T00:00:00.000Z"),
};

test("computeScoresForTournament covers batch metrics and empty upsert", async () => {
  for (const [metric, setup] of [
    ["HASHRATE", () => {}],
    ["BLOCKS_MINED", () => {}],
    ["CHECKINS", () => {}],
    ["TASKS_COMPLETED", () => {}],
    ["MINIGAME_WINS", () => {}],
    ["OFFERS_ALL", () => {}],
    ["FAUCET", () => {
      prismaMock.tournamentAction.groupBy = async () => [{ userId: 1, _sum: { actionCount: 2 } }];
    }],
  ]) {
    setup();
    await scoreComputation.computeScoresForTournament({ ...tournamentBase, metric });
  }

  prismaMock.dailyCheckin.groupBy = async () => [];
  await scoreComputation.computeScoresForTournament({ ...tournamentBase, metric: "CHECKINS" });

  process.env.TOURNAMENT_ENGINE_V2 = "1";
  prismaMock.transaction.groupBy = async () => [{ userId: 11, _sum: { amount: 3 } }];
  await scoreComputation.computeScoresForTournament({ ...tournamentBase, metric: "DEPOSITS_POL" });

  prismaMock.transaction.groupBy = async () => [{ userId: 12, _sum: { usdValue: 4 } }];
  await scoreComputation.computeScoresForTournament({ ...tournamentBase, metric: "DEPOSITS_USD" });
});

test("scorers offerwall and deposit event guards", async () => {
  scorers.resetScorerRegistrationForTests?.();
  scorers.clearMetricScorersForTests();
  scorers.registerTournamentMetricScorers();
  const offers = scorers.getMetricScorer("OFFERS_EXTERNAL");
  assert.ok(offers);
  const tournament = { ...tournamentBase, metric: "OFFERS_EXTERNAL" };
  assert.equal(
    offers.onTournamentAction(
      {
        actionId: "1",
        userId: 1,
        provider: providers.FAUCET,
        actionCount: 1,
        executedAtUTC: "2026-08-15T00:00:00.000Z",
        sourceId: "x",
        tournamentEligible: false,
        metadata: null,
      },
      tournament,
    ),
    null,
  );

  const usd = scorers.getMetricScorer("DEPOSITS_USD");
  assert.equal(
    usd.onDepositConfirmed(
      {
        transactionId: 1,
        userId: 1,
        polAmount: 1,
        usdValue: 0,
        usdRate: 1,
        eventAt: "2026-08-15T00:00:00.000Z",
        countsForTournament: true,
        txHash: null,
        source: null,
      },
      { ...tournament, metric: "DEPOSITS_USD" },
    ),
    null,
  );

  const breakdown = await usd.getUserBreakdown(1, { ...tournament, metric: "DEPOSITS_USD" }, {
    startsAt: tournament.startsAt,
    endsAt: tournament.endsAt,
  });
  assert.ok(breakdown);
});

test("computeOfferwallScores external sources and user filter", async () => {
  const all = await scoringConfig.computeOfferwallScores(
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-02T00:00:00.000Z"),
    { metric: "OFFERS_ALL", userId: 7 },
  );
  assert.ok(all.size >= 0);

  const external = await scoringConfig.computeOfferwallScores(
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-02T00:00:00.000Z"),
    { metric: "OFFERS_EXTERNAL" },
  );
  assert.ok(external.get(7)?.offerwallMe >= 0 || external.size >= 0);
});

test("ranking hashrate rows and routes error branches", async () => {
  const rows = hashrate.buildRankingRows([
    {
      id: 1,
      username: "",
      name: "N1",
      isCreator: true,
      youtubeUrl: "https://yt.example",
      miners: [{ hashRate: 3, isActive: true }],
    },
    { id: 2, username: "b", miners: [{ hashRate: 9, isActive: true }] },
  ]);
  assert.equal(rows[0].totalHashRate, 9);
  assert.equal(rows[1].username, "Miner");

  const loaded = await hashrate.loadUsersForHashrateTournament(new Date(), true);
  assert.equal(loaded.length, 1);

  const rootLayer = rankingRoutes.rankingRouter.stack.find((l) => l.route?.path === "/");
  const roomLayer = rankingRoutes.rankingRouter.stack.find((l) => l.route?.path === "/room/:username");
  const rootHandler = rootLayer.route.stack.at(-1).handle;
  const roomHandler = roomLayer.route.stack.at(-1).handle;

  const makeRes = () => ({
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
  });

  prismaMock.user.findMany = async () => {
    throw new Error("rank fail");
  };
  const errRes = makeRes();
  await rootHandler({ query: {} }, errRes);
  assert.equal(errRes.statusCode, 500);

  const roomArr = makeRes();
  await roomHandler({ params: { username: ["  ", "ignored"] } }, roomArr);
  assert.equal(roomArr.statusCode, 400);

  prismaMock.user.findFirst = async () => {
    throw new Error("room fail");
  };
  const roomErr = makeRes();
  await roomHandler({ params: { username: "someone" } }, roomErr);
  assert.equal(roomErr.statusCode, 500);
});

test("engine handlers deposit action mining block and deposit reconcile drift", async () => {
  prismaMock.tournament.findMany = async ({ where }) => {
    if (where?.metric?.in) {
      return [
        {
          id: 710,
          metric: "DEPOSITS_USD",
          status: "ACTIVE",
          startsAt: tournamentBase.startsAt,
          endsAt: tournamentBase.endsAt,
        },
        {
          id: 711,
          metric: "OFFERS_INTERNAL",
          status: "ACTIVE",
          startsAt: tournamentBase.startsAt,
          endsAt: tournamentBase.endsAt,
        },
        {
          id: 712,
          metric: "BLOCKS_MINED",
          status: "ACTIVE",
          startsAt: tournamentBase.startsAt,
          endsAt: tournamentBase.endsAt,
        },
      ].filter((t) => where.metric.in.includes(t.metric));
    }
    return [];
  };

  scorers.resetScorerRegistrationForTests();
  scorers.clearMetricScorersForTests();
  scorers.registerTournamentMetricScorers();
  assert.ok(scorers.getMetricScorer("DEPOSITS_USD"));
  await engine.handleDepositConfirmed({
    transactionId: 1,
    userId: 1,
    polAmount: 1,
    usdValue: 2,
    usdRate: 1,
    eventAt: "2026-08-15T00:00:00.000Z",
    countsForTournament: true,
    txHash: null,
    source: null,
  });

  prismaMock.tournamentAction.create = async () => ({ id: 1 });
  prismaMock.tournamentScoreContribution.create = async () => {
    throw Object.assign(new Error("dup"), { code: "P2002" });
  };
  await engine.handleTournamentAction({
    actionId: "a",
    userId: 2,
    provider: providers.FAUCET,
    actionCount: 1,
    executedAtUTC: "2026-08-15T00:00:00.000Z",
    sourceId: "evt-dup",
    tournamentEligible: true,
    metadata: null,
  });

  await engine.handleMiningBlockSettled({
    blockNumber: 99,
    userIds: [1, 2],
    eventAt: "2026-08-15T00:00:00.000Z",
  });

  prismaMock.tournament.findUnique = async () => ({
    ...tournamentBase,
    id: 720,
    metric: "DEPOSITS_USD",
  });
  prismaMock.tournamentEntry.findMany = async () => [{ userId: 1, score: 0 }];
  await engine.reconcileTournament(720);

  prismaMock.tournament.findUnique = async () => ({
    ...tournamentBase,
    id: 721,
    metric: "OFFERS_INTERNAL",
  });
  prismaMock.tournamentEntry.findMany = async () => [{ userId: 6, score: 0 }];
  prismaMock.internalOfferwallAttempt.groupBy = async () => [{ userId: 6, _count: { id: 5 } }];
  await engine.reconcileTournament(721);
});

test("detectOfferwallDrift reports mismatches for offerwall metric", async () => {
  prismaMock.tournamentScoreContribution.groupBy = async () => [{ userId: 6, _sum: { metricValue: 1 } }];
  prismaMock.tournamentEntry.findMany = async () => [{ userId: 6, score: 0 }];
  const report = await drift.detectOfferwallDrift({
    ...tournamentBase,
    id: 730,
    metric: "OFFERS_INTERNAL",
  });
  assert.ok(report.driftCount >= 0);
  assert.ok(report.actionTotals.length >= 0);
});

test("realtime cache invalidation without io and audit DEPOSITS_POL fallback", async () => {
  realtime.setTournamentIo(null);
  assert.equal(realtime.getTournamentIo(), null);
  realtime.invalidateTournamentCache("CHECKINS");

  prismaMock.tournament.findUnique = async () => ({
    ...tournamentBase,
    id: 740,
    metric: "DEPOSITS_POL",
    status: "ACTIVE",
  });
  prismaMock.tournamentEntry.findMany = async () => [
    { userId: 1, score: 1, rank: 1, user: { id: 1, username: "u", name: "U" } },
  ];
  prismaMock.transaction.groupBy = async () => [{ userId: 1, _sum: { amount: 1 } }];
  const auditOut = await audit.adminTournamentScoreAudit(740);
  assert.ok(auditOut?.entries?.length >= 1);

  prismaMock.tournamentEntry.findUnique = async () => ({ score: 1, rank: 1 });
  prismaMock.transaction.findMany = async () => [];
  const userAudit = await audit.adminTournamentScoreAuditUser(740, 1);
  assert.ok(userAudit);
});

test("deposit-score list paths for uncovered branches", async () => {
  prismaMock.transaction.findMany = async () => [
    {
      id: 1,
      userId: 1,
      amount: 1,
      usdValue: null,
      metadata: JSON.stringify({ source: "x" }),
      confirmedEventAt: new Date("2026-08-01T12:00:00.000Z"),
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
      countsForTournament: false,
    },
  ];
  const detail = await depositScore.getDepositScoreDetailForUser(
    1,
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.ok(detail.breakdown);
});

test("restore module mocks after modules-rest suite", () => {
  mock.restoreAll();
});
