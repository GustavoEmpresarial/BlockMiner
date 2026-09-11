import assert from "node:assert/strict";
import { describe, it } from "node:test";
import crypto from "node:crypto";

const {
  verifySignature,
  timingSafeEqualStrings,
  isTimestampFresh,
  isMoneyRainInMaintenance,
} = await import("../../server/modules/moneyrain/moneyrain.service.ts");

function sign(rawBody, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("moneyrain verifySignature", () => {
  it("accepts a correctly signed raw body", () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", view_id: "1" }));
    const sig = sign(body, "test-secret");
    assert.equal(verifySignature(body, sig, "test-secret"), true);
  });

  it("rejects a wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ event: "reward.completed", view_id: "1" }));
    const sig = sign(body, "test-secret");
    assert.equal(verifySignature(body, sig, "wrong-secret"), false);
  });

  it("rejects a tampered body (signature computed over different bytes)", () => {
    const original = Buffer.from(JSON.stringify({ event: "reward.completed", view_id: "1" }));
    const tampered = Buffer.from(JSON.stringify({ event: "reward.completed", view_id: "2" }));
    const sig = sign(original, "test-secret");
    assert.equal(verifySignature(tampered, sig, "test-secret"), false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const body = Buffer.from("{}");
    const rawHex = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
    assert.equal(verifySignature(body, rawHex, "test-secret"), false);
  });

  it("does not throw on malformed/short signature input", () => {
    const body = Buffer.from("{}");
    assert.doesNotThrow(() => verifySignature(body, "", "test-secret"));
    assert.equal(verifySignature(body, "", "test-secret"), false);
    assert.doesNotThrow(() => verifySignature(body, "sha256=not-hex", "test-secret"));
  });
});

describe("moneyrain timingSafeEqualStrings", () => {
  it("returns true for equal strings", () => {
    assert.equal(timingSafeEqualStrings("abc123", "abc123"), true);
  });

  it("returns false for different length strings without throwing", () => {
    assert.doesNotThrow(() => timingSafeEqualStrings("short", "a-much-longer-value"));
    assert.equal(timingSafeEqualStrings("short", "a-much-longer-value"), false);
  });
});

describe("moneyrain isTimestampFresh", () => {
  const now = 1_700_000_000_000;

  it("accepts a timestamp within the drift window", () => {
    assert.equal(isTimestampFresh(now / 1000, now), true);
  });

  it("accepts a timestamp exactly at the drift boundary", () => {
    const fiveMinAgoSec = now / 1000 - 5 * 60;
    assert.equal(isTimestampFresh(fiveMinAgoSec, now), true);
  });

  it("rejects a timestamp older than the drift window", () => {
    const staleSec = now / 1000 - 5 * 60 - 1;
    assert.equal(isTimestampFresh(staleSec, now), false);
  });

  it("rejects a timestamp too far in the future", () => {
    const futureSec = now / 1000 + 5 * 60 + 1;
    assert.equal(isTimestampFresh(futureSec, now), false);
  });

  it("rejects a non-numeric timestamp without throwing", () => {
    assert.doesNotThrow(() => isTimestampFresh(NaN, now));
    assert.equal(isTimestampFresh(NaN, now), false);
  });
});

describe("moneyrain isMoneyRainInMaintenance", () => {
  it("returns false when env var is unset", () => {
    const prev = process.env.MONEYRAIN_MAINTENANCE;
    delete process.env.MONEYRAIN_MAINTENANCE;
    assert.equal(isMoneyRainInMaintenance(), false);
    if (prev !== undefined) process.env.MONEYRAIN_MAINTENANCE = prev;
  });

  it("returns true for 'true'/'1'/'yes' (case-insensitive)", () => {
    const prev = process.env.MONEYRAIN_MAINTENANCE;
    for (const v of ["true", "1", "yes", "TRUE", "Yes"]) {
      process.env.MONEYRAIN_MAINTENANCE = v;
      assert.equal(isMoneyRainInMaintenance(), true, `expected true for ${v}`);
    }
    if (prev === undefined) delete process.env.MONEYRAIN_MAINTENANCE;
    else process.env.MONEYRAIN_MAINTENANCE = prev;
  });

  it("returns false for other values", () => {
    const prev = process.env.MONEYRAIN_MAINTENANCE;
    process.env.MONEYRAIN_MAINTENANCE = "false";
    assert.equal(isMoneyRainInMaintenance(), false);
    if (prev === undefined) delete process.env.MONEYRAIN_MAINTENANCE;
    else process.env.MONEYRAIN_MAINTENANCE = prev;
  });
});
