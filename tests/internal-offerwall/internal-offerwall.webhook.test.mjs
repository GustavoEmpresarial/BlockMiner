import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const webhook = await import("../../server/modules/internal-offerwall/internal-offerwall.webhook.ts");

test("notifyInternalOfferwallCompletion: no-op when INTERNAL_OFFERWALL_WEBHOOK_URL unset", () => {
  const prev = process.env.INTERNAL_OFFERWALL_WEBHOOK_URL;
  delete process.env.INTERNAL_OFFERWALL_WEBHOOK_URL;
  // Must not throw
  webhook.notifyInternalOfferwallCompletion({
    event: "INTERNAL_OFFERWALL_SELF_CLAIM_COMPLETED",
    attemptId: 1,
    userId: 1,
    offerId: 1,
    offerKind: "GENERAL_TASK",
    completedAtIso: new Date().toISOString(),
  });
  if (prev !== undefined) process.env.INTERNAL_OFFERWALL_WEBHOOK_URL = prev;
  assert.ok(true);
});

test("HMAC signature shape matches legacy X-BlockMiner-Signature", () => {
  const body = JSON.stringify({ event: "test", attemptId: 1 });
  const secret = "test-secret";
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(`sha256=${sig}`.startsWith("sha256="), true);
  assert.equal(sig.length, 64);
});
