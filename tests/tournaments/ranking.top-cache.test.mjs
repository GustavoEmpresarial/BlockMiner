import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.RANKING_TOP_CACHE_TTL_MS = "50";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
let loads = 0;
let fail = false;
mock.module(pathToFileURL(path.join(root, "server/modules/tournaments/ranking.repository.ts")).href, {
  namedExports: {
    listRankableUsers: async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 5));
      if (fail) throw new Error("db down");
      return [{ id: 1, username: "a", miners: [{ hashRate: loads, isActive: true }] }];
    },
    findUserRoomProfile: async () => null,
  },
});
mock.module(pathToFileURL(path.join(root, "server/modules/avatar/avatar.lookup.ts")).href, {
  namedExports: { withAvatarUrls: async (rows) => rows.map((r) => ({ ...r, avatarUrl: null })) },
});
const svc = await import("../../server/modules/tournaments/ranking.service.ts");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("concurrent first requests build the ranking once", async () => {
  svc.__resetTopRankingCacheForTests();
  loads = 0;
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => svc.getTopRanking(50, true)));
  assert.equal(loads, 1);
  assert.equal(a[0].rank, 1);
  assert.equal(a, b);
  assert.equal(b, c);
});

test("fresh cache is served without touching the DB", async () => {
  loads = 0;
  await svc.getTopRanking(50, true);
  assert.equal(loads, 0);
});

test("stale cache: old list immediately, one background rebuild, new list after", async () => {
  await wait(60);
  loads = 0;
  const before = await svc.getTopRanking(50, true);
  assert.equal(loads, 1, "rebuild started");
  await wait(20);
  const after = await svc.getTopRanking(50, true);
  assert.notEqual(before, after);
  assert.equal(loads, 1);
});

test("rebuild failure keeps serving the stale list", async () => {
  await wait(60);
  fail = true;
  const rows = await svc.getTopRanking(50, true);
  await wait(20);
  assert.ok(Array.isArray(rows) && rows.length === 1);
  const again = await svc.getTopRanking(50, true);
  assert.equal(again.length, 1);
  fail = false;
});

test("v2 flag is a separate cache entry", async () => {
  loads = 0;
  await svc.getTopRanking(50, false);
  assert.equal(loads, 1);
});
