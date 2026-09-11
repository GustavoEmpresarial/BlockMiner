/**
 * Ported from legacy energy-tax/energyTaxActivity.service.ts.
 *
 * DECISION: this is folded INTO the energy-tax module as an internal file
 * (not a separate top-level module) — it has no independent HTTP surface,
 * no independent Prisma model, and every consumer (`computeWeekSummary`,
 * `payDailyTax`, the weekly sweep) lives in energy-tax.service.ts. It is a
 * sub-concern (activity/mining-reward aggregation for the tax base), not a
 * distinct domain. Kept as its own file purely for readability — still part
 * of the energy-tax module boundary (not exported from index.ts directly;
 * only the composed summary/charge functions are).
 */
import prisma from "../../core/database/prisma.js";
import { getUtcDayKeyLookupKeys, normalizeUtcDayKey } from "./energy-tax.calendar.js";
import { miningPeriodEndKey } from "./energy-tax.service.js";
import type { ActivityBreakdown, MiningBreakdown } from "./energy-tax.types.js";

export const ACTIVITY_DISCOUNT_THRESHOLD = 10;

const INTERNAL_OFFERWALL_REWARD_POL = "POL";

function periodEnd(periodStart: Date): Date {
  return new Date(periodStart.getTime() + 24 * 3600 * 1000);
}

export async function getActivitiesForPeriod(userId: number, periodStart: Date): Promise<ActivityBreakdown> {
  const dayEnd = periodEnd(periodStart);
  const periodEndKey = miningPeriodEndKey(new Date(periodStart.getTime() + 3600 * 1000));
  const periodKeyAliases = new Set(getUtcDayKeyLookupKeys(periodEndKey));

  const [offerwallInt, offerwallMe, zeradsAgg, shortlink, youtube, games, faucetRecord, moneyRain, multiwall, offerwallGg] =
    await Promise.all([
    prisma.internalOfferwallAttempt.count({
      where: { userId, status: "COMPLETED", completedAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallMeCallback.count({
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.zeradsCallback.aggregate({
      _sum: { clicks: true },
      where: { userId, callbackAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.shortlinkPower.count({ where: { userId, claimedAt: { gte: periodStart, lt: dayEnd } } }),
    prisma.youtubeWatchPower.count({ where: { userId, claimedAt: { gte: periodStart, lt: dayEnd } } }),
    prisma.userPowerGame.count({ where: { userId, playedAt: { gte: periodStart, lt: dayEnd } } }),
    prisma.faucetClaim.findUnique({ where: { userId }, select: { dayKey: true, totalClaims: true } }),
    // item 82: MoneyRain nunca contava pro desconto de atividade nem pra base do imposto —
    // pedido explícito do usuário pra contar igual aos outros provedores de offerwall.
    prisma.moneyRainCallback.count({ where: { userId, createdAt: { gte: periodStart, lt: dayEnd } } }),
    prisma.multiwallCallback.count({
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallGgCallback.count({
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
  ]);

  const zeradsClicks = Number(zeradsAgg._sum.clicks ?? 0);
  const faucet =
    faucetRecord && faucetRecord.dayKey && periodKeyAliases.has(normalizeUtcDayKey(faucetRecord.dayKey))
      ? faucetRecord.totalClaims
      : 0;

  // Multiwall + Offerwall.GG fold into offerwallMe bucket — same external-offerwall activity class.
  const offerwallMeTotal = offerwallMe + multiwall + offerwallGg;
  const total = offerwallInt + offerwallMeTotal + zeradsClicks + faucet + shortlink + youtube + games + moneyRain;

  return {
    offerwallInt,
    offerwallMe: offerwallMeTotal,
    zeradsClicks,
    faucet,
    shortlink,
    youtube,
    games,
    moneyRain,
    total,
    exempt: total >= ACTIVITY_DISCOUNT_THRESHOLD,
  };
}

export async function getMiningRewardsForPeriod(userId: number, periodStart: Date): Promise<MiningBreakdown> {
  const dayEnd = periodEnd(periodStart);

  const [blockMinerAgg, zeradsAgg, offerwallMeAgg, internalAttempts, moneyRainAgg, multiwallAgg, offerwallGgAgg] =
    await Promise.all([
    prisma.blockMinerReward.aggregate({
      _sum: { rewardAmount: true },
      where: { userId, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.zeradsCallback.aggregate({
      _sum: { payoutAmount: true },
      where: { userId, callbackAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallMeCallback.aggregate({
      _sum: { polCredited: true },
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.internalOfferwallAttempt.findMany({
      where: { userId, status: "COMPLETED", completedAt: { gte: periodStart, lt: dayEnd } },
      select: { offer: { select: { rewardKind: true, rewardPolAmount: true } } },
    }),
    // item 82: MoneyRain nunca entrava na base do imposto (used to compute the daily tax
    // charge) — pedido explícito do usuário pra contar igual aos outros provedores.
    prisma.moneyRainCallback.aggregate({
      _sum: { polCredited: true },
      where: { userId, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.multiwallCallback.aggregate({
      _sum: { polCredited: true },
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallGgCallback.aggregate({
      _sum: { polCredited: true },
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
  ]);

  const blockMiner = Number(blockMinerAgg._sum.rewardAmount ?? 0);
  const zerads = Number(zeradsAgg._sum.payoutAmount ?? 0);
  const offerwallMe =
    Number(offerwallMeAgg._sum.polCredited ?? 0) +
    Number(multiwallAgg._sum.polCredited ?? 0) +
    Number(offerwallGgAgg._sum.polCredited ?? 0);
  const offerwallInt = internalAttempts.reduce((sum, a) => {
    const kind = a.offer?.rewardKind;
    const amt = a.offer?.rewardPolAmount;
    if (kind === INTERNAL_OFFERWALL_REWARD_POL && amt) return sum + Number(amt);
    return sum;
  }, 0);
  const moneyRain = Number(moneyRainAgg._sum.polCredited ?? 0);

  const total = blockMiner + zerads + offerwallMe + offerwallInt + moneyRain;
  return { blockMiner, zerads, offerwallMe, offerwallInt, moneyRain, total };
}

/** IDs of users with any POL credit in the window (used by the weekly sweep). */
export async function findUsersWithRewardsInWindow(from: Date, to: Date): Promise<number[]> {
  const [miners, zerads, ofmMe, internal, moneyRain, multiwall, offerwallGg] = await Promise.all([
    prisma.blockMinerReward.groupBy({ by: ["userId"], where: { createdAt: { gte: from, lt: to } } }),
    prisma.zeradsCallback.groupBy({ by: ["userId"], where: { callbackAt: { gte: from, lt: to } } }),
    prisma.offerwallMeCallback.groupBy({ by: ["userId"], where: { status: 1, createdAt: { gte: from, lt: to } } }),
    prisma.internalOfferwallAttempt.groupBy({ by: ["userId"], where: { status: "COMPLETED", completedAt: { gte: from, lt: to } } }),
    // item 82: senão um usuário que só ganhou via MoneyRain na semana ficava fora do
    // sweep semanal de cobrança de imposto.
    prisma.moneyRainCallback.groupBy({ by: ["userId"], where: { createdAt: { gte: from, lt: to } } }),
    prisma.multiwallCallback.groupBy({ by: ["userId"], where: { status: 1, createdAt: { gte: from, lt: to } } }),
    prisma.offerwallGgCallback.groupBy({ by: ["userId"], where: { status: 1, createdAt: { gte: from, lt: to } } }),
  ]);

  const set = new Set<number>();
  for (const r of miners) set.add(r.userId);
  for (const r of zerads) set.add(r.userId);
  for (const r of ofmMe) set.add(r.userId);
  for (const r of internal) set.add(r.userId);
  for (const r of moneyRain) set.add(r.userId);
  for (const r of multiwall) set.add(r.userId);
  for (const r of offerwallGg) set.add(r.userId);
  return Array.from(set);
}
