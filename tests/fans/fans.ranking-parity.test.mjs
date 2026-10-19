/**
 * Bug: the cooling-fan bonus (+1% per rack with a fan) was paid by the mining engine but the
 * ranking, HASHRATE tournaments and power stats summed power without it (and without shortlink
 * power), so buying/mounting a fan never moved a player in the ranking.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = { fans: [], racks: [], users: [], rackQueries: 0 };
const inIds = (where) => where?.userId?.in ?? [where?.userId];
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, {
  defaultExport: {
    userVisualFanPlacement: {
      findMany: async ({ where }) => db.fans.filter((f) => inIds(where).includes(f.userId)),
    },
    userRack: {
      findMany: async ({ where }) => {
        db.rackQueries += 1;
        return db.racks.filter((r) => inIds(where).includes(r.userId) && r.userMiner?.isActive !== false);
      },
    },
    user: { findMany: async () => db.users },
  },
});

const fan = await import("../../server/modules/mining/mining.fan-bonus.ts");
const ranking = await import("../../server/modules/tournaments/ranking.hashrate.ts");
const { computeFanBonusHashRate } = await import("../../server/modules/mining/mining.repository.ts");

const slot = (userId, roomId, position, hashRate) => ({ userId, roomId, position, userMiner: { hashRate } });

test("computeFanBonusFromRows: 1% of the machines inside racks that have a fan, per rack", () => {
  const slots = [slot(1, 1, 0, 5000), slot(1, 1, 7, 5000), slot(1, 1, 8, 2500), slot(1, 2, 0, 9999)];
  assert.equal(fan.computeFanBonusFromRows([], slots), 0);
  assert.equal(fan.computeFanBonusFromRows([{ roomId: 1, visualIndex: 0 }], slots), 100);
  assert.equal(fan.computeFanBonusFromRows([{ roomId: 1, visualIndex: 0 }, { roomId: 1, visualIndex: 1 }], slots), 125);
  // fan in another room does not cover room 1
  assert.equal(fan.computeFanBonusFromRows([{ roomId: 3, visualIndex: 0 }], slots), 0);
  // bad / negative hashrate never subtracts
  assert.equal(fan.computeFanBonusFromRows([{ roomId: 1, visualIndex: 0 }], [slot(1, 1, 0, -50), slot(1, 1, 1, "x")]), 0);
});

test("aggregateUserHashrates counts the fan bonus (permanent) and shortlink power (temporary)", () => {
  const agg = ranking.aggregateUserHashrates({
    id: 1,
    miners: [{ hashRate: 10000, isActive: true }],
    shortlinkPowers: [{ hashRate: 30 }],
    fanBonusHashRate: 100,
  });
  assert.equal(agg.machineHashrate, 10000);
  assert.equal(agg.fanBonusHashrate, 100);
  assert.equal(agg.permanentHashrate, 10100);
  assert.equal(agg.temporaryShortlinkHashrate, 30);
  assert.equal(agg.totalHashrate, 10130);
});

test("ranking: a player with fans passes an equal player without fans", async () => {
  db.fans = [{ userId: 2, roomId: 20, visualIndex: 0 }];
  db.racks = [slot(1, 10, 0, 10000), slot(2, 20, 0, 10000)];
  db.rackQueries = 0;
  const users = await ranking.attachFanBonus([
    { id: 1, username: "a", miners: [{ hashRate: 10000, isActive: true }] },
    { id: 2, username: "b", miners: [{ hashRate: 10000, isActive: true }] },
  ]);
  const rows = ranking.buildRankingRows(users);
  assert.deepEqual(rows.map((r) => r.id), [2, 1]);
  assert.equal(rows[0].totalHashRate, 10100);
  assert.equal(rows[1].totalHashRate, 10000);
  assert.equal(db.rackQueries, 1, "racks loaded once, only for users with fans");
});

test("tournament loader attaches the fan bonus too", async () => {
  db.fans = [{ userId: 2, roomId: 20, visualIndex: 0 }];
  db.racks = [slot(2, 20, 0, 4000)];
  db.users = [{ id: 2, miners: [{ hashRate: 4000, isActive: true }] }];
  const users = await ranking.loadUsersForHashrateTournament(new Date(), true);
  assert.equal(ranking.aggregateUserHashrates(users[0]).totalHashrate, 4040);
});

test("no fans anywhere: no rack query at all", async () => {
  db.fans = [];
  db.rackQueries = 0;
  assert.equal((await fan.loadFanBonusByUser([1, 2, 3])).size, 0);
  assert.equal(db.rackQueries, 0);
});

test("mining engine helper (what is paid) and ranking (what is shown) agree", async () => {
  db.fans = [{ userId: 7, roomId: 70, visualIndex: 1 }];
  db.racks = [slot(7, 70, 8, 3000), slot(7, 70, 9, 2000), slot(7, 70, 0, 9000)];
  const paid = await computeFanBonusHashRate(7);
  const [shown] = await ranking.attachFanBonus([{ id: 7 }]);
  assert.equal(paid, 50);
  assert.equal(shown.fanBonusHashRate, paid);
});
