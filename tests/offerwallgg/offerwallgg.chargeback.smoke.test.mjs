import test from "node:test";
import crypto from "node:crypto";

const SECRET = "test-chargeback-secret";
process.env.OFFERWALLGG_SECRET = SECRET;
process.env.OFFERWALLGG_ALLOWED_IPS = "";

const { runChargebackSmoke } = await import("../offerwall/_chargeback-smoke.mjs");
const { processPostback } = await import("../../server/modules/offerwallgg/offerwallgg.service.ts");

function send(userId, transactionId, status) {
  const user = String(userId);
  const amount = status === "reversed" ? "-10" : "10";
  const signature = crypto.createHmac("sha256", SECRET).update(`${user}:${transactionId}:${amount}`).digest("hex");
  return processPostback(
    {
      userId: user,
      transactionId,
      amount,
      payoutUsd: "0.05",
      offerName: "Smoke",
      offerId: "smoke-offer",
      status,
      test: "0",
      signature,
    },
    "127.0.0.1",
  );
}

test("Offerwall.GG chargeback smoke", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, async (t) => {
  await runChargebackSmoke(t, {
    provider: "offerwallgg",
    callbackModel: "offerwallGgCallback",
    sendCredit: (userId, transactionId) => send(userId, transactionId, "credited"),
    sendChargeback: (userId, transactionId) => send(userId, transactionId, "reversed"),
  });
});
