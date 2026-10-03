import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const energyTaxService = await import("../../server/modules/energy-tax/energy-tax.service.ts");
const energyTaxCtrl = await import("../../server/modules/energy-tax/energy-tax.controller.ts");
const { parseTaxPayCurrency } = await import("../../server/shared/taxPaymentCurrency.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `etax_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: "Energy Tax Test User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "127.0.0.1",
      ip: "127.0.0.1",
      userAgent: "test-runner/1.0",
      polBalance: "0",
      blkBalance: "0",
      shibBalance: "0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function fakeRes() {
  const calls = { status: 200, json: null };
  return {
    calls,
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
}

test.after(async () => {
  for (const id of createdUserIds) {
    await prisma.energyTaxCharge.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.zeradsCallback.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
});

test("parseTaxPayCurrency — validates allowed currencies and defaults", () => {
  assert.equal(parseTaxPayCurrency("POL"), "POL");
  assert.equal(parseTaxPayCurrency("BLK"), "BLK");
  assert.equal(parseTaxPayCurrency("SHIB"), "SHIB");
  assert.equal(parseTaxPayCurrency(undefined), "POL");
  assert.equal(parseTaxPayCurrency(null), "POL");
  assert.equal(parseTaxPayCurrency("BTC"), "POL"); // Fallback seguro para default POL
});

test("getSummary — returns 401 when request is unauthenticated", async () => {
  const req = {};
  const res = fakeRes();
  await energyTaxCtrl.getSummary(req, res);
  assert.equal(res.calls.status, 401);
});

test("getSummary — returns valid tax summary for authenticated user", async () => {
  const user = await makeUser({ polBalance: "10.0" });
  const req = { user };
  const res = fakeRes();
  await energyTaxCtrl.getSummary(req, res);

  assert.equal(res.calls.status, 200);
  assert.ok(res.calls.json);
  assert.equal(res.calls.json.ok, true);
  assert.equal(typeof res.calls.json.active, "boolean");
  assert.equal(typeof res.calls.json.unpaidDays, "number");
  assert.equal(typeof res.calls.json.todayDailyCharge, "number");
  assert.ok(res.calls.json.todayPayQuotes);
});

test("postPayDaily — rejects unauthenticated request with 401", async () => {
  const req = { body: { currency: "POL" } };
  const res = fakeRes();
  await energyTaxCtrl.postPayDaily(req, res);
  assert.equal(res.calls.status, 401);
});

test("postPayDaily — rejects with NO_REWARDS (400) when user has zero rewards on the taxable day", async () => {
  const user = await makeUser({ polBalance: "50.0" });
  const req = { user, body: { currency: "POL" } };
  const res = fakeRes();
  await energyTaxCtrl.postPayDaily(req, res);

  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "NO_REWARDS");
});

test("postPayDaily — rejects with INSUFFICIENT_BALANCE (400) when user has rewards but balance is 0", async () => {
  const user = await makeUser({ polBalance: "0" });
  const now = new Date();
  const taxedDay = energyTaxService.lastClosedMiningPeriodStart(now);

  // Seed mining rewards for the taxed period
  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 50,
      exchangeRate: 1,
      payoutAmount: 2.0, // 2.0 POL rewards
      clicks: 1,
      callbackHash: `hash_insuf_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  const req = { user, body: { currency: "POL" } };
  const res = fakeRes();
  await energyTaxCtrl.postPayDaily(req, res);

  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "INSUFFICIENT_BALANCE");
  assert.equal(res.calls.json.currency, "POL");
  assert.ok(res.calls.json.required > 0);
});

test("postPayDaily — happy path debits balance and creates charge record, then rejects duplicate payment with ALREADY_PAID (409)", async () => {
  const user = await makeUser({ polBalance: "10.0" });
  const now = new Date();
  const taxedDay = energyTaxService.lastClosedMiningPeriodStart(now);

  // Seed mining rewards for the taxed period
  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 50,
      exchangeRate: 1,
      payoutAmount: 1.0, // 1.0 POL rewards
      clicks: 1,
      callbackHash: `hash_happy_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  const req1 = { user, body: { currency: "POL" } };
  const res1 = fakeRes();
  await energyTaxCtrl.postPayDaily(req1, res1);

  assert.equal(res1.calls.status, 200);
  assert.equal(res1.calls.json.ok, true);
  assert.equal(res1.calls.json.currency, "POL");
  assert.ok(res1.calls.json.charge);

  // Check balance was debited
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(Number(updatedUser.polBalance) < 10.0);

  // Check charge record exists
  const charge = await prisma.energyTaxCharge.findUnique({
    where: {
      userId_periodDayStartsAt: {
        userId: user.id,
        periodDayStartsAt: taxedDay,
      },
    },
  });
  assert.ok(charge);
  assert.equal(charge.mode, "daily");
  assert.equal(charge.status, "paid");

  // Duplicate payment on same day rejects with ALREADY_PAID (409)
  const req2 = { user, body: { currency: "POL" } };
  const res2 = fakeRes();
  await energyTaxCtrl.postPayDaily(req2, res2);

  assert.equal(res2.calls.status, 409);
  assert.equal(res2.calls.json.code, "ALREADY_PAID");
});
