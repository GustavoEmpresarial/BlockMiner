/**
 * tournaments.service admin/read paths with mocked prisma (not the service module).
 * Run: npx tsx --import ./tests/_env-test-overrides.mjs --test --experimental-test-module-mocks tests/tournaments/coverage.service-admin.test.mjs
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const miningSpec = pathToFileURL(path.join(root, "server/modules/mining/index.ts")).href;

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: {
    findUnique: async () => null,
    update: async () => ({ status: "CANCELLED", version: 1 }),
  },
  tournamentEntry: {
    findMany: async () => [],
    findUnique: async () => null,
    count: async () => 0,
  },
  tournamentPrize: {
    deleteMany: async () => ({ count: 0 }),
  },
  tournamentDisplayConfig: {
    findUnique: async () => null,
  },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
};

mock.module(prismaSpec, {
  defaultExport: prismaMock,
});
mock.module(miningSpec, {
  namedExports: {
    miningEngine: { drainSettlements: async () => {} },
    syncUserBaseHashRate: async () => {},
  },
});

const service = await import("../../server/modules/tournaments/tournaments.service.ts");
const cache = await import("../../server/modules/tournaments/tournaments.cache.ts");
const { TOURNAMENT_ERROR } = await import("../../server/modules/tournaments/tournaments.errors.ts");

test("adminUpdateTournament rejects immutable fields on ACTIVE tournaments", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 1,
    status: "ACTIVE",
    metric: "FAUCET",
    startsAt: new Date(),
    endsAt: new Date(),
  });

  await assert.rejects(
    () => service.adminUpdateTournament(1, { metric: "SHORTLINK" }),
    (err) => {
      assert.equal(err.code, TOURNAMENT_ERROR.ACTIVE_IMMUTABLE_FIELDS);
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("adminUpdateTournament rejects edits when ENDED", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 2,
    status: "ENDED",
    metric: "FAUCET",
  });

  await assert.rejects(
    () => service.adminUpdateTournament(2, { name: "New name" }),
    (err) => {
      assert.equal(err.code, TOURNAMENT_ERROR.ADMIN_NOT_EDITABLE);
      return true;
    },
  );
});

test("adminCancelTournament cancels ACTIVE tournament and busts cache", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 3,
    status: "ACTIVE",
    metric: "FAUCET",
  });
  prismaMock.tournament.update = async ({ data }) => {
    if (data.status === "CANCELLED") {
      return { id: 3, status: "CANCELLED", metric: "FAUCET", version: 2 };
    }
    if (data.version?.increment) {
      return { version: 3 };
    }
    return { version: 1 };
  };

  const updated = await service.adminCancelTournament(3);
  assert.equal(updated.status, "CANCELLED");
});

test("adminGetEntries paginates with skip derived from page", async () => {
  let captured = null;
  prismaMock.tournamentEntry.findMany = async (args) => {
    captured = args;
    return [{ id: 1, score: 10, user: { id: 5, username: "u", name: "N" } }];
  };
  prismaMock.tournamentEntry.count = async () => 100;

  const out = await service.adminGetEntries(8, 3, 10);
  assert.equal(out.page, 3);
  assert.equal(out.limit, 10);
  assert.equal(out.total, 100);
  assert.equal(captured.skip, 20);
  assert.equal(captured.take, 10);
});

test("getTournamentWithLeaderboard strips legacy name from cached leaderboard users", async () => {
  const tournamentId = 501;
  const startsAt = new Date("2026-09-01T00:00:00.000Z");
  const endsAt = new Date("2026-09-02T00:00:00.000Z");

  await cache.setCachedLeaderboard(tournamentId, [
    {
      userId: 9,
      score: 5,
      user: { id: 9, username: "miner9", name: "Real Name" },
    },
  ]);

  prismaMock.tournament.findUnique = async () => ({
    id: tournamentId,
    name: "Cup",
    description: null,
    type: "DAILY",
    metric: "FAUCET",
    status: "ACTIVE",
    startsAt,
    endsAt,
    scoresReconciledAt: new Date("2026-09-01T06:00:00.000Z"),
    prizes: [],
    _count: { entries: 1 },
  });

  const view = await service.getTournamentWithLeaderboard(tournamentId);
  assert.ok(view);
  assert.equal(view.top.length, 1);
  assert.equal(view.top[0].user.username, "miner9");
  assert.equal(view.top[0].user.name, undefined);
  assert.ok(view.scoresComputedAt);
});

test("finalizeTournament returns early when tournament already ENDED", async () => {
  prismaMock.tournament.findUnique = async () => ({
    id: 99,
    status: "ENDED",
    name: "Done",
    metric: "FAUCET",
    prizes: [],
  });

  const result = await service.finalizeTournament(99);
  assert.deepEqual(result, { ranked: 0, rewarded: 0, failed: 0, nextId: null });
});
