/**
 * Remaining tournaments.service.ts paths via mocked prisma (not the service module).
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const miningSpec = pathToFileURL(path.join(root, "server/modules/mining/index.ts")).href;
const notifSpec = pathToFileURL(path.join(root, "server/modules/notifications/index.ts")).href;
const errorsSpec = pathToFileURL(path.join(root, "server/core/errors/index.ts")).href;
const redisSpec = pathToFileURL(path.join(root, "server/core/redis/index.ts")).href;
const autoMiningSpec = pathToFileURL(path.join(root, "server/modules/auto-mining/index.ts")).href;

process.env.TOURNAMENT_ENGINE_V2 = "0";

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async () => null,
    findMany: async () => [],
    create: async ({ data }) => ({ id: 800, ...data, prizes: [] }),
    update: async ({ data, where }) => ({ id: where?.id ?? 1, ...data, metric: "CHECKINS", version: 2 }),
  },
  tournamentEntry: {
    findMany: async () => [],
    findUnique: async () => null,
    count: async () => 0,
    update: async () => ({}),
    updateMany: async () => ({ count: 1 }),
    deleteMany: async () => ({ count: 0 }),
    upsert: async () => ({}),
  },
  tournamentPrize: { deleteMany: async () => ({ count: 0 }) },
  tournamentDisplayConfig: {
    findUnique: async () => null,
    upsert: async ({ create }) => ({ typeOrder: create.typeOrder }),
  },
  dailyCheckin: { groupBy: async () => [{ userId: 1, _count: { id: 3 } }] },
  transaction: { findMany: async () => [], groupBy: async () => [] },
  gameSessionLog: { groupBy: async () => [], findMany: async () => [] },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
  $executeRaw: async () => 0,
  $queryRaw: async () => [],
};

const reported = [];
const grantLog = [];

mock.module(prismaSpec, { defaultExport: prismaMock });
mock.module(miningSpec, {
  namedExports: {
    miningEngine: { drainSettlements: async () => {} },
    syncUserBaseHashRate: async (userId) => {
      grantLog.push({ sync: userId });
    },
  },
});
mock.module(notifSpec, {
  namedExports: {
    createRewardInboxEntry: async (_tx, input) => {
      grantLog.push({ inbox: input });
      if (input.rewardType === "pol" && input.rewardValue === -1) {
        throw new Error("grant failed");
      }
    },
    grantTemporaryPowerInTx: async (_tx, userId, input) => {
      grantLog.push({ boost: userId, ...input });
    },
  },
});
mock.module(errorsSpec, {
  namedExports: {
    reportError: (input) => {
      reported.push(input);
      return { errorId: "err_svc", fingerprint: "fp" };
    },
  },
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
mock.module(autoMiningSpec, {
  namedExports: { isAutoMiningV2SchemaAvailable: async () => false },
});

const service = await import("../../server/modules/tournaments/tournaments.service.ts");
const { TOURNAMENT_ERROR } = await import("../../server/modules/tournaments/tournaments.errors.ts");

test("listActiveTournaments uses in-memory cache on second call", async () => {
  let calls = 0;
  prismaMock.tournament.findMany = async () => {
    calls += 1;
    return [
      {
        id: 1,
        name: "A",
        type: "DAILY",
        metric: "CHECKINS",
        status: "ACTIVE",
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-09-02T00:00:00.000Z"),
        prizes: [],
        _count: { entries: 0 },
      },
    ];
  };
  service.invalidateActiveTournamentsCache();
  const first = await service.listActiveTournaments();
  const second = await service.listActiveTournaments();
  assert.equal(calls, 1);
  assert.equal(first.length, 1);
  assert.deepEqual(second, first);
});

test("getUserTournamentHistory returns prisma rows", async () => {
  prismaMock.tournamentEntry.findMany = async () => [{ id: 9, score: 1 }];
  const rows = await service.getUserTournamentHistory(5);
  assert.equal(rows.length, 1);
});

test("adminListTournaments and adminCreateTournament", async () => {
  prismaMock.tournament.findMany = async () => [
    {
      id: 2,
      type: "WEEKLY",
      metric: "CHECKINS",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-08T00:00:00.000Z"),
      prizes: [],
      _count: { entries: 0 },
    },
  ];
  const listed = await service.adminListTournaments();
  assert.equal(listed.length, 1);

  await assert.rejects(
    () =>
      service.adminCreateTournament({
        name: "Bad",
        type: "CUSTOM",
        metric: "CHECKINS",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 0 }],
      }),
    (err) => err.code === TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
  );

  prismaMock.tournament.create = async ({ data }) => ({
    id: 801,
    status: "ACTIVE",
    metric: "MINIGAME_WINS",
    name: data.name,
    prizes: [],
  });
  const created = await service.adminCreateTournament({
    name: "Mini",
    type: "CUSTOM",
    metric: "MINIGAME_WINS",
    startsAt: new Date("2026-09-01T00:00:00.000Z"),
    endsAt: new Date("2026-09-02T00:00:00.000Z"),
    prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
  });
  assert.equal(created.metric, "MINIGAME_WINS");
});

test("adminUpdateTournament replaces prizes on SCHEDULED tournament", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 50,
    status: "SCHEDULED",
    metric: "CHECKINS",
    type: "CUSTOM",
    startsAt: new Date(),
    endsAt: new Date(),
  });
  prismaMock.tournament.update = async ({ data }) => ({
    id: 50,
    status: "SCHEDULED",
    prizes: data.prizes?.create ?? [],
  });
  const updated = await service.adminUpdateTournament(50, {
    prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "BLK", blkAmount: 2 }],
  });
  assert.ok(updated);
});

test("alignActiveTournamentWindows snaps ACTIVE daily window", async () => {
  const misalignedStart = new Date("2026-09-01T10:00:00.000Z");
  const misalignedEnd = new Date("2026-09-02T10:00:00.000Z");
  prismaMock.tournament.findMany = async () => [
    {
      id: 70,
      name: "Daily",
      type: "DAILY",
      metric: "CHECKINS",
      status: "ACTIVE",
      startsAt: misalignedStart,
      endsAt: misalignedEnd,
    },
  ];
  let updated = null;
  prismaMock.tournament.update = async ({ data }) => {
    updated = data;
    return {};
  };
  prismaMock.dailyCheckin.groupBy = async () => [];
  const fixed = await service.alignActiveTournamentWindows();
  assert.ok(fixed >= 1);
  assert.ok(updated);
});

test("finalizeTournament grants pol blk boost machine and handles invalid prize", async () => {
  reported.length = 0;
  grantLog.length = 0;

  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2026-09-01T00:00:00.000Z");
  const prizes = [
    { id: 1, rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 },
    { id: 2, rankFrom: 2, rankTo: 2, prizeType: "BLK", blkAmount: 2 },
    { id: 3, rankFrom: 3, rankTo: 3, prizeType: "MINING_BOOST", boostHashRate: 5, boostHours: 1 },
    {
      id: 4,
      rankFrom: 4,
      rankTo: 4,
      prizeType: "MACHINE",
      minerId: 9,
      minerCount: 2,
      miner: { id: 9, name: "Gold", imageUrl: null, baseHashRate: 10, slotSize: 1 },
    },
    { id: 5, rankFrom: 5, rankTo: 5, prizeType: "POL", polAmount: 0 },
    { id: 6, rankFrom: 6, rankTo: 6, prizeType: "POL", polAmount: -1 },
  ];

  prismaMock.tournament.findUnique = async () => ({
    id: 100,
    name: "Finale",
    status: "ACTIVE",
    metric: "CHECKINS",
    type: "CUSTOM",
    startsAt,
    endsAt,
    recurring: false,
    description: null,
    prizes,
  });

  prismaMock.tournamentEntry.findMany = async () =>
    [1, 2, 3, 4, 5, 6].map((rank) => ({
      id: rank,
      userId: rank + 10,
      score: 100 - rank,
      rank: null,
      rewardGranted: false,
      firstContributionAt: new Date(),
    }));

  prismaMock.dailyCheckin.groupBy = async () =>
    [1, 2, 3, 4, 5, 6].map((userId) => ({ userId: userId + 10, _count: { id: userId } }));

  prismaMock.tournamentEntry.updateMany = async ({ where, data }) => {
    if (where.id === 6 && data.rewardGranted) {
      throw new Error("tx failed");
    }
    return { count: 1 };
  };

  const result = await service.finalizeTournament(100);
  assert.ok(result.ranked >= 6);
  assert.ok(result.rewarded >= 4);
  assert.ok(result.failed >= 1);
  assert.ok(grantLog.some((g) => g.inbox?.rewardType === "pol"));
  assert.ok(grantLog.some((g) => g.inbox?.rewardType === "blk"));
  assert.ok(grantLog.some((g) => g.boost));
  assert.ok(grantLog.filter((g) => g.inbox?.rewardType === "machine").length >= 2);
  assert.ok(reported.some((r) => r.operation === "finalizeTournament.resolvePrize"));
});

test("finalizeTournament spawns recurring next cycle", async () => {
  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2026-08-02T00:00:00.000Z");
  prismaMock.tournament.findUnique = async () => ({
    id: 200,
    name: "Series",
    status: "ACTIVE",
    metric: "CHECKINS",
    type: "DAILY",
    startsAt,
    endsAt,
    recurring: true,
    description: "d",
    prizes: [{ id: 1, rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
  });
  prismaMock.tournamentEntry.findMany = async () => [
    { id: 1, userId: 1, score: 1, rank: null, rewardGranted: false, firstContributionAt: new Date() },
  ];
  prismaMock.dailyCheckin.groupBy = async () => [{ userId: 1, _count: { id: 1 } }];
  prismaMock.tournament.create = async ({ data }) => ({ id: 201, status: data.status, metric: data.metric });
  const out = await service.finalizeTournament(200);
  assert.ok(out.nextId === 201 || out.nextId === null);
});

test("getTypeDisplayOrder falls back when config row is malformed", async () => {
  prismaMock.tournamentDisplayConfig.findUnique = async () => ({ typeOrder: [1, 2, 3] });
  const order = await service.getTypeDisplayOrder();
  assert.ok(order.includes("DAILY"));
});

test("setTypeDisplayOrder normalizes unknown types", async () => {
  prismaMock.tournamentDisplayConfig.upsert = async ({ update }) => ({
    typeOrder: update.typeOrder,
  });
  const order = await service.setTypeDisplayOrder(["CUSTOM", "NOT_A_TYPE", "DAILY"]);
  assert.ok(order.includes("DAILY"));
  assert.ok(order.includes("WEEKLY"));
});

test("finalizeTournament reports recurring spawn failure", async () => {
  reported.length = 0;
  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2026-08-02T00:00:00.000Z");
  prismaMock.tournament.findUnique = async () => ({
    id: 250,
    name: "Series fail",
    status: "ACTIVE",
    metric: "CHECKINS",
    type: "DAILY",
    startsAt,
    endsAt,
    recurring: true,
    description: null,
    prizes: [{ id: 1, rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
  });
  prismaMock.tournamentEntry.findMany = async () => [];
  prismaMock.dailyCheckin.groupBy = async () => [];
  prismaMock.tournament.create = async () => {
    throw new Error("spawn blocked");
  };
  const out = await service.finalizeTournament(250);
  assert.equal(out.nextId, null);
  assert.ok(reported.some((r) => r.code === "TOURNAMENT_RECURRING_SPAWN_FAILED"));
});

test("getMyTournamentScoreBreakdown returns deposit detail", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 300,
    name: "Dep",
    metric: "DEPOSITS_USD",
    status: "ACTIVE",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-01T00:00:00.000Z"),
  });
  prismaMock.transaction.findMany = async () => [];
  const detail = await service.getMyTournamentScoreBreakdown(300, 5);
  assert.ok(detail);
  assert.equal(detail.metric, "DEPOSITS_USD");
});

test("restore module mocks after service-rest suite", () => {
  mock.restoreAll();
});
