import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.OFFERWALLME_SECRET = "test-secret";
process.env.OFFERWALLME_ALLOWED_IPS = "1.2.3.4,5.6.7.8";

const service = await import("../../server/modules/offerwallme/offerwallme.service.ts");

function sign(subId, transId, reward) {
  return crypto.createHash("md5").update(subId + transId + reward + "test-secret").digest("hex");
}

test("verifySignature: accepts a correctly signed payload", () => {
  const sig = sign("42", "tx1", "10");
  assert.equal(service.verifySignature("42", "tx1", "10", sig), true);
});

test("verifySignature: rejects a tampered payload", () => {
  const sig = sign("42", "tx1", "10");
  assert.equal(service.verifySignature("42", "tx1", "999", sig), false);
});

test("verifySignature: rejects malformed hex signature without throwing", () => {
  assert.equal(service.verifySignature("42", "tx1", "10", "not-hex-!!"), false);
});

test("isIpAllowed: allows configured IPs only", () => {
  assert.equal(service.isIpAllowed("1.2.3.4"), true);
  assert.equal(service.isIpAllowed("9.9.9.9"), false);
});

test("processPostback: rejects missing required params before touching the DB", async () => {
  const result = await service.processPostback(
    { subId: "", transId: "", reward: "", payout: "0", offerName: "", offerType: "", status: 1, debug: "0", signature: "" },
    "1.2.3.4",
  );
  assert.equal(result.kind, "bad_request");
});

test("processPostback: rejects a bad signature before touching the DB", async () => {
  const result = await service.processPostback(
    { subId: "42", transId: "tx1", reward: "10", payout: "5", offerName: "", offerType: "", status: 1, debug: "0", signature: "deadbeef" },
    "1.2.3.4",
  );
  assert.equal(result.kind, "forbidden");
});

test("processPostback: debug=1 postbacks are acknowledged without crediting", async () => {
  const sig = sign("42", "tx1", "10");
  const result = await service.processPostback(
    { subId: "42", transId: "tx1", reward: "10", payout: "5", offerName: "", offerType: "", status: 1, debug: "1", signature: sig },
    "1.2.3.4",
  );
  assert.equal(result.kind, "ok");
});
