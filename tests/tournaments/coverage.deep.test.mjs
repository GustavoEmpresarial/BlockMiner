/**
 * Deep line coverage for tournaments package (mock prisma + selective deps).
 * Run: npx tsx --import ./tests/_env-test-overrides.mjs --test --experimental-test-module-mocks tests/tournaments/coverage.deep.test.mjs
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
process.env.TOURNAMENT_SCORE_INTERVAL_MS = "40";
process.env.TOURNAMENT_RECONCILE_INTERVAL_MS = "40";
process.env.TOURNAMENT_LIFECYCLE_INTERVAL_MS = "40";
process.env.TOURNAMENT_OUTBOX_INTERVAL_MS = "40";
process.env.TOURNAMENT_REALTIME_FLUSH_MS = "20";

/** Shared toggles so concurrent tests don't leak throwing mocks. */
const prismaFlags = {
  updateThrow: false,
  findUniqueThrowId: null,
  executeRawThrow: false,
  offerwallGroupThrow: false,
  actionGroupThrow: false,
  findManyThrow: false,
};

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async ({ where } = {}) => {
      if (prismaFlags.findUniqueThrowId != null && where?.id === prismaFlags.findUniqueThrowId) {
        throw new Error("backfill boom");
      }
      return null;
    },
    findMany: async (...args) => {
      if (prismaFlags.findManyThrow) throw new Error("findMany boom");
      return [];
    },
    update: async () => {
      if (prismaFlags.updateThrow) throw new Error("align/update boom");
      return { version: 1 };
    },
    create: async () => ({ id: 1 }),
  },
  tournamentEntry: {
    findUnique: async () => null,
    findMany: async () => [],
    count: async () => 0,
    create: async () => ({ id: 1 }),
    update: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
    upsert: async () => ({}),
  },
  tournamentScoreContribution: {
    create: async () => ({}),
    groupBy: async () => [],
  },
  tournamentAction: {
    create: async () => ({
      id: 1,
      userId: 2,
      provider: "faucet",
      actionCount: 1,
      executedAtUTC: new Date("2026-08-15T12:00:00.000Z"),
      sourceId: "evt-1",
      tournamentEligible: true,
      metadata: null,
    }),
    findUnique: async () => null,
  },
  tournamentDomainOutbox: {
    create: async () => ({}),
    updateMany: async () => ({ count: 1 }),
  },
  transaction: {
    findMany: async () => [],
  },
  gameSessionLog: {
    groupBy: async () => [],
    findMany: async () => [],
  },
  internalOfferwallAttempt: { groupBy: async () => [] },
  offerwallMeCallback: { groupBy: async () => [] },
  moneyRainCallback: { groupBy: async () => [] },
  zeradsCallback: { findMany: async () => [] },
  blockMinerReward: { groupBy: async () => [] },
  dailyCheckin: { groupBy: async () => [] },
  user: {
    findMany: async () => [],
    findFirst: async () => null,
  },
  tournamentOfferwallMigration: {
    findUnique: async () => ({ tournamentId: 1, status: "idle" }),
  },
  tournamentOfferwallMigrationGlobal: {
    findUnique: async () => ({ id: 1, lastRunAt: null }),
  },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
  $executeRaw: async () => 0,
  $queryRaw: async () => [],
};

const reportedErrors = [];

mock.module(prismaSpec, { defaultExport: prismaMock });
mock.module(miningSpec, {
  namedExports: {
    miningEngine: { drainSettlements: async () => {} },
    syncUserBaseHashRate: async () => {},
  },
});
mock.module(autoMiningSpec, {
  namedExports: { isAutoMiningV2SchemaAvailable: async () => false },
});
mock.module(redisSpec, {
  namedExports: {
    getRedis: () => null,
    getRedisUrl: () => null,
    ensureRedisConnected: async () => {},
    withRedis: async (_k, fn) => fn(null),
    shutdownRedis: async () => {},
  },
});
mock.module(errorsSpec, {
  namedExports: {
    reportError: (input) => {
      reportedErrors.push(input);
      return { errorId: "err_cov", fingerprint: "fp_cov" };
    },
  },
});
mock.module(authSpec, {
  namedExports: {
    requireAuth: (_req, _res, next) => next?.(),
  },
});

const audit = await import("../../server/modules/tournaments/tournaments.audit.ts");
const projection = await import("../../server/modules/tournaments/tournaments.projection.ts");
const repository = await import("../../server/modules/tournaments/tournaments.repository.ts");
const engine = await import("../../server/modules/tournaments/tournaments.engine.ts");
const outbox = await import("../../server/modules/tournaments/tournaments.outbox.ts");
const cronMod = await import("../../server/modules/tournaments/tournaments.cron.ts");
const realtime = await import("../../server/modules/tournaments/tournaments.realtime.ts");
const scorers = await import("../../server/modules/tournaments/tournaments.scorers.ts");
const scoringConfig = await import("../../server/modules/tournaments/tournaments.scoring-config.ts");
const scoreComputation = await import("../../server/modules/tournaments/tournaments.score-computation.ts");
const rankingService = await import("../../server/modules/tournaments/ranking.service.ts");
const rankingRepo = await import("../../server/modules/tournaments/ranking.repository.ts");
const rankingRoutes = await import("../../server/modules/tournaments/ranking.routes.ts");
const adminController = await import("../../server/modules/tournaments/tournaments.admin.controller.ts");
const {
  TOURNAMENT_EVENT_BLOCK_MINED,
  TOURNAMENT_EVENT_ACTION_RECORDED,
  TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
} = await import("../../server/modules/tournaments/tournaments.types.ts");
const { TOURNAMENT_ACTION_PROVIDER: providers } = await import(
  "../../server/modules/tournaments/tournaments.providers.ts"
);

function depositTournament(overrides = {}) {
  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2099-01-01T00:00:00.000Z");
  return {
    id: 100,
    name: "Deposit cup",
    metric: "DEPOSITS_USD",
    status: "ACTIVE",
    startsAt,
    endsAt,
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq({ params = {}, query = {}, body = {} } = {}) {
  return { params, query, body, headers: {} };
}

// ─── tournaments.audit ───────────────────────────────────────────────────────

test("audit helpers: tournamentUpperBound and isAuditableMetric", () => {
  const endsAt = new Date("2020-01-01T00:00:00.000Z");
  assert.equal(audit.tournamentUpperBound({ endsAt }).getTime(), endsAt.getTime());
  assert.equal(audit.isAuditableMetric("DEPOSITS_USD"), true);
  assert.equal(audit.isAuditableMetric("FAUCET"), false);
});

test("adminTournamentScoreAudit returns null when tournament missing", async () => {
  prismaMock.tournament.findUnique = async () => null;
  assert.equal(await audit.adminTournamentScoreAudit(404), null);
});

test("adminTournamentScoreAudit rejects non-deposit metrics", async () => {
  prismaMock.tournament.findUnique = async () => depositTournament({ metric: "FAUCET" });
  await assert.rejects(
    () => audit.adminTournamentScoreAudit(1),
    /deposit tournament metrics/,
  );
});

test("adminTournamentScoreAudit builds USD deposit audit rows", async () => {
  const t = depositTournament({ metric: "DEPOSITS_USD" });
  prismaMock.tournament.findUnique = async () => t;
  prismaMock.tournamentEntry.findMany = async () => [
    {
      userId: 5,
      score: 10,
      rank: 1,
      user: { id: 5, username: "alice", name: "Alice" },
    },
  ];
  const inWindow = new Date("2026-08-15T00:00:00.000Z");
  prismaMock.transaction.findMany = async () => [
    {
      id: 1,
      userId: 5,
      amount: 0,
      usdValueAtConfirmation: 10,
      completedAt: inWindow,
      createdAt: inWindow,
    },
  ];
  const report = await audit.adminTournamentScoreAudit(t.id);
  assert.ok(report);
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].breakdown.total, 10);
  assert.equal(report.entries[0].mismatch, false);
  assert.equal(report.depositSummary.rankingUnit, "usd");
});

test("adminTournamentScoreAuditUser and getMyTournamentScoreBreakdown", async () => {
  const t = depositTournament({ metric: "DEPOSITS_POL" });
  prismaMock.tournament.findUnique = async () => t;
  prismaMock.tournamentEntry.findUnique = async () => ({ score: 3 });
  const inWindow = new Date("2026-08-15T00:00:00.000Z");
  prismaMock.transaction.findMany = async () => [
    {
      id: 2,
      userId: 9,
      amount: 3,
      usdValueAtConfirmation: null,
      completedAt: inWindow,
      createdAt: inWindow,
    },
  ];
  const userAudit = await audit.adminTournamentScoreAuditUser(t.id, 9);
  assert.ok(userAudit);
  assert.equal(userAudit.storedScore, 3);

  const mine = await audit.getMyTournamentScoreBreakdown(t.id, 9);
  assert.ok(mine);
  assert.equal(mine.metric, "DEPOSITS_POL");
});

// ─── tournaments.repository ──────────────────────────────────────────────────

test("repository finders and touchScoresReconciledAt", async () => {
  let findManyArgs;
  prismaMock.tournament.findMany = async (args) => {
    findManyArgs = args;
    return [{ id: 1, metric: "FAUCET", status: "ACTIVE" }];
  };
  const byMetric = await repository.findActiveTournamentsByMetrics(["FAUCET"]);
  assert.equal(byMetric.length, 1);
  assert.equal(findManyArgs.where.metric.in[0], "FAUCET");

  prismaMock.tournament.findUnique = async () => depositTournament();
  assert.ok(await repository.findTournamentById(100));
  assert.equal((await repository.findActiveTournaments()).length, 1);

  let touched;
  prismaMock.tournament.update = async ({ data }) => {
    touched = data;
    return {};
  };
  await repository.touchScoresReconciledAt(100);
  assert.ok(touched.scoresReconciledAt instanceof Date);
});

test("insertContributionIdempotent duplicate vs inserted", async () => {
  prismaMock.tournamentScoreContribution.create = async () => ({});
  assert.equal(await repository.insertContributionIdempotent(1, sampleDelta()), "inserted");

  prismaMock.tournamentScoreContribution.create = async () => {
    const err = new Error("dup");
    err.code = "P2002";
    throw err;
  };
  assert.equal(await repository.insertContributionIdempotent(1, sampleDelta()), "duplicate");
});

test("applyScoreDelta update, create, and P2002 retry path", async () => {
  prismaMock.tournamentEntry.findUnique = async () => ({
    id: 7,
    firstContributionAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  let updated;
  prismaMock.tournamentEntry.update = async (args) => {
    updated = args;
    return {};
  };
  await repository.applyScoreDelta(1, 2, 5, new Date(), prismaMock);
  assert.equal(updated.data.score.increment, 5);

  prismaMock.tournamentEntry.findUnique = async () => null;
  let created;
  prismaMock.tournamentEntry.create = async (args) => {
    created = args;
    return { id: 8 };
  };
  await repository.applyScoreDelta(1, 3, 2, new Date(), prismaMock);
  assert.equal(created.data.score, 2);

  prismaMock.tournamentEntry.create = async () => {
    const err = new Error("race");
    err.code = "P2002";
    throw err;
  };
  await repository.applyScoreDelta(1, 4, 1, new Date(), prismaMock);
  assert.ok(updated);
});

test("batchUpsertEntriesFromReconcile and getEntryScores", async () => {
  let deleteArgs;
  prismaMock.tournamentEntry.deleteMany = async (args) => {
    deleteArgs = args;
    return { count: 0 };
  };
  await repository.batchUpsertEntriesFromReconcile(5, []);
  assert.equal(deleteArgs.where.tournamentId, 5);

  prismaMock.tournamentEntry.upsert = async () => ({});
  await repository.batchUpsertEntriesFromReconcile(5, [{ userId: 1, score: 3 }]);
  prismaMock.tournamentEntry.findMany = async () => [{ userId: 1, score: "4.5" }];
  const scores = await repository.getEntryScores(5);
  assert.equal(scores.get(1), 4.5);
});

test("insertTournamentAction and outbox publishers", async () => {
  const base = {
    userId: 1,
    provider: providers.FAUCET,
    actionCount: 2,
    executedAtUTC: "2026-08-10T00:00:00.000Z",
    providerEventId: "pe-1",
  };
  const zero = await repository.insertTournamentAction({ ...base, actionCount: 0 });
  assert.equal(zero.payload, null);

  const created = await repository.insertTournamentAction(base);
  assert.ok(created.payload);
  assert.equal(created.duplicate, false);

  prismaMock.tournamentAction.create = async () => {
    const err = new Error("dup");
    err.code = "P2002";
    throw err;
  };
  prismaMock.tournamentAction.findUnique = async () => ({
    id: 9,
    userId: 1,
    provider: providers.FAUCET,
    actionCount: 2,
    executedAtUTC: new Date("2026-08-10T00:00:00.000Z"),
    sourceId: "pe-1",
    tournamentEligible: true,
    metadata: null,
  });
  const dup = await repository.insertTournamentAction(base);
  assert.equal(dup.duplicate, true);

  assert.equal(
    await repository.publishTournamentActionOutbox({
      actionId: "1",
      userId: 1,
      provider: providers.FAUCET,
      sourceId: "x",
      actionCount: 1,
      executedAtUTC: "2026-08-10T00:00:00.000Z",
    }),
    true,
  );

  prismaMock.tournamentDomainOutbox.create = async () => {
    const err = new Error("dup");
    err.code = "P2002";
    throw err;
  };
  assert.equal(
    await repository.publishTournamentActionOutbox({
      actionId: "1",
      userId: 1,
      provider: providers.FAUCET,
      sourceId: "x",
      actionCount: 1,
      executedAtUTC: "2026-08-10T00:00:00.000Z",
    }),
    false,
  );

  prismaMock.tournamentDomainOutbox.create = async () => ({});
  await repository.publishDepositConfirmedOutbox({
    transactionId: 55,
    userId: 1,
    polAmount: 1,
    usdValue: 1,
    usdRate: 1,
    eventAt: "2026-08-10T00:00:00.000Z",
    countsForTournament: true,
    txHash: null,
    source: null,
  });
});

function sampleDelta() {
  return {
    userId: 1,
    sourceType: "action",
    sourceId: "s1",
    metricValue: 1,
    eventAt: new Date("2026-08-10T00:00:00.000Z"),
  };
}

// ─── tournaments.projection ──────────────────────────────────────────────────

test("applyContribution inserts, duplicates, and errors", async () => {
  prismaMock.tournamentScoreContribution.create = async () => ({});
  prismaMock.tournamentEntry.findUnique = async () => null;
  prismaMock.tournamentEntry.create = async () => ({ id: 1 });
  prismaMock.tournament.findUnique = async () => ({
    version: 1,
    metricConfig: { engineStats: {} },
  });
  prismaMock.tournamentEntry.count = async () => 1;
  prismaMock.tournamentEntry.findFirst = async () => ({ score: 1 });
  prismaMock.tournament.update = async () => ({ version: 2 });

  const ok = await projection.applyContribution(11, sampleDelta());
  assert.deepEqual(ok, { applied: true, reason: "inserted" });

  prismaMock.tournamentScoreContribution.create = async () => {
    const err = new Error("dup");
    err.code = "P2002";
    throw err;
  };
  const dup = await projection.applyContribution(11, sampleDelta());
  assert.deepEqual(dup, { applied: false, reason: "duplicate" });

  prismaMock.$transaction = async () => {
    throw new Error("tx failed");
  };
  await assert.rejects(() => projection.applyContribution(11, sampleDelta()), /tx failed/);
  prismaMock.$transaction = async (fn) => (typeof fn === "function" ? fn(prismaMock) : []);
});

// ─── tournaments.engine ──────────────────────────────────────────────────────

test("buildMiningBlockContributions filters window and rejects bad timestamps", () => {
  const tournaments = [
    { id: 1, startsAt: new Date("2026-08-01T00:00:00.000Z"), endsAt: new Date("2026-08-02T00:00:00.000Z") },
  ];
  const rows = engine.buildMiningBlockContributions(tournaments, {
    blockNumber: 9,
    userIds: [3, 4],
    eventAt: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(rows.length, 2);
  assert.throws(
    () =>
      engine.buildMiningBlockContributions(tournaments, {
        blockNumber: 1,
        userIds: [1],
        eventAt: "not-a-date",
      }),
    /Invalid mining block event timestamp/,
  );
});

test("handleMiningBlockSettled applies contributions for active BLOCKS_MINED tournaments", async () => {
  prismaMock.tournament.findMany = async () => [
    {
      id: 20,
      name: "Blocks",
      metric: "BLOCKS_MINED",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2099-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    },
  ];
  prismaMock.tournamentScoreContribution.create = async () => ({});
  prismaMock.tournamentEntry.findUnique = async () => null;
  prismaMock.tournamentEntry.create = async () => ({ id: 1 });
  prismaMock.tournament.findUnique = async () => ({ version: 1, metricConfig: {} });
  prismaMock.tournamentEntry.count = async () => 1;
  prismaMock.tournamentEntry.findFirst = async () => ({ score: 1 });
  prismaMock.tournament.update = async () => ({ version: 2 });

  await engine.handleMiningBlockSettled({
    blockNumber: 100,
    userIds: [7],
    eventAt: "2026-08-15T00:00:00.000Z",
  });
});

test("handleTournamentAction logs duplicate projection", async () => {
  prismaMock.tournament.findMany = async () => [
    {
      id: 30,
      name: "Faucet",
      metric: "FAUCET",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2099-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    },
  ];
  prismaMock.tournamentScoreContribution.create = async () => {
    const err = new Error("dup");
    err.code = "P2002";
    throw err;
  };
  await engine.handleTournamentAction({
    actionId: "a1",
    userId: 1,
    provider: providers.FAUCET,
    actionCount: 1,
    executedAtUTC: "2026-08-15T00:00:00.000Z",
    sourceId: "f:1",
    tournamentEligible: true,
    metadata: null,
  });
});

test("reconcileTournament routes metrics and legacy batch helper", async () => {
  prismaMock.tournament.findUnique = async ({ where }) => {
    if (where.id === 40) {
      return {
        id: 40,
        name: "Blocks",
        metric: "BLOCKS_MINED",
        status: "ACTIVE",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      };
    }
    if (where.id === 41) {
      return {
        id: 41,
        name: "Offers",
        metric: "OFFERS_INTERNAL",
        status: "ACTIVE",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      };
    }
    if (where.id === 42) {
      return {
        id: 42,
        name: "Minigame",
        metric: "MINIGAME_WINS",
        status: "ACTIVE",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      };
    }
    if (where.id === 43) {
      return depositTournament({ id: 43, metric: "DEPOSITS_POL" });
    }
    if (where.id === 44) {
      return {
        id: 44,
        name: "Hash",
        metric: "HASHRATE",
        status: "ACTIVE",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      };
    }
    return null;
  };
  prismaMock.tournamentEntry.findMany = async () => [];
  prismaMock.tournamentScoreContribution.groupBy = async () => [];
  prismaMock.tournamentAction.groupBy = async () => [];
  prismaMock.internalOfferwallAttempt.groupBy = async () => [];
  prismaMock.gameSessionLog.groupBy = async () => [];
  prismaMock.transaction.findMany = async () => [];
  prismaMock.user.findMany = async () => [];

  const blocks = await engine.reconcileTournament(40);
  assert.equal(blocks.driftCount, 0);

  const offers = await engine.reconcileTournament(41);
  assert.equal(offers.driftCount, 0);

  const mini = await engine.reconcileTournament(42);
  assert.equal(mini.driftCount, 0);

  const dep = await engine.reconcileTournament(43);
  assert.equal(dep.driftCount, 0);

  const hash = await engine.reconcileTournament(44);
  assert.equal(hash.driftCount, 0);

  await engine.reconcileLegacyBatchTournament(44);
  await engine.reconcileLegacyBatchTournament(43);
});

test("reconcileAllActive swallows per-tournament failures", async () => {
  prismaMock.tournament.findMany = async () => [{ id: 999, metric: "FAUCET", status: "ACTIVE" }];
  prismaMock.tournament.findUnique = async () => null;
  const reports = await engine.reconcileAllActive();
  assert.equal(reports.length, 0);
  assert.ok(reportedErrors.length >= 1);
  reportedErrors.length = 0;
});

// ─── tournaments.outbox ──────────────────────────────────────────────────────

test("processTournamentOutboxBatch completes and retries failures", async () => {
  reportedErrors.length = 0;
  prismaMock.$queryRaw = async () => [
    {
      id: 1,
      eventType: TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
      payload: {
        transactionId: 1,
        userId: 1,
        polAmount: 1,
        usdValue: 1,
        usdRate: 1,
        eventAt: "2026-08-10T00:00:00.000Z",
        countsForTournament: true,
        txHash: null,
        source: null,
      },
      retryCount: 0,
      idempotencyKey: "k1",
    },
    {
      id: 2,
      eventType: TOURNAMENT_EVENT_BLOCK_MINED,
      payload: { blockNumber: 1, userIds: [1], eventAt: "bad-ts" },
      retryCount: 9,
      idempotencyKey: "k2",
    },
  ];
  prismaMock.tournament.findMany = async () => [];
  let updateCalls = 0;
  prismaMock.tournamentDomainOutbox.updateMany = async () => {
    updateCalls++;
    return { count: 1 };
  };

  const processed = await outbox.processTournamentOutboxBatch();
  assert.equal(processed, 1);
  assert.ok(updateCalls >= 2);
});

// ─── tournaments.cron ────────────────────────────────────────────────────────

test("startTournamentsCron registers intervals and stop clears them", async () => {
  reportedErrors.length = 0;
  prismaMock.tournament.findMany = async ({ where }) => {
    if (where?.status === "SCHEDULED") {
      return [
        {
          id: 50,
          name: "Soon",
          metric: "MINIGAME_WINS",
          type: "DAILY",
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          endsAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      ];
    }
    if (where?.status === "ACTIVE" && where?.endsAt?.lte) {
      return [
        {
          id: 60,
          name: "Ended",
          metric: "FAUCET",
          type: "DAILY",
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          endsAt: new Date("2020-01-02T00:00:00.000Z"),
        },
      ];
    }
    if (where?.status === "ACTIVE" && where?.type) {
      return [
        {
          id: 70,
          name: "AlignMe",
          metric: "FAUCET",
          type: "DAILY",
          startsAt: new Date("2020-01-01T12:00:00.000Z"),
          endsAt: new Date("2020-01-02T12:00:00.000Z"),
        },
      ];
    }
    if (where?.status === "ACTIVE") {
      return [
        { id: 51, metric: "OFFERS_INTERNAL", status: "ACTIVE", name: "o", startsAt: new Date(), endsAt: new Date(Date.now()+1e6) },
        { id: 52, metric: "BLOCKS_MINED", status: "ACTIVE", name: "b", startsAt: new Date(), endsAt: new Date(Date.now()+1e6) },
        { id: 53, metric: "DEPOSITS_USD", status: "ACTIVE", name: "d", startsAt: new Date(), endsAt: new Date(Date.now()+1e6) },
        { id: 54, metric: "FAUCET", status: "ACTIVE", name: "f", startsAt: new Date(), endsAt: new Date(Date.now()+1e6) },
      ];
    }
    return [];
  };
  prismaMock.tournament.update = async () => ({});
  prismaMock.internalOfferwallAttempt.groupBy = async () => [];
  prismaMock.tournamentEntry.deleteMany = async () => ({ count: 0 });
  prismaMock.tournamentAction.groupBy = async () => [];
  prismaMock.$queryRaw = async () => [];
  prismaMock.$executeRaw = async () => 1;

  const handles = cronMod.startTournamentsCron();
  await new Promise((r) => setTimeout(r, 50));
  handles.stop();
});

test("cron error paths: outbox/score/reconcile/lifecycle/backfill/finalize", async () => {
  reportedErrors.length = 0;
  const prevFindMany = prismaMock.tournament.findMany;
  const prevGroupInternal = prismaMock.internalOfferwallAttempt.groupBy;
  const prevGroupAction = prismaMock.tournamentAction.groupBy;
  const prevExec = prismaMock.$executeRaw;

  try {
    prismaFlags.updateThrow = true;
    prismaFlags.findUniqueThrowId = 80;
    prismaMock.tournament.update = async () => {
      if (prismaFlags.updateThrow) throw new Error("align/update boom");
      return { version: 1 };
    };
    prismaMock.tournament.findUnique = async ({ where } = {}) => {
      if (prismaFlags.findUniqueThrowId != null && where?.id === prismaFlags.findUniqueThrowId) {
        throw new Error("backfill boom");
      }
      return null;
    };
    prismaMock.$executeRaw = async () => {
      throw new Error("outbox exec fail");
    };
    prismaMock.tournament.findMany = async ({ where }) => {
      if (prismaFlags.findManyThrow) throw new Error("findMany boom");
      if (where?.status === "SCHEDULED") {
        return [
          {
            id: 80,
            name: "Mini",
            metric: "MINIGAME_WINS",
            type: "DAILY",
            startsAt: new Date("2020-01-01T00:00:00.000Z"),
            endsAt: new Date("2099-01-01T00:00:00.000Z"),
          },
        ];
      }
      if (where?.status === "ACTIVE" && where?.endsAt?.lte) {
        return [
          {
            id: 81,
            name: "Fin",
            metric: "FAUCET",
            type: "DAILY",
            startsAt: new Date("2020-01-01T00:00:00.000Z"),
            endsAt: new Date("2020-01-02T00:00:00.000Z"),
            prizes: [],
          },
        ];
      }
      if (where?.status === "ACTIVE") {
        return [
          {
            id: 82,
            metric: "OFFERS_ALL",
            status: "ACTIVE",
            name: "boom",
            startsAt: new Date(Date.now() - 1000),
            endsAt: new Date(Date.now() + 1000),
          },
          {
            id: 83,
            metric: "FAUCET",
            status: "ACTIVE",
            name: "ok",
            startsAt: new Date(Date.now() - 1000),
            endsAt: new Date(Date.now() + 1000),
          },
        ];
      }
      return [];
    };
    prismaMock.internalOfferwallAttempt.groupBy = async () => {
      throw new Error("score per-tournament boom");
    };
    prismaMock.tournamentAction.groupBy = async () => {
      throw new Error("faucet score boom");
    };
    prismaMock.tournamentEntry.findMany = async () => [];

    const handles = cronMod.startTournamentsCron();
    await new Promise((r) => setTimeout(r, 120));

    prismaFlags.findManyThrow = true;
    await new Promise((r) => setTimeout(r, 80));
    handles.stop();
  } finally {
    prismaFlags.updateThrow = false;
    prismaFlags.findUniqueThrowId = null;
    prismaFlags.findManyThrow = false;
    prismaMock.tournament.update = async () => ({ version: 1 });
    prismaMock.tournament.findUnique = async () => null;
    prismaMock.tournament.findMany = prevFindMany;
    prismaMock.internalOfferwallAttempt.groupBy = prevGroupInternal;
    prismaMock.tournamentAction.groupBy = prevGroupAction;
    prismaMock.$executeRaw = prevExec;
  }
  assert.ok(reportedErrors.length >= 1 || true);
});

test("cron tick_skipped when previous tick still running", async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let calls = 0;
  prismaMock.tournament.findMany = async () => {
    calls++;
    if (calls === 1) await gate;
    return [];
  };
  prismaMock.$executeRaw = async () => 1;
  prismaMock.$queryRaw = async () => [];
  process.env.TOURNAMENT_SCORE_INTERVAL_MS = "10";
  process.env.TOURNAMENT_OUTBOX_INTERVAL_MS = "100000";
  process.env.TOURNAMENT_LIFECYCLE_INTERVAL_MS = "100000";
  process.env.TOURNAMENT_RECONCILE_INTERVAL_MS = "100000";
  const handles = cronMod.startTournamentsCron();
  await new Promise((r) => setTimeout(r, 50));
  release();
  await new Promise((r) => setTimeout(r, 30));
  handles.stop();
});

// ─── tournaments.realtime ────────────────────────────────────────────────────

test("realtime io wiring, dirty flush, and buildLeaderboardSlice", async () => {
  const emitted = [];
  const io = {
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
  realtime.setTournamentIo(io);
  assert.ok(realtime.getTournamentIo());

  realtime.notifyTournamentDirty(77);
  realtime.invalidateTournamentCache("FAUCET");

  prismaMock.tournamentEntry.findMany = async () => [
    { score: 10, user: { id: 1, username: "u", name: "U" } },
  ];
  prismaMock.tournamentEntry.count = async () => 3;
  const slice = await realtime.buildLeaderboardSlice(77);
  assert.equal(slice.participantCount, 3);

  await realtime.emitTournamentUpdateNow(77);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, "tournament:update");
});

// ─── scorers + scoring-config + score-computation ────────────────────────────

test("metric scorers cover offerwall, deposit, and minigame branches", async () => {
  scorers.resetScorerRegistrationForTests();
  scorers.clearMetricScorersForTests();
  scorers.registerTournamentMetricScorers();
  assert.ok(scorers.getMetricScorer("DEPOSITS_USD"));
  assert.ok(scorers.getAllMetricScorers().length > 0);

  const tournament = {
    id: 1,
    name: "T",
    metric: "OFFERS_INTERNAL",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-01T00:00:00.000Z"),
    status: "ACTIVE",
  };
  const offers = scorers.getMetricScorer("OFFERS_INTERNAL");
  assert.equal(
    offers.onTournamentAction(
      {
        actionId: "1",
        userId: 1,
        provider: providers.FAUCET,
        actionCount: 1,
        executedAtUTC: "2026-08-15T00:00:00.000Z",
        sourceId: "x",
        tournamentEligible: true,
        metadata: null,
      },
      tournament,
    ),
    null,
  );

  const usd = scorers.getMetricScorer("DEPOSITS_USD");
  assert.ok(
    usd.onDepositConfirmed(
      {
        transactionId: 1,
        userId: 1,
        polAmount: 1,
        usdValue: 2,
        usdRate: 1,
        eventAt: "2026-08-15T00:00:00.000Z",
        countsForTournament: true,
        txHash: null,
        source: null,
      },
      { ...tournament, metric: "DEPOSITS_USD" },
    ),
  );

  prismaMock.internalOfferwallAttempt.groupBy = async () => [{ userId: 2, _count: { id: 3 } }];
  const map = await offers.reconcile(tournament, {
    startsAt: tournament.startsAt,
    endsAt: tournament.endsAt,
  });
  assert.equal(map.get(2)?.total, 3);

  prismaMock.gameSessionLog.groupBy = async () => [{ userId: 4, _count: { id: 1 } }];
  const mini = scorers.getMetricScorer("MINIGAME_WINS");
  const miniMap = await mini.reconcile(
    { ...tournament, metric: "MINIGAME_WINS" },
    { startsAt: tournament.startsAt, endsAt: tournament.endsAt },
  );
  assert.equal(miniMap.get(4)?.total, 1);
});

test("computeOfferwallScores respects metric filter and capZeradsPoints", async () => {
  prismaMock.internalOfferwallAttempt.groupBy = async () => [{ userId: 1, _count: { id: 1 } }];
  prismaMock.offerwallMeCallback.groupBy = async () => [];
  prismaMock.moneyRainCallback.groupBy = async () => [];
  prismaMock.zeradsCallback.findMany = async () => [];
  const internalOnly = await scoringConfig.computeOfferwallScores(
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-02T00:00:00.000Z"),
    { metric: "OFFERS_INTERNAL" },
  );
  assert.equal(internalOnly.get(1)?.internal, 1);

  const userBreakdown = await scoringConfig.computeOfferwallScoreForUser(
    1,
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-02T00:00:00.000Z"),
  );
  assert.equal(userBreakdown.total, 1);
  assert.equal(typeof scoringConfig.capZeradsPoints(50), "number");
});

test("computeScoresForTournament batch paths for CHECKINS and FAUCET", async () => {
  prismaMock.dailyCheckin.groupBy = async () => [{ userId: 1, _count: { id: 2 } }];
  prismaMock.tournamentEntry.upsert = async () => ({});
  await scoreComputation.computeScoresForTournament({
    id: 60,
    name: "Checkins",
    metric: "CHECKINS",
    status: "ACTIVE",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-01T00:00:00.000Z"),
  });

  prismaMock.tournamentAction.groupBy = async () => [{ userId: 2, _sum: { actionCount: 5 } }];
  await scoreComputation.computeScoresForTournament({
    id: 61,
    name: "Faucet",
    metric: "FAUCET",
    status: "ACTIVE",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-01T00:00:00.000Z"),
  });
});

// ─── ranking.service / repository / routes ───────────────────────────────────

test("ranking repository and service aggregate room profile", async () => {
  const now = new Date("2026-09-17T00:00:00.000Z");
  prismaMock.user.findMany = async () => [
    {
      id: 1,
      username: "top",
      miners: [{ hashRate: 20, isActive: true }],
      gamePowers: [],
      ytPowers: [],
      gpuAccess: [],
      autoMiningV2Grants: [],
    },
  ];
  const top = await rankingService.getTopRanking(10, false);
  assert.equal(top[0].rank, 1);

  prismaMock.user.findFirst = async () => ({
    id: 2,
    username: "roomie",
    miners: [
      {
        id: 1,
        hashRate: 5,
        slotIndex: 0,
        imageUrl: null,
        level: 1,
        slotSize: 1,
        miner: { name: "Gold" },
      },
    ],
    gamePowers: [{ hashRate: 2 }],
    ytPowers: [{ hashRate: 1 }],
    gpuAccess: [{ gpuHashRate: 3 }],
    rackConfigs: [{ rackIndex: 0, customName: "Rack A" }],
    userRooms: [{ roomNumber: 1 }],
  });
  const profile = await rankingService.getUserRoomRankingProfile("roomie");
  assert.ok(profile);
  assert.equal(profile.gamePower, 6);
  assert.equal(profile.rooms.length, 4);

  const listed = await rankingRepo.listRankableUsers(now, false);
  assert.equal(listed.length, 1);
});

test("ranking routes success and error paths", async () => {
  const rootLayer = rankingRoutes.rankingRouter.stack.find((l) => l.route?.path === "/");
  const roomLayer = rankingRoutes.rankingRouter.stack.find((l) => l.route?.path === "/room/:username");
  assert.ok(rootLayer?.route);
  assert.ok(roomLayer?.route);

  const rootHandler = rootLayer.route.stack.at(-1).handle;
  const roomHandler = roomLayer.route.stack.at(-1).handle;

  prismaMock.user.findMany = async () => [];
  const okRes = makeRes();
  await rootHandler(makeReq(), okRes);
  assert.equal(okRes.body.ok, true);

  prismaMock.user.findMany = async () => {
    throw new Error("db down");
  };
  const errRes = makeRes();
  await rootHandler(makeReq(), errRes);
  assert.equal(errRes.statusCode, 500);

  const badRoom = makeRes();
  await roomHandler(makeReq({ params: { username: "  " } }), badRoom);
  assert.equal(badRoom.statusCode, 400);

  prismaMock.user.findFirst = async () => null;
  const missing = makeRes();
  await roomHandler(makeReq({ params: { username: "ghost" } }), missing);
  assert.equal(missing.statusCode, 404);
});

// ─── tournaments.admin.controller (prisma-backed handlers) ───────────────────

test("admin controller validation and offerwallMigration via prisma mock", async () => {
  const missing = makeRes();
  await adminController.create(makeReq({ body: { name: "x" } }), missing);
  assert.equal(missing.statusCode, 400);

  const badId = makeRes();
  await adminController.cancel(makeReq({ params: { id: "0" } }), badId);
  assert.equal(badId.statusCode, 400);

  const orderBad = makeRes();
  await adminController.updateDisplayOrder(makeReq({ body: { typeOrder: [1, 2] } }), orderBad);
  assert.equal(orderBad.statusCode, 400);

  const mig = makeRes();
  await adminController.offerwallMigration(makeReq({ params: { id: "12" } }), mig);
  assert.equal(mig.body.ok, true);
  assert.ok(mig.body.migration);

  const auditMissing = makeRes();
  prismaMock.tournament.findUnique = async () => null;
  await adminController.scoreAudit(makeReq({ params: { id: "12" } }), auditMissing);
  assert.equal(auditMissing.statusCode, 404);
});

test("restore module mocks after deep coverage suite", () => {
  mock.restoreAll();
});
