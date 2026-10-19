/**
 * The heartbeat reports the seconds balance it leaves behind, so the YouTube / auto-mining pages
 * can show "verified time" without re-fetching their full stats on every beat.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const boostsSpec = pathToFileURL(path.join(root, "server/modules/boosts/index.ts")).href;

let userRow = null;
let updateManyCount = 1;
const reads = [];
mock.module(prismaSpec, {
  defaultExport: {
    user: {
      findUnique: async (args) => {
        reads.push(args);
        return userRow;
      },
      updateMany: async () => ({ count: updateManyCount }),
    },
  },
});
mock.module(boostsSpec, { namedExports: { hasActiveBoost: async () => false } });

const { processHeartbeatForUser } = await import("../../server/modules/session/session.heartbeat.service.ts");

test("credited beat reports previous balance + credit, from the same single read", async () => {
  reads.length = 0;
  userRow = { ytLastHeartbeatAt: new Date(Date.now() - 10_000), autoMiningLastHeartbeatAt: null, ytSecondsBalance: 40, autoMiningSecondsBalance: 7 };
  updateManyCount = 1;
  const r = await processHeartbeatForUser(1, "youtube");
  assert.equal(r.throttled, false);
  assert.equal(r.credited, 10);
  assert.equal(r.balanceSeconds, 50);
  assert.equal(reads.length, 1);
});

test("capped beat credits nothing and reports the unchanged balance", async () => {
  userRow = { ytLastHeartbeatAt: new Date(Date.now() - 10_000), autoMiningLastHeartbeatAt: null, ytSecondsBalance: 300, autoMiningSecondsBalance: 0 };
  updateManyCount = 0;
  const r = await processHeartbeatForUser(1, "youtube");
  assert.equal(r.credited, 0);
  assert.equal(r.balanceSeconds, 300);
});

test("auto-mining beat reports the auto-mining balance, first beat seeds 10s", async () => {
  userRow = { ytLastHeartbeatAt: null, autoMiningLastHeartbeatAt: null, ytSecondsBalance: 99, autoMiningSecondsBalance: 5 };
  updateManyCount = 1;
  const r = await processHeartbeatForUser(1, "auto-mining");
  assert.equal(r.credited, 10);
  assert.equal(r.balanceSeconds, 15);
});

test("throttled beat carries no balance", async () => {
  userRow = { ytLastHeartbeatAt: new Date(), autoMiningLastHeartbeatAt: null, ytSecondsBalance: 40, autoMiningSecondsBalance: 0 };
  const r = await processHeartbeatForUser(1, "youtube");
  assert.deepEqual(r, { throttled: true });
});
