import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.OFFERWALLME_SECRET = "test-maint-secret";
process.env.OFFERWALLME_ALLOWED_IPS = "127.0.0.1,1.2.3.4";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const {
  isOfferwallMeMaintenance,
  processPostback,
  verifySignature,
} = await import("../../server/modules/offerwallme/offerwallme.service.ts");
const {
  getOfferwallMeLink,
  getOfferwallMeEmbed,
  getOfferwallMeStatus,
  getOfferwallMeStats,
  offerwallMePostback,
} = await import("../../server/modules/offerwallme/offerwallme.controller.ts");

function createMockRes() {
  let statusCode = 200;
  let jsonBody = null;
  let textBody = null;
  return {
    status(s) {
      statusCode = s;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
    send(text) {
      textBody = text;
      return this;
    },
    getStatusCode: () => statusCode,
    getJson: () => jsonBody,
    getText: () => textBody,
  };
}

function generateSignature(subId, transId, reward) {
  return crypto.createHash("md5").update(subId + transId + reward + "test-maint-secret").digest("hex");
}

test("isOfferwallMeMaintenance: accurately parses boolean and string flags from environment", () => {
  const orig = process.env.OFFERWALLME_MAINTENANCE;
  try {
    delete process.env.OFFERWALLME_MAINTENANCE;
    assert.equal(isOfferwallMeMaintenance(), false);

    for (const val of ["true", "1", "yes", "on", "TRUE", "Yes", "ON"]) {
      process.env.OFFERWALLME_MAINTENANCE = val;
      assert.equal(isOfferwallMeMaintenance(), true, `expected true for ${val}`);
    }

    for (const val of ["false", "0", "no", "off", "FALSE", "", "random"]) {
      process.env.OFFERWALLME_MAINTENANCE = val;
      assert.equal(isOfferwallMeMaintenance(), false, `expected false for ${val}`);
    }
  } finally {
    if (orig !== undefined) process.env.OFFERWALLME_MAINTENANCE = orig;
    else delete process.env.OFFERWALLME_MAINTENANCE;
  }
});

test("Maintenance ON: /link and /embed are blocked with 503 and code OFFERWALL_MAINTENANCE", async () => {
  const origMaint = process.env.OFFERWALLME_MAINTENANCE;
  try {
    process.env.OFFERWALLME_MAINTENANCE = "true";

    const req = {
      headers: {},
      query: {},
      session: { userId: 42 },
      user: { id: 42 },
    };

    // Test /link
    const linkRes = createMockRes();
    await getOfferwallMeLink(req, linkRes);
    assert.equal(linkRes.getStatusCode(), 503);
    assert.equal(linkRes.getJson()?.ok, false);
    assert.equal(linkRes.getJson()?.code, "OFFERWALL_MAINTENANCE");

    // Test /embed
    const embedRes = createMockRes();
    await getOfferwallMeEmbed(req, embedRes);
    assert.equal(embedRes.getStatusCode(), 503);
    assert.equal(embedRes.getJson()?.ok, false);
    assert.equal(embedRes.getJson()?.code, "OFFERWALL_MAINTENANCE");
  } finally {
    if (origMaint !== undefined) process.env.OFFERWALLME_MAINTENANCE = origMaint;
    else delete process.env.OFFERWALLME_MAINTENANCE;
  }
});

test("Maintenance ON: /status returns maintenance: true", async () => {
  const origMaint = process.env.OFFERWALLME_MAINTENANCE;
  try {
    process.env.OFFERWALLME_MAINTENANCE = "true";

    const req = {};
    const res = createMockRes();
    await getOfferwallMeStatus(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(res.getJson()?.ok, true);
    assert.equal(res.getJson()?.provider, "offerwallme");
    assert.equal(res.getJson()?.maintenance, true);
  } finally {
    if (origMaint !== undefined) process.env.OFFERWALLME_MAINTENANCE = origMaint;
    else delete process.env.OFFERWALLME_MAINTENANCE;
  }
});

test("CRITICAL INVARIANT: Postback CONTINUES crediting normally when OFFERWALLME_MAINTENANCE is active", async () => {
  const origMaint = process.env.OFFERWALLME_MAINTENANCE;
  let testUser = null;
  const uniqueTransId = `tx-maint-test-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

  try {
    // 1. Actively set maintenance flag to TRUE
    process.env.OFFERWALLME_MAINTENANCE = "true";
    assert.equal(isOfferwallMeMaintenance(), true, "Maintenance MUST be active for this test");

    // 2. Create test user in DB with 0 initial balance
    const uniqueEmail = `test_maint_${Date.now()}_${crypto.randomInt(100, 999)}@blockminer.test`;
    testUser = await prisma.user.create({
      data: {
        name: "Offerwall Maintenance User",
        email: uniqueEmail,
        username: `ow_maint_${Date.now() % 100000}`,
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        blkBalance: 0,
      },
    });
    assert.ok(testUser?.id > 0, "Test user must be created in PostgreSQL");

    // 3. Prepare signed postback payload
    const reward = "10";
    const payout = "0.05";
    const signature = generateSignature(String(testUser.id), uniqueTransId, reward);

    const postbackReq = {
      method: "POST",
      headers: { "cf-connecting-ip": "127.0.0.1" },
      body: {
        subId: String(testUser.id),
        transId: uniqueTransId,
        reward,
        payout,
        offer_name: "Test Survey While Maintenance Active",
        offer_type: "Survey",
        status: 1,
        debug: "0",
        signature,
      },
    };
    const postbackRes = createMockRes();

    // 4. Execute postback over controller
    await offerwallMePostback(postbackReq, postbackRes);

    // 5. Assert HTTP response is 200 "ok"
    assert.equal(postbackRes.getStatusCode(), 200);
    assert.equal(postbackRes.getText(), "ok");

    // 6. Assert DATABASE state: user's blkBalance was actually incremented by 0.0005 BLK!
    const userAfter = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { blkBalance: true },
    });
    assert.ok(userAfter, "User must exist in DB");
    assert.equal(
      Number(userAfter.blkBalance),
      0.0005,
      "User balance MUST be credited by 0.0005 BLK even when maintenance is active",
    );

    // 7. Assert audit callback record exists in DB
    const callbackRecord = await prisma.offerwallMeCallback.findUnique({
      where: { transId: uniqueTransId },
    });
    assert.ok(callbackRecord, "Callback record must be saved in database");
    assert.equal(callbackRecord.userId, testUser.id);
    assert.equal(callbackRecord.status, 1);
    assert.equal(Number(callbackRecord.polCredited), 0.0005);
  } finally {
    // Cleanup created test records
    if (uniqueTransId) {
      await prisma.offerwallMeCallback.deleteMany({ where: { transId: uniqueTransId } }).catch(() => {});
    }
    if (testUser?.id) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    if (origMaint !== undefined) process.env.OFFERWALLME_MAINTENANCE = origMaint;
    else delete process.env.OFFERWALLME_MAINTENANCE;
  }
});
