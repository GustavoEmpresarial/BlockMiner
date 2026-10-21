/**
 * Engine stats + cache version are admin diagnostics. They used to be written on every
 * contribution (2 UPDATEs of the same tournament row + COUNT(*)); now each tournament is
 * written once per flush window with the summed actions and the number of contributions.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;

const calls = { update: [], count: 0, findFirst: 0, findUnique: 0 };
let failNextUpdate = false;
const prismaMock = {
  tournament: {
    findUnique: async () => {
      calls.findUnique++;
      return { version: 5, metricConfig: { engineStats: { totalActions: 100 }, other: "keep" } };
    },
    update: async (args) => {
      if (failNextUpdate) {
        failNextUpdate = false;
        throw new Error("db down");
      }
      calls.update.push(args);
      return { version: 6 };
    },
  },
  tournamentEntry: {
    count: async () => {
      calls.count++;
      return 3;
    },
    findFirst: async () => {
      calls.findFirst++;
      return { score: 42 };
    },
  },
};
mock.module(prismaSpec, { defaultExport: prismaMock });

const metrics = await import("../../server/modules/tournaments/tournaments.metrics.ts");

function reset() {
  calls.update.length = 0;
  calls.count = calls.findFirst = calls.findUnique = 0;
}

test("many contributions → one write per tournament with summed actions and version bump", async () => {
  reset();
  const t1 = new Date("2026-10-18T05:00:00.000Z");
  const t2 = new Date("2026-10-18T05:00:05.000Z");
  metrics.queueContributionStats(353, 10, 2, t1, 60_000);
  metrics.queueContributionStats(353, 11, 3, t2, 60_000);
  metrics.queueContributionStats(353, 12, 1, t1, 60_000);
  assert.equal(calls.update.length, 0, "nothing written before the flush");

  await metrics.flushContributionStats(353);

  assert.equal(calls.update.length, 1);
  assert.equal(calls.count, 1);
  const { where, data } = calls.update[0];
  assert.deepEqual(where, { id: 353 });
  assert.deepEqual(data.version, { increment: 3 }, "one version bump per contribution, in a single UPDATE");
  assert.equal(data.metricConfig.engineStats.totalActions, 106);
  assert.equal(data.metricConfig.engineStats.participants, 3);
  assert.equal(data.metricConfig.engineStats.leaderScore, 42);
  assert.equal(data.metricConfig.engineStats.lastContributionAt, t2.toISOString(), "latest event wins");
  assert.equal(data.metricConfig.other, "keep", "other metricConfig keys are preserved");

  await metrics.flushContributionStats(353);
  assert.equal(calls.update.length, 1, "an empty flush writes nothing");
});

test("tournaments are flushed independently", async () => {
  reset();
  const at = new Date();
  metrics.queueContributionStats(1, 1, 1, at, 60_000);
  metrics.queueContributionStats(2, 1, 1, at, 60_000);
  await metrics.flushContributionStats(1);
  assert.equal(calls.update.length, 1);
  assert.deepEqual(calls.update[0].where, { id: 1 });
  await metrics.flushContributionStats(2);
  assert.equal(calls.update.length, 2);
});

test("the timer flushes on its own after the window", async () => {
  reset();
  metrics.queueContributionStats(77, 1, 4, new Date(), 20);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls.update.length, 1);
  assert.deepEqual(calls.update[0].data.version, { increment: 1 });
});

test("a failed flush is logged, not thrown, and does not poison the next window", async () => {
  reset();
  failNextUpdate = true;
  metrics.queueContributionStats(9, 1, 1, new Date(), 60_000);
  await metrics.flushContributionStats(9);
  assert.equal(calls.update.length, 0);
  metrics.queueContributionStats(9, 1, 1, new Date(), 60_000);
  await metrics.flushContributionStats(9);
  assert.equal(calls.update.length, 1);
});

test("touchEngineStatsOnContribution without versionIncrement leaves version alone", async () => {
  reset();
  await metrics.touchEngineStatsOnContribution(5, 1, 1, new Date());
  assert.equal(calls.update[0].data.version, undefined);
});
