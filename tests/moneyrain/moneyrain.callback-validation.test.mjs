import assert from "node:assert/strict";
import { describe, it } from "node:test";
import crypto from "node:crypto";

const SECRET = "unit-test-secret";
const prevSecret = process.env.MONEYRAIN_CALLBACK_SECRET;
process.env.MONEYRAIN_CALLBACK_SECRET = SECRET;

// Module-level DEFAULT_SECRET is computed at import time — env must be set first.
const { processMoneyRainCallback } = await import("../../server/modules/moneyrain/moneyrain.service.ts");

function sign(rawBody, secret = SECRET) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

describe("moneyrain processMoneyRainCallback — validation gates that don't touch the DB", () => {
  it("rejects when rawBody is missing", async () => {
    const result = await processMoneyRainCallback(undefined, "sha256=x", String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.equal(result.body, "no raw body");
  });

  it("rejects malformed JSON", async () => {
    const body = Buffer.from("{not json");
    const sig = sign(body);
    const result = await processMoneyRainCallback(body, sig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "bad json");
  });

  it("rejects an invalid signature", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", status: "completed", view_id: "v1", external_uid: "1", reward_usdt: 1 }));
    const badSig = sign(body, "wrong-secret");
    const result = await processMoneyRainCallback(body, badSig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(result.body, "bad signature");
  });

  it("rejects a stale timestamp even with a valid signature", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", status: "completed", view_id: "v1", external_uid: "1", reward_usdt: 1 }));
    const sig = sign(body);
    const staleSec = nowSec() - 6 * 60;
    const result = await processMoneyRainCallback(body, sig, String(staleSec), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "stale timestamp");
  });

  it("rejects a payload with the wrong event/status", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.pending", status: "completed", view_id: "v1", external_uid: "1", reward_usdt: 1 }));
    const sig = sign(body);
    const result = await processMoneyRainCallback(body, sig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "bad payload");
  });

  it("rejects an invalid external_uid", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", status: "completed", view_id: "v1", external_uid: "not-a-number", reward_usdt: 1 }));
    const sig = sign(body);
    const result = await processMoneyRainCallback(body, sig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "invalid external_uid");
  });

  it("rejects a missing view_id", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", status: "completed", external_uid: "1", reward_usdt: 1 }));
    const sig = sign(body);
    const result = await processMoneyRainCallback(body, sig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "missing view_id");
  });

  it("rejects a zero/negative reward_usdt", async () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", status: "completed", view_id: "v1", external_uid: "1", reward_usdt: 0 }));
    const sig = sign(body);
    const result = await processMoneyRainCallback(body, sig, String(nowSec()), "1.2.3.4");
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.body, "bad reward");
  });
});

process.env.MONEYRAIN_CALLBACK_SECRET = prevSecret;
