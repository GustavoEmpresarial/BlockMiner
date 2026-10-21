/**
 * Fan purchases left no record (impossible to audit who bought how many), the balance check was a
 * read-then-write under a lock keyed by sku+channel (shop and offer in parallel both passed), and
 * the price was float math. Now: conditional debit, one lock per user, Decimal, and a ledger row.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.FAN_SALES_AVAILABLE_AT = "2020-01-01T00:00:00.000Z";
process.env.FAN_SHOP_PRICE = "0.15";
process.env.FAN_OFFER_PRICE = "0.1";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = { blk: 0, credits: 0, txs: [] };
let chain = Promise.resolve();
const tick = () => new Promise((r) => setImmediate(r));
const client = {
  $executeRaw: async () => 1,
  user: {
    updateMany: async ({ where, data }) => {
      await tick();
      const need = Number(where.blkBalance.gte);
      if (db.blk + 1e-12 < need) return { count: 0 };
      db.blk = Math.round((db.blk - Number(data.blkBalance.decrement)) * 1e8) / 1e8;
      db.credits += data.fanCredits.increment;
      return { count: 1 };
    },
    findUnique: async () => ({ blkBalance: db.blk, fanCredits: db.credits }),
  },
  transaction: { create: async ({ data }) => { db.txs.push(data); return data; } },
  $transaction: (fn) => { const run = chain.then(() => fn(client)); chain = run.catch(() => {}); return run; },
};
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, { defaultExport: client });
mock.module(pathToFileURL(path.join(root, "server/modules/mining/index.ts")).href, {
  namedExports: { miningEngine: { reloadMinerProfile: async () => {} } },
});
const { purchaseFansForUser } = await import("../../server/modules/fans/fans.service.ts");
const now = new Date();
const reset = (blk) => { db.blk = blk; db.credits = 0; db.txs = []; };

test("a purchase debits BLK, grants credits and writes one fan_purchase ledger row", async () => {
  reset(1);
  const r = await purchaseFansForUser(7, "cooling_fan_system", 3, "offer", now);
  assert.equal(r.creditsGranted, 3);
  assert.equal(db.credits, 3);
  assert.equal(db.blk, 0.7);
  assert.equal(db.txs.length, 1);
  const tx = db.txs[0];
  assert.equal(tx.type, "fan_purchase");
  assert.equal(tx.userId, 7);
  assert.equal(String(tx.amount), "0.3");
  const raw = JSON.parse(tx.rawTx);
  assert.deepEqual([raw.asset, raw.channel, raw.quantity, raw.creditsGranted, raw.creditsAfter], ["blk", "offer", 3, 3, 3]);
});

test("insufficient BLK: nothing debited, no credit, no ledger row", async () => {
  reset(0.14);
  await assert.rejects(purchaseFansForUser(7, "cooling_fan_system", 1, "shop", now), /FAN_INSUFFICIENT_BALANCE/);
  assert.equal(db.blk, 0.14);
  assert.equal(db.credits, 0);
  assert.equal(db.txs.length, 0);
});

test("shop + offer purchases in parallel never overspend", async () => {
  reset(0.2);
  const r = await Promise.allSettled([
    purchaseFansForUser(7, "cooling_fan_system", 1, "shop", now),
    purchaseFansForUser(7, "cooling_fan_system", 1, "offer", now),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.ok(db.blk >= 0);
  assert.equal(db.txs.length, db.credits);
});

test("invalid quantity is rejected before touching the database", async () => {
  reset(10);
  await assert.rejects(purchaseFansForUser(7, "cooling_fan_system", 0, "shop", now));
  await assert.rejects(purchaseFansForUser(7, "cooling_fan_system", -2, "shop", now));
  await assert.rejects(purchaseFansForUser(7, "nope", 1, "shop", now));
  assert.equal(db.txs.length, 0);
  assert.equal(db.blk, 10);
});
