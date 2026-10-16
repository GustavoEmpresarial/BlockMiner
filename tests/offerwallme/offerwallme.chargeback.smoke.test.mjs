import test from "node:test";
import crypto from "node:crypto";

const SECRET = "test-chargeback-secret";
process.env.OFFERWALLME_SECRET = SECRET;
delete process.env.OFFERWALLME_MAINTENANCE;

const { runChargebackSmoke } = await import("../offerwall/_chargeback-smoke.mjs");
const { processPostback } = await import("../../server/modules/offerwallme/offerwallme.service.ts");

function send(userId, transId, status) {
  const subId = String(userId);
  const reward = "10";
  const signature = crypto.createHash("md5").update(subId + transId + reward + SECRET).digest("hex");
  return processPostback(
    { subId, transId, reward, payout: "0.05", offerName: "Smoke", offerType: "Survey", status, debug: "0", signature },
    "127.0.0.1",
  );
}

test("Offerwall.me chargeback smoke", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, async (t) => {
  await runChargebackSmoke(t, {
    provider: "offerwallme",
    callbackModel: "offerwallMeCallback",
    sendCredit: (userId, transId) => send(userId, transId, 1),
    sendChargeback: (userId, transId) => send(userId, transId, 2),
  });
});
