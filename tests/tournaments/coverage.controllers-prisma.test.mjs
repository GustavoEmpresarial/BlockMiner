/**
 * Controller line coverage with mocked prisma (real tournaments.service).
 * Run with --experimental-test-module-mocks (see npm test / coverage suite).
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
const notifSpec = pathToFileURL(path.join(root, "server/modules/notifications/index.ts")).href;

process.env.TOURNAMENT_ENGINE_V2 = "1";

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async () => null,
    findMany: async () => [],
    create: async ({ data }) => ({
      id: 900,
      ...data,
      prizes: [],
      version: 1,
    }),
    update: async ({ data }) => ({ id: 1, status: data?.status ?? "ACTIVE", version: 2, metric: "CHECKINS" }),
  },
  tournamentEntry: {
    findUnique: async () => null,
    findMany: async () => [],
    count: async () => 0,
    create: async () => ({ id: 1 }),
    update: async () => ({}),
    updateMany: async () => ({ count: 1 }),
    deleteMany: async () => ({ count: 0 }),
    upsert: async () => ({}),
  },
  tournamentPrize: { deleteMany: async () => ({ count: 0 }) },
  tournamentDisplayConfig: {
    findUnique: async () => null,
    upsert: async ({ create, update }) => ({ typeOrder: update?.typeOrder ?? create?.typeOrder ?? [] }),
  },
  tournamentScoreContribution: { groupBy: async () => [], create: async () => ({}) },
  tournamentAction: { create: async () => ({}), findUnique: async () => null, groupBy: async () => [] },
  tournamentDomainOutbox: { create: async () => ({}), updateMany: async () => ({ count: 0 }) },
  transaction: { findMany: async () => [], groupBy: async () => [] },
  gameSessionLog: { groupBy: async () => [], findMany: async () => [] },
  internalOfferwallAttempt: { groupBy: async () => [] },
  offerwallMeCallback: { groupBy: async () => [] },
  moneyRainCallback: { groupBy: async () => [] },
  zeradsCallback: { findMany: async () => [] },
  blockMinerReward: { groupBy: async () => [] },
  dailyCheckin: { groupBy: async () => [] },
  userDailyTaskProgress: { groupBy: async () => [] },
  user: { findMany: async () => [], findFirst: async () => null },
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

let errorSeq = 0;

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
    reportError: () => {
      errorSeq += 1;
      return { errorId: `err_cov_${errorSeq}`, fingerprint: "fp" };
    },
  },
});
mock.module(notifSpec, {
  namedExports: {
    createRewardInboxEntry: async () => {},
    grantTemporaryPowerInTx: async () => {},
  },
});

const service = await import("../../server/modules/tournaments/tournaments.service.ts");
const publicCtrl = await import("../../server/modules/tournaments/tournaments.controller.ts");
const adminCtrl = await import("../../server/modules/tournaments/tournaments.admin.controller.ts");

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

function makeReq({ params = {}, query = {}, body = {}, user } = {}) {
  return { params, query, body, headers: {}, user };
}

const validCreateBody = {
  name: "Cup",
  type: "CUSTOM",
  metric: "CHECKINS",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-09-02T00:00:00.000Z",
  prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
};

function depositTournament(id = 55) {
  const startsAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2099-01-01T00:00:00.000Z");
  return {
    id,
    name: "Dep",
    metric: "DEPOSITS_USD",
    status: "ACTIVE",
    type: "CUSTOM",
    startsAt,
    endsAt,
    scoresReconciledAt: new Date("2026-08-02T00:00:00.000Z"),
    prizes: [],
    _count: { entries: 0 },
  };
}

// ─── Public controller (prisma-backed service) ───────────────────────────────

test("public listTournaments returns active rows from prisma", async () => {
  prismaMock.tournament.findMany = async () => [
    {
      id: 1,
      name: "Live",
      type: "DAILY",
      metric: "CHECKINS",
      status: "ACTIVE",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-02T00:00:00.000Z"),
      prizes: [],
      _count: { entries: 0 },
    },
  ];
  const res = makeRes();
  await publicCtrl.listTournaments(makeReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.tournaments));
});

test("public listTournaments reports errorId when prisma throws", async () => {
  service.invalidateActiveTournamentsCache();
  prismaMock.tournament.findMany = async () => {
    throw new Error('relation "Tournament" does not exist');
  };
  const res = makeRes();
  await publicCtrl.listTournaments(makeReq(), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.errorId, /^err_cov_/);
  assert.equal(res.body.message, "Failed to load tournaments");
});

test("public getTournament validates id and loads detail", async () => {
  prismaMock.tournament.findMany = async () => [];
  const bad = makeRes();
  await publicCtrl.getTournament(makeReq({ params: { id: "0" } }), bad);
  assert.equal(bad.statusCode, 400);

  prismaMock.tournament.findUnique = async () => null;
  const missing = makeRes();
  await publicCtrl.getTournament(makeReq({ params: { id: "9" } }), missing);
  assert.equal(missing.statusCode, 404);

  prismaMock.tournament.findUnique = async () => depositTournament(9);
  prismaMock.tournamentEntry.findMany = async () => [];
  const ok = makeRes();
  await publicCtrl.getTournament(makeReq({ params: { id: "9" }, user: { id: 3 } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
});

test("public getTournament failure path uses reportError", async () => {
  prismaMock.tournament.findUnique = async () => {
    throw new Error("db down");
  };
  const res = makeRes();
  await publicCtrl.getTournament(makeReq({ params: { id: "1" } }), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.errorId, /^err_cov_/);
});

test("public authed handlers enforce auth and ids", async () => {
  prismaMock.tournament.findMany = async () => [];
  for (const handler of ["myRank", "myHistory", "myScoreBreakdown"]) {
    const res = makeRes();
    await publicCtrl[handler](makeReq({ params: { id: "1" } }), res);
    assert.equal(res.statusCode, 401, handler);
  }

  const rankBad = makeRes();
  await publicCtrl.myRank(makeReq({ params: { id: "nope" }, user: { id: 1 } }), rankBad);
  assert.equal(rankBad.statusCode, 400);

  prismaMock.tournament.findUnique = async () => null;
  const rank404 = makeRes();
  await publicCtrl.myRank(makeReq({ params: { id: "1" }, user: { id: 1 } }), rank404);
  assert.equal(rank404.statusCode, 404);

  prismaMock.tournamentEntry.findMany = async () => [
    {
      userId: 1,
      tournament: { id: 1, name: "T", type: "DAILY", metric: "CHECKINS", status: "ENDED", endsAt: new Date() },
    },
  ];
  const hist = makeRes();
  await publicCtrl.myHistory(makeReq({ user: { id: 1 } }), hist);
  assert.equal(hist.statusCode, 200);
  assert.ok(hist.body.history);

  const bdBad = makeRes();
  await publicCtrl.myScoreBreakdown(makeReq({ params: { id: "x" }, user: { id: 1 } }), bdBad);
  assert.equal(bdBad.statusCode, 400);

  prismaMock.tournament.findUnique = async () => ({
    ...depositTournament(1),
    metric: "CHECKINS",
  });
  const bd404 = makeRes();
  await publicCtrl.myScoreBreakdown(makeReq({ params: { id: "1" }, user: { id: 1 } }), bd404);
  assert.equal(bd404.statusCode, 404);
});

test("public myRank success and service failures on authed routes", async () => {
  prismaMock.tournament.findUnique = async () => depositTournament(2);
  prismaMock.tournamentEntry.findMany = async () => [];
  prismaMock.tournamentEntry.findUnique = async () => ({ score: 5, rank: 1 });
  prismaMock.tournamentEntry.count = async () => 0;

  const ok = makeRes();
  await publicCtrl.myRank(makeReq({ params: { id: "2" }, user: { id: 7 } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.body.myEntry);

  const failRank = makeRes();
  prismaMock.tournament.findUnique = async () => {
    throw new Error("fail");
  };
  await publicCtrl.myRank(makeReq({ params: { id: "1" }, user: { id: 1 } }), failRank);
  assert.equal(failRank.statusCode, 500);
  assert.match(failRank.body.errorId, /^err_cov_/);

  const failHist = makeRes();
  prismaMock.tournamentEntry.findMany = async () => {
    throw new Error("fail");
  };
  await publicCtrl.myHistory(makeReq({ user: { id: 1 } }), failHist);
  assert.equal(failHist.statusCode, 500);

  const failBd = makeRes();
  prismaMock.tournament.findUnique = async () => {
    throw new Error("fail");
  };
  await publicCtrl.myScoreBreakdown(makeReq({ params: { id: "1" }, user: { id: 1 } }), failBd);
  assert.equal(failBd.statusCode, 500);
});

// ─── Admin controller validation + prisma-backed success ─────────────────────

test("admin listAll and getDisplayOrder success and failure", async () => {
  prismaMock.tournament.findMany = async () => [];
  const list = makeRes();
  await adminCtrl.listAll(makeReq(), list);
  assert.equal(list.statusCode, 200);

  prismaMock.tournament.findMany = async () => {
    throw new Error("prisma list");
  };
  const listErr = makeRes();
  await adminCtrl.listAll(makeReq(), listErr);
  assert.equal(listErr.statusCode, 500);

  prismaMock.tournamentDisplayConfig.findUnique = async () => ({ typeOrder: ["DAILY", "WEEKLY"] });
  const order = makeRes();
  await adminCtrl.getDisplayOrder(makeReq(), order);
  assert.deepEqual(order.body.typeOrder, ["DAILY", "WEEKLY"]);

  prismaMock.tournamentDisplayConfig.findUnique = async () => {
    throw new Error("read fail");
  };
  const orderErr = makeRes();
  await adminCtrl.getDisplayOrder(makeReq(), orderErr);
  assert.equal(orderErr.statusCode, 500);
});

test("admin create rejects invalid input then succeeds via prisma", async () => {
  const missing = makeRes();
  await adminCtrl.create(makeReq({ body: { name: "x" } }), missing);
  assert.equal(missing.statusCode, 400);

  const badMetric = makeRes();
  await adminCtrl.create(
    makeReq({ body: { ...validCreateBody, metric: "NOT_A_METRIC" } }),
    badMetric,
  );
  assert.equal(badMetric.statusCode, 400);

  const badType = makeRes();
  await adminCtrl.create(
    makeReq({ body: { ...validCreateBody, type: "NOT_A_TYPE" } }),
    badType,
  );
  assert.equal(badType.statusCode, 400);

  const badDates = makeRes();
  await adminCtrl.create(
    makeReq({
      body: {
        ...validCreateBody,
        startsAt: "2026-09-02T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
      },
    }),
    badDates,
  );
  assert.equal(badDates.statusCode, 400);

  const tooLong = makeRes();
  await adminCtrl.create(
    makeReq({
      body: {
        ...validCreateBody,
        endsAt: "2027-01-01T00:00:00.000Z",
      },
    }),
    tooLong,
  );
  assert.equal(tooLong.statusCode, 400);

  const notArray = makeRes();
  await adminCtrl.create(makeReq({ body: { ...validCreateBody, prizes: "nope" } }), notArray);
  assert.equal(notArray.statusCode, 400);

  const prizeCases = [
    [{ rankFrom: 0, rankTo: 1, prizeType: "POL", polAmount: 1 }],
    [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: "x" }],
    [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: -1 }],
    [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 2e12 }],
    [{ rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: 0 }],
  ];
  for (const prizes of prizeCases) {
    const res = makeRes();
    await adminCtrl.create(makeReq({ body: { ...validCreateBody, prizes } }), res);
    assert.equal(res.statusCode, 400);
  }

  prismaMock.tournament.create = async ({ data }) => ({
    id: 501,
    ...data,
    prizes: data.prizes?.create ?? [],
  });
  const ok = makeRes();
  await adminCtrl.create(makeReq({ body: validCreateBody }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.tournament.id, 501);

  const biz = makeRes();
  await adminCtrl.create(
    makeReq({
      body: {
        ...validCreateBody,
        prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 0 }],
      },
    }),
    biz,
  );
  assert.equal(biz.statusCode, 400);
  assert.ok(biz.body.code?.startsWith("TOURNAMENT_") || biz.body.errorId);
});

test("admin update validation branches and prisma update", async () => {
  const badId = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "0" }, body: {} }), badId);
  assert.equal(badId.statusCode, 400);

  prismaMock.tournament.findUnique = async () => ({
    id: 10,
    status: "SCHEDULED",
    metric: "CHECKINS",
    type: "CUSTOM",
    startsAt: new Date(),
    endsAt: new Date(),
  });
  prismaMock.tournament.update = async ({ data }) => ({ id: 10, ...data, prizes: [] });

  const badType = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "10" }, body: { type: "NOPE" } }), badType);
  assert.equal(badType.statusCode, 400);

  const badMetric = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "10" }, body: { metric: "NOPE" } }), badMetric);
  assert.equal(badMetric.statusCode, 400);

  const badStart = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "10" }, body: { startsAt: "not-a-date" } }), badStart);
  assert.equal(badStart.statusCode, 400);

  const badEnd = makeRes();
  await adminCtrl.update(
    makeReq({
      params: { id: "10" },
      body: { startsAt: "2026-09-02T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" },
    }),
    badEnd,
  );
  assert.equal(badEnd.statusCode, 400);

  const ok = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "10" }, body: { name: "Renamed" } }), ok);
  assert.equal(ok.statusCode, 200);

  prismaMock.tournament.findUnique = async () => ({
    id: 11,
    status: "ACTIVE",
    metric: "CHECKINS",
    type: "CUSTOM",
    startsAt: new Date(),
    endsAt: new Date(),
  });
  const immutable = makeRes();
  await adminCtrl.update(makeReq({ params: { id: "11" }, body: { metric: "HASHRATE" } }), immutable);
  assert.equal(immutable.statusCode, 400);
  assert.equal(immutable.body.code, "TOURNAMENT_ACTIVE_IMMUTABLE_FIELDS");
});

test("admin cancel finalize entries displayOrder drift engine migration", async () => {
  prismaMock.tournament.findUnique = async ({ where }) => {
    if (where.id === 404) return null;
    if (where.id === 88) {
      return { id: 88, status: "ENDED", metric: "CHECKINS", name: "Done", prizes: [] };
    }
    return {
      id: where.id,
      status: "ACTIVE",
      metric: "CHECKINS",
      name: "T",
      type: "CUSTOM",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-02T00:00:00.000Z"),
      recurring: false,
      prizes: [{ id: 1, rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
    };
  };

  const cancelBad = makeRes();
  await adminCtrl.cancel(makeReq({ params: { id: "0" } }), cancelBad);
  assert.equal(cancelBad.statusCode, 400);

  const cancelOk = makeRes();
  await adminCtrl.cancel(makeReq({ params: { id: "20" } }), cancelOk);
  assert.equal(cancelOk.statusCode, 200);

  const finBad = makeRes();
  await adminCtrl.finalize(makeReq({ params: { id: "abc" } }), finBad);
  assert.equal(finBad.statusCode, 400);

  const finEarly = makeRes();
  await adminCtrl.finalize(makeReq({ params: { id: "88" } }), finEarly);
  assert.equal(finEarly.statusCode, 200);
  assert.equal(finEarly.body.ranked, 0);

  prismaMock.tournamentEntry.findMany = async () => [];
  prismaMock.dailyCheckin.groupBy = async () => [];
  const finOk = makeRes();
  await adminCtrl.finalize(makeReq({ params: { id: "21" } }), finOk);
  assert.equal(finOk.statusCode, 200);

  prismaMock.tournament.findUnique = async () => {
    throw new Error("finalize boom");
  };
  const finErr = makeRes();
  await adminCtrl.finalize(makeReq({ params: { id: "22" } }), finErr);
  assert.equal(finErr.statusCode, 400);

  prismaMock.tournamentEntry.findMany = async () => [
    { id: 1, score: 10, user: { id: 2, username: "u", name: "U" } },
  ];
  prismaMock.tournamentEntry.count = async () => 1;
  const ent = makeRes();
  await adminCtrl.entries(makeReq({ params: { id: "30" }, query: { page: "2", limit: "10" } }), ent);
  assert.equal(ent.statusCode, 200);
  assert.equal(ent.body.page, 2);

  const dispBad = makeRes();
  await adminCtrl.updateDisplayOrder(makeReq({ body: { typeOrder: [1, 2] } }), dispBad);
  assert.equal(dispBad.statusCode, 400);

  prismaMock.tournamentDisplayConfig.upsert = async ({ update }) => ({
    typeOrder: update.typeOrder,
  });
  const dispOk = makeRes();
  await adminCtrl.updateDisplayOrder(makeReq({ body: { typeOrder: ["WEEKLY", "DAILY"] } }), dispOk);
  assert.equal(dispOk.statusCode, 200);

  prismaMock.tournament.findUnique = async () => ({
    id: 40,
    version: 1,
    metricConfig: { engineStats: { participants: 1 } },
    scoresReconciledAt: new Date(),
  });
  const engOk = makeRes();
  await adminCtrl.engineStats(makeReq({ params: { id: "40" } }), engOk);
  assert.equal(engOk.statusCode, 200);

  prismaMock.tournament.findUnique = async () => null;
  const eng404 = makeRes();
  await adminCtrl.engineStats(makeReq({ params: { id: "41" } }), eng404);
  assert.equal(eng404.statusCode, 404);

  prismaMock.tournament.findUnique = async () => depositTournament(42);
  prismaMock.tournamentScoreContribution.groupBy = async () => [];
  const drift = makeRes();
  await adminCtrl.driftAlerts(makeReq({ params: { id: "42" }, query: { limit: "5" } }), drift);
  assert.equal(drift.statusCode, 200);

  const mig = makeRes();
  await adminCtrl.offerwallMigration(makeReq({ params: { id: "43" } }), mig);
  assert.equal(mig.statusCode, 200);
  assert.equal(mig.body.ok, true);

  prismaMock.tournamentOfferwallMigration.findUnique = async () => {
    throw new Error("migration fail");
  };
  const migErr = makeRes();
  await adminCtrl.offerwallMigration(makeReq({ params: { id: "44" } }), migErr);
  assert.equal(migErr.statusCode, 500);

  prismaMock.tournament.findUnique = async () => null;
  const cancelMissing = makeRes();
  await adminCtrl.cancel(makeReq({ params: { id: "404" } }), cancelMissing);
  assert.equal(cancelMissing.statusCode, 400);
});

test("admin score audit handlers via prisma-backed audit module", async () => {
  const bad = makeRes();
  await adminCtrl.scoreAudit(makeReq({ params: { id: "0" } }), bad);
  assert.equal(bad.statusCode, 400);

  prismaMock.tournament.findUnique = async () => null;
  const missing = makeRes();
  await adminCtrl.scoreAudit(makeReq({ params: { id: "60" } }), missing);
  assert.equal(missing.statusCode, 404);

  prismaMock.tournament.findUnique = async () => depositTournament(61);
  prismaMock.tournamentEntry.findMany = async () => [];
  prismaMock.transaction.groupBy = async () => [];
  const ok = makeRes();
  await adminCtrl.scoreAudit(makeReq({ params: { id: "61" } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.body.entries);

  prismaMock.tournament.findUnique = async () => depositTournament(62);
  prismaMock.tournamentEntry.findUnique = async () => ({ score: 3, rank: 1 });
  prismaMock.transaction.findMany = async () => [];
  const userOk = makeRes();
  await adminCtrl.scoreAuditUser(makeReq({ params: { id: "62", userId: "7" } }), userOk);
  assert.equal(userOk.statusCode, 200);

  const userBad = makeRes();
  await adminCtrl.scoreAuditUser(makeReq({ params: { id: "62", userId: "0" } }), userBad);
  assert.equal(userBad.statusCode, 400);

  prismaMock.tournament.findUnique = async () => ({
    ...depositTournament(63),
    metric: "FAUCET",
  });
  const biz = makeRes();
  await adminCtrl.scoreAudit(makeReq({ params: { id: "63" } }), biz);
  assert.equal(biz.statusCode, 400);
});

test("admin entries and updateDisplayOrder failure paths", async () => {
  prismaMock.tournamentEntry.findMany = async () => {
    throw new Error("entries fail");
  };
  const ent = makeRes();
  await adminCtrl.entries(makeReq({ params: { id: "70" } }), ent);
  assert.equal(ent.statusCode, 500);

  prismaMock.tournamentDisplayConfig.upsert = async () => {
    throw new Error("display order fail");
  };
  const disp = makeRes();
  await adminCtrl.updateDisplayOrder(makeReq({ body: { typeOrder: ["DAILY"] } }), disp);
  assert.equal(disp.statusCode, 500);
});

test("admin create prize validation + success + getDisplayOrder", async () => {
  const start = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 3_600_000).toISOString();
  const bad = makeRes();
  await adminCtrl.create(
    makeReq({
      body: {
        name: "bad",
        type: "CUSTOM",
        metric: "CHECKINS",
        startsAt: start,
        endsAt: end,
        prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: -1 }],
      },
    }),
    bad,
  );
  assert.equal(bad.statusCode, 400);
  assert.match(String(bad.body?.message ?? ""), /polAmount|negative/i);

  prismaMock.tournament.create = async ({ data }) => ({
    id: 901,
    name: data.name,
    type: data.type,
    metric: data.metric,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    status: data.status ?? "SCHEDULED",
    recurring: false,
    description: null,
    prizes: Array.isArray(data.prizes?.create) ? data.prizes.create : [],
  });
  const ok = makeRes();
  await adminCtrl.create(
    makeReq({
      body: {
        name: "ok",
        type: "CUSTOM",
        metric: "CHECKINS",
        startsAt: start,
        endsAt: end,
        prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
      },
    }),
    ok,
  );
  assert.equal(ok.statusCode, 200);

  prismaMock.tournamentDisplayConfig.findUnique = async () => ({
    id: 1,
    typeOrder: ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"],
  });
  const ord = makeRes();
  await adminCtrl.getDisplayOrder(makeReq(), ord);
  assert.equal(ord.statusCode, 200);

  prismaMock.tournamentDisplayConfig.findUnique = async () => {
    throw new Error("display boom");
  };
  const ordFail = makeRes();
  await adminCtrl.getDisplayOrder(makeReq(), ordFail);
  assert.equal(ordFail.statusCode, 500);
});

test("service display order, active list cache, invalid prize finalize", async () => {
  prismaMock.tournamentDisplayConfig.findUnique = async () => ({
    id: 1,
    typeOrder: ["WEEKLY", "DAILY", "MONTHLY", "CUSTOM"],
  });
  assert.ok((await service.getTypeDisplayOrder()).includes("WEEKLY"));
  prismaMock.tournamentDisplayConfig.upsert = async ({ create, update }) => ({
    typeOrder: update?.typeOrder ?? create?.typeOrder ?? [],
  });
  assert.ok((await service.setTypeDisplayOrder(["CUSTOM", "DAILY"])).includes("CUSTOM"));

  prismaMock.tournament.findMany = async () => [
    {
      id: 1,
      type: "DAILY",
      metric: "CHECKINS",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 1000),
      name: "a",
      prizes: [],
      _count: { entries: 0 },
    },
  ];
  service.invalidateActiveTournamentsCache();
  const a = await service.listActiveTournaments();
  const b = await service.listActiveTournaments();
  assert.equal(a, b);

  prismaMock.tournament.findUnique = async () => ({
    id: 55,
    name: "bad-prize",
    metric: "CHECKINS",
    status: "ACTIVE",
    recurring: true,
    type: "DAILY",
    startsAt: new Date(Date.now() - 7_200_000),
    endsAt: new Date(Date.now() - 1000),
    description: null,
    prizes: [
      {
        id: 1,
        rankFrom: 1,
        rankTo: 1,
        prizeType: "MACHINE",
        minerId: null,
        minerCount: 1,
        miner: null,
      },
    ],
  });
  prismaMock.tournamentEntry.findMany = async () => [
    {
      id: 1,
      tournamentId: 55,
      userId: 1,
      score: 10,
      rank: null,
      rewardGranted: false,
      firstContributionAt: new Date(),
    },
  ];
  prismaMock.tournament.create = async () => ({
    id: 56,
    name: "bad-prize",
    metric: "MINIGAME_WINS",
    type: "DAILY",
    status: "ACTIVE",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86_400_000),
    description: null,
    recurring: true,
  });
  if (!prismaMock.$transaction) {
    prismaMock.$transaction = async (fn) =>
      fn({
        tournamentEntry: {
          updateMany: async () => ({ count: 1 }),
          update: async () => ({}),
        },
        userRewardInbox: { create: async () => ({}) },
        userPowerGame: { create: async () => ({}) },
        tournament: { create: async () => ({ id: 56 }), update: async () => ({}) },
      });
  }
  try {
    await service.finalizeTournament(55);
  } catch {
    /* ok */
  }
});

test("restore module mocks after controllers-prisma suite", () => {
  mock.restoreAll();
});
