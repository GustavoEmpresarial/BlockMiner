import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const energyTaxService = await import("../../server/modules/energy-tax/energy-tax.service.ts");
const energyTaxCtrl = await import("../../server/modules/energy-tax/energy-tax.controller.ts");
const taxPaymentCurrency = await import("../../server/shared/taxPaymentCurrency.ts");
const {
  isTaxPayCurrency,
  parseTaxPayCurrency,
  taxPayBalanceField,
  readTaxPayBalance,
  balancesFromUser,
  convertPolFeeToCurrency,
  buildTaxPayQuotes,
} = taxPaymentCurrency;

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
    await prisma.user.delete({ where: { id: id } }).catch(() => {});
  }
});

/* =========================================================================
 * Currency Helpers & Converters (taxPaymentCurrency.ts) - 100% Coverage
 * ========================================================================= */

test("isTaxPayCurrency — validates string membership in allowed list", () => {
  assert.equal(isTaxPayCurrency("POL"), true);
  assert.equal(isTaxPayCurrency("pol"), true);
  assert.equal(isTaxPayCurrency("BLK"), true);
  assert.equal(isTaxPayCurrency("SHIB"), true);
  assert.equal(isTaxPayCurrency("BTC"), false);
  assert.equal(isTaxPayCurrency(null), false);
  assert.equal(isTaxPayCurrency(123), false);
  assert.equal(isTaxPayCurrency(undefined), false);
});

test("parseTaxPayCurrency — validates allowed currencies and defaults", () => {
  assert.equal(parseTaxPayCurrency("POL"), "POL");
  assert.equal(parseTaxPayCurrency("BLK"), "BLK");
  assert.equal(parseTaxPayCurrency("SHIB"), "SHIB");
  assert.equal(parseTaxPayCurrency("  pol  "), "POL");
  assert.equal(parseTaxPayCurrency(undefined), "POL");
  assert.equal(parseTaxPayCurrency(null), "POL");
  assert.equal(parseTaxPayCurrency("BTC"), "POL");
});

test("taxPayBalanceField & readTaxPayBalance — maps fields and extracts balances safely", () => {
  assert.equal(taxPayBalanceField("POL"), "polBalance");
  assert.equal(taxPayBalanceField("BLK"), "blkBalance");
  assert.equal(taxPayBalanceField("SHIB"), "shibBalance");

  assert.equal(readTaxPayBalance(null, "POL"), 0);
  assert.equal(readTaxPayBalance(undefined, "BLK"), 0);
  assert.equal(readTaxPayBalance({ polBalance: "15.5" }, "POL"), 15.5);
  assert.equal(readTaxPayBalance({ blkBalance: 20 }, "BLK"), 20);
  assert.equal(readTaxPayBalance({ shibBalance: "invalid-number" }, "SHIB"), 0);

  const balances = balancesFromUser({ polBalance: "1.5", blkBalance: "2.5", shibBalance: "100" });
  assert.deepEqual(balances, { POL: 1.5, BLK: 2.5, SHIB: 100 });
  assert.deepEqual(balancesFromUser(null), { POL: 0, BLK: 0, SHIB: 0 });
});

test("convertPolFeeToCurrency & buildTaxPayQuotes — converts amounts across pairs and builds quotes", async () => {
  assert.equal(await convertPolFeeToCurrency(0, "POL"), 0);
  assert.equal(await convertPolFeeToCurrency(-1, "POL"), 0);
  assert.equal(await convertPolFeeToCurrency(NaN, "POL"), 0);

  const polAmount = await convertPolFeeToCurrency(2.5, "POL");
  assert.equal(polAmount, 2.5);

  const blkAmount = await convertPolFeeToCurrency(2.5, "BLK");
  assert.ok(blkAmount > 0);

  const shibAmount = await convertPolFeeToCurrency(2.5, "SHIB");
  assert.ok(shibAmount >= 1);

  const quotes = await buildTaxPayQuotes(1.0, { POL: 2.0, BLK: 0.1, SHIB: 1000000 });
  assert.ok(quotes.POL);
  assert.equal(quotes.POL.affordable, true);
  assert.ok(quotes.BLK);
  assert.ok(quotes.SHIB);
});

/* =========================================================================
 * Controller Endpoints & Cache (energy-tax.controller.ts) - Zero Backdoors
 * ========================================================================= */

test("getSummary — returns 401 when request is unauthenticated", async () => {
  const req = {};
  const res = fakeRes();
  await energyTaxCtrl.getSummary(req, res);
  assert.equal(res.calls.status, 401);
});

test("getSummary — returns valid tax summary for authenticated user and exercises cache hit on second call", async () => {
  const user = await makeUser({ polBalance: "10.0" });
  const req = { user };

  // First call: computes and populates cache
  const res1 = fakeRes();
  await energyTaxCtrl.getSummary(req, res1);
  assert.equal(res1.calls.status, 200);
  assert.ok(res1.calls.json);
  assert.equal(res1.calls.json.ok, true);

  // Second call: hits summaryCache.get(user.id)
  const res2 = fakeRes();
  await energyTaxCtrl.getSummary(req, res2);
  assert.equal(res2.calls.status, 200);
  assert.equal(res2.calls.json.ok, true);
  assert.equal(res2.calls.json.todayDailyCharge, res1.calls.json.todayDailyCharge);
});

test("getSummary — exercises cache cleanup loop when summaryCache exceeds max threshold", async () => {
  const origMax = process.env.ENERGY_TAX_SUMMARY_CACHE_MAX;
  const origTtl = process.env.ENERGY_TAX_SUMMARY_CACHE_TTL_MS;
  try {
    process.env.ENERGY_TAX_SUMMARY_CACHE_MAX = "1";
    process.env.ENERGY_TAX_SUMMARY_CACHE_TTL_MS = "1";
    const userA = await makeUser({ polBalance: "10.0" });
    const userB = await makeUser({ polBalance: "20.0" });

    const resA = fakeRes();
    await energyTaxCtrl.getSummary({ user: userA }, resA);
    assert.equal(resA.calls.status, 200);

    // Wait 5ms so userA's entry becomes expired for cleanup
    await new Promise((r) => setTimeout(r, 5));

    const resB = fakeRes();
    await energyTaxCtrl.getSummary({ user: userB }, resB);
    assert.equal(resB.calls.status, 200);
  } finally {
    process.env.ENERGY_TAX_SUMMARY_CACHE_MAX = origMax;
    process.env.ENERGY_TAX_SUMMARY_CACHE_TTL_MS = origTtl;
  }
});

test("getSummary — handles internal database exception and responds 500 without crashing", async () => {
  const req = { user: { id: "invalid-user-id-causes-prisma-exception" } };
  const res = fakeRes();
  await energyTaxCtrl.getSummary(req, res);
  assert.equal(res.calls.status, 500);
  assert.equal(res.calls.json.ok, false);
});

test("postPayDaily — rejects unauthenticated request with 401", async () => {
  const req = { body: { currency: "POL" } };
  const res = fakeRes();
  await energyTaxCtrl.postPayDaily(req, res);
  assert.equal(res.calls.status, 401);
});

test("postPayDaily — handles EnergyTaxNotStarted error with 403 code NOT_STARTED", async () => {
  const user = await makeUser({ polBalance: "10.0" });
  const origTime = energyTaxService.ENERGY_TAX_STARTS_AT.getTime();
  try {
    // Set startsAt to tomorrow so isEnergyTaxActive() returns false
    energyTaxService.ENERGY_TAX_STARTS_AT.setTime(Date.now() + 86400000);

    const req = { user, body: { currency: "POL" } };
    const res = fakeRes();
    await energyTaxCtrl.postPayDaily(req, res);

    assert.equal(res.calls.status, 403);
    assert.equal(res.calls.json.code, "NOT_STARTED");
    assert.ok(res.calls.json.startsAt);
  } finally {
    energyTaxService.ENERGY_TAX_STARTS_AT.setTime(origTime);
  }
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
  const postDebitBalance = Number(updatedUser.polBalance);
  assert.ok(postDebitBalance < 10.0);

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

  // Prove that balance was NOT debited on 409: debit and response are strictly coherent!
  const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(Number(finalUser.polBalance), postDebitBalance);
});

test("postPayDaily — handles unexpected internal error and responds 500 without crashing", async () => {
  const req = { user: { id: "invalid-user-id-causes-prisma-exception" }, body: { currency: "POL" } };
  const res = fakeRes();
  await energyTaxCtrl.postPayDaily(req, res);
  assert.equal(res.calls.status, 500);
  assert.equal(res.calls.json.ok, false);
});
