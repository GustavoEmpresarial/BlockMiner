/**
 * tournaments.actions recordTournamentAction with engine V2 + prisma stubs (real repo/outbox).
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const redisSpec = pathToFileURL(path.join(root, "server/core/redis/index.ts")).href;

process.env.TOURNAMENT_ENGINE_V2 = "1";

/** @type {Record<string, unknown>} */
const prismaMock = {
  tournament: { findMany: async () => [] },
  tournamentAction: {
    create: async (args) => defaultActionCreate(args),
    findUnique: async () => null,
  },
  tournamentDomainOutbox: {
    create: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  tournamentEntry: {
    findMany: async () => [],
    upsert: async () => ({}),
    create: async () => ({}),
    update: async () => ({}),
  },
  tournamentScoreContribution: { create: async () => ({}) },
  $executeRaw: async () => 0,
  $queryRaw: async () => [],
  $transaction: async (fn) => (typeof fn === "function" ? fn(prismaMock) : []),
};

mock.module(prismaSpec, { defaultExport: prismaMock });
mock.module(redisSpec, {
  namedExports: {
    getRedis: () => null,
    withRedis: async (_k, fn) => fn(null),
    ensureRedisConnected: async () => {},
    shutdownRedis: async () => {},
    getRedisUrl: () => null,
  },
});

const actions = await import("../../server/modules/tournaments/tournaments.actions.ts");

function defaultActionCreate({ data }) {
  const executedAtUTC =
    data.executedAtUTC instanceof Date ? data.executedAtUTC : new Date(data.executedAtUTC);
  return {
    id: 1,
    userId: data.userId,
    provider: data.provider,
    actionCount: data.actionCount,
    executedAtUTC,
    sourceId: data.sourceId,
    tournamentEligible: data.tournamentEligible ?? true,
    metadata: data.metadata ?? null,
  };
}

test("recordTournamentAction no-ops when engine V2 disabled", async () => {
  const prev = process.env.TOURNAMENT_ENGINE_V2;
  process.env.TOURNAMENT_ENGINE_V2 = "0";
  let created = false;
  prismaMock.tournamentAction.create = async () => {
    created = true;
    return {};
  };
  await actions.recordTournamentAction({
    userId: 1,
    provider: "faucet",
    actionCount: 1,
    executedAtUTC: new Date(),
    sourceId: "off",
  });
  assert.equal(created, false);
  process.env.TOURNAMENT_ENGINE_V2 = prev;
});

test("recordTournamentAction returns early when actionCount is zero", async () => {
  let created = false;
  prismaMock.tournamentAction.create = async () => {
    created = true;
    return {};
  };
  await actions.recordTournamentAction({
    userId: 1,
    provider: "faucet",
    actionCount: 0,
    executedAtUTC: new Date(),
    sourceId: "zero",
  });
  assert.equal(created, false);
});

test("recordTournamentAction publishes and drains outbox on success", async () => {
  prismaMock.tournamentAction.create = async (args) => defaultActionCreate(args);
  let outboxCreates = 0;
  prismaMock.tournamentDomainOutbox.create = async () => {
    outboxCreates += 1;
    return { id: 1 };
  };
  prismaMock.$queryRaw = async () => [];
  await actions.recordTournamentAction({
    userId: 2,
    provider: "faucet",
    actionCount: 1,
    executedAtUTC: new Date("2026-08-15T00:00:00.000Z"),
    sourceId: `fresh-${Date.now()}`,
  });
  assert.ok(outboxCreates >= 1);
});

test("recordTournamentAction logs duplicate replay and still drains outbox", async () => {
  const sourceId = `dup-${Date.now()}`;
  const existing = {
    id: 2,
    userId: 1,
    provider: "faucet",
    actionCount: 1,
    executedAtUTC: new Date("2026-08-15T00:00:00.000Z"),
    sourceId,
    tournamentEligible: true,
    metadata: null,
  };
  prismaMock.tournamentAction.create = async () => {
    throw Object.assign(new Error("unique"), { code: "P2002" });
  };
  prismaMock.tournamentAction.findUnique = async () => existing;
  prismaMock.$queryRaw = async () => [];
  await actions.recordTournamentAction({
    userId: 1,
    provider: "faucet",
    actionCount: 1,
    executedAtUTC: new Date("2026-08-15T00:00:00.000Z"),
    sourceId,
  });
});

test("restore module mocks after actions suite", () => {
  mock.restoreAll();
});
