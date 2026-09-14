/**
 * Smoke: payDailyTax twice in the same period (one debit, second ALREADY_PAID)
 * and HTTP replay of POST /pay-daily with the same Idempotency-Key.
 * Requires DATABASE_URL. Skips when tax is not started.
 */
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

function fakeRes() {
  const calls = { status: null, json: null };
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

test("payDailyTax twice: first debit, second ALREADY_PAID; HTTP replay returns first JSON", {
  skip: !hasDb && "DATABASE_URL not set",
}, async (t) => {
  let prisma;
  try {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    t.skip(`Prisma unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const energyTaxService = await import("../../server/modules/energy-tax/energy-tax.service.ts");
  const { EnergyTaxAlreadyPaid, EnergyTaxNotStarted, EnergyTaxNoRewards } = await import(
    "../../server/modules/energy-tax/energy-tax.errors.ts"
  );
  const { requireCriticalIdempotency } = await import("../../server/core/http/middleware/idempotency.ts");
  const { postPayDaily } = await import("../../server/modules/energy-tax/energy-tax.controller.ts");
  const { lastClosedMiningPeriodStart } = energyTaxService;

  const createdUserIds = [];

  t.after(async () => {
    for (const userId of createdUserIds) {
      await prisma.energyTaxCharge.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.transaction.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.moneyRainCallback.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.callbackQueue.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  const now = new Date();
  if (!energyTaxService.isEnergyTaxActive(now)) {
    t.skip("energy tax not started");
    return;
  }

  async function makeTaxableUser() {
    const tag = `etax-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x",
        polBalance: 100,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    const taxedDay = lastClosedMiningPeriodStart(now);
    await prisma.moneyRainCallback.create({
      data: {
        userId: user.id,
        viewId: `etax-${user.id}-${Date.now()}`,
        rewardUsdt: 1,
        polCredited: 70,
        polPrice: 1,
        createdAt: new Date(taxedDay.getTime() + 12 * 60 * 60 * 1000),
      },
    });
    return user.id;
  }

  const serviceUserId = await makeTaxableUser();
  let firstCharge;
  try {
    firstCharge = await energyTaxService.payDailyTax(serviceUserId, "POL", now);
  } catch (err) {
    if (err instanceof EnergyTaxNotStarted || err instanceof EnergyTaxNoRewards) {
      t.skip(err instanceof EnergyTaxNotStarted ? "energy tax not started" : "no taxable rewards for yesterday");
      return;
    }
    throw err;
  }
  assert.ok(firstCharge);
  assert.equal(firstCharge.status, "paid");

  const afterFirst = await prisma.user.findUniqueOrThrow({
    where: { id: serviceUserId },
    select: { polBalance: true },
  });
  assert.ok(Number(afterFirst.polBalance) < 100, "first pay must debit POL");

  await assert.rejects(() => energyTaxService.payDailyTax(serviceUserId, "POL", now), EnergyTaxAlreadyPaid);

  const afterSecond = await prisma.user.findUniqueOrThrow({
    where: { id: serviceUserId },
    select: { polBalance: true },
  });
  assert.equal(Number(afterSecond.polBalance), Number(afterFirst.polBalance), "second pay must not debit again");
  const serviceCharges = await prisma.energyTaxCharge.findMany({ where: { userId: serviceUserId } });
  assert.equal(serviceCharges.length, 1);

  const httpUserId = await makeTaxableUser();
  const idempotencyKey = `etax-replay-${httpUserId}-${Date.now()}`;
  const middleware = requireCriticalIdempotency({ scope: "energy_tax_pay_daily" });

  function payReq() {
    return {
      user: { id: httpUserId },
      body: { currency: "POL" },
      params: {},
      path: "/energy-tax/pay-daily",
      get(name) {
        return String(name).toLowerCase() === "idempotency-key" ? idempotencyKey : undefined;
      },
    };
  }

  const firstHttp = fakeRes();
  const req1 = payReq();
  let nextCalled = false;
  middleware(req1, firstHttp, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  await postPayDaily(req1, firstHttp);
  assert.equal(firstHttp.calls.json?.ok, true, JSON.stringify(firstHttp.calls.json));
  const firstJson = firstHttp.calls.json;
  const balanceAfterHttp1 = await prisma.user.findUniqueOrThrow({
    where: { id: httpUserId },
    select: { polBalance: true },
  });

  const replayHttp = fakeRes();
  const req2 = payReq();
  middleware(req2, replayHttp, () => {});
  await postPayDaily(req2, replayHttp);
  assert.deepEqual(replayHttp.calls.json, firstJson, "replay must return the first success JSON");
  const balanceAfterReplay = await prisma.user.findUniqueOrThrow({
    where: { id: httpUserId },
    select: { polBalance: true },
  });
  assert.equal(Number(balanceAfterReplay.polBalance), Number(balanceAfterHttp1.polBalance));
});
