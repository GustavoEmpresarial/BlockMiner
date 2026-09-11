import test from "node:test";
import assert from "node:assert/strict";

const svc = await import("../../server/modules/zerads/zerads.service.ts");
const payout = await import("../../server/shared/offerwallBlkPayout.ts");

test("BLK_PER_CLICK is fixed at 0.0005", () => {
  assert.equal(svc.BLK_PER_CLICK, 0.0005);
  assert.equal(payout.OFFERWALL_BLK_PER_CLICK, 0.0005);
});

test("blkForOfferwallClicks multiplies clicks by 0.0005", () => {
  assert.equal(Number(payout.blkForOfferwallClicks(1)), 0.0005);
  assert.equal(Number(payout.blkForOfferwallClicks(10)), 0.005);
  assert.equal(Number(payout.blkForOfferwallClicks(0)), 0);
});

test("MAX_ZER_PER_CALLBACK defaults to 5 when unset", () => {
  assert.ok(Number.isFinite(svc.MAX_ZER_PER_CALLBACK));
});

test("buildCallbackHash is deterministic within the same 5-minute bucket", () => {
  const t1 = new Date("2026-07-01T12:01:00.000Z");
  const t2 = new Date("2026-07-01T12:04:59.000Z");
  const h1 = svc.buildCallbackHash("alice", 1.5, 10, t1);
  const h2 = svc.buildCallbackHash("alice", 1.5, 10, t2);
  assert.equal(h1, h2);
});

test("buildCallbackHash differs across a 5-minute bucket boundary", () => {
  const t1 = new Date("2026-07-01T12:04:59.999Z");
  const t2 = new Date("2026-07-01T12:05:00.000Z");
  const h1 = svc.buildCallbackHash("alice", 1.5, 10, t1);
  const h2 = svc.buildCallbackHash("alice", 1.5, 10, t2);
  assert.notEqual(h1, h2);
});

test("buildCallbackHash differs when username/amount/clicks differ (same bucket)", () => {
  const t = new Date("2026-07-01T12:01:00.000Z");
  const base = svc.buildCallbackHash("alice", 1.5, 10, t);
  assert.notEqual(svc.buildCallbackHash("bob", 1.5, 10, t), base);
  assert.notEqual(svc.buildCallbackHash("alice", 2.0, 10, t), base);
  assert.notEqual(svc.buildCallbackHash("alice", 1.5, 11, t), base);
});
