/**
 * Log volume: one applied tournament contribution used to print 6 INFO lines (≈330 MB/day in
 * prod). At LOG_LEVEL=info it must print exactly one; the step-by-step trail stays at DEBUG.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.NODE_ENV = "development"; // the logger is silent under NODE_ENV=test
process.env.LOG_LEVEL = "info";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

let insertResult = "inserted";
mock.module(spec("server/core/database/prisma.ts"), { defaultExport: { $transaction: async (fn) => fn({}) } });
mock.module(spec("server/modules/tournaments/tournaments.repository.ts"), {
  namedExports: {
    insertContributionIdempotent: async () => insertResult,
    applyScoreDelta: async () => {},
  },
});
mock.module(spec("server/modules/tournaments/tournaments.cache.ts"), { namedExports: { dropCachedLeaderboard: () => {} } });
mock.module(spec("server/modules/tournaments/tournaments.metrics.ts"), { namedExports: { queueContributionStats: () => {} } });
mock.module(spec("server/modules/tournaments/tournaments.realtime.ts"), { namedExports: { notifyTournamentDirty: () => {} } });

const { applyContribution } = await import("../../server/modules/tournaments/tournaments.projection.ts");

function captureInfo(fn) {
  const lines = [];
  const orig = console.info;
  console.info = (line) => lines.push(JSON.parse(line));
  return fn().finally(() => {
    console.info = orig;
  }).then(() => lines);
}

const delta = { userId: 5, sourceType: "youtube_claim", sourceId: "abc", metricValue: 1, eventAt: new Date() };

test("an applied contribution prints a single INFO line carrying the timing", async () => {
  insertResult = "inserted";
  const lines = await captureInfo(() => applyContribution(9, delta));
  assert.deepEqual(lines.map((l) => l.message), ["tournament.contribution.applied"]);
  assert.equal(lines[0].details.tournamentId, 9);
  assert.equal(typeof lines[0].details.totalMs, "number");
});

test("a duplicate still prints its one INFO line", async () => {
  insertResult = "duplicate";
  const lines = await captureInfo(() => applyContribution(9, delta));
  assert.deepEqual(lines.map((l) => l.message), ["tournament.contribution.duplicate"]);
});
