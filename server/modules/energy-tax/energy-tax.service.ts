/**
 * Energy Tax — business rules. Ported from legacy energy-tax/energyTax.service.ts.
 * Full spec was legacy docs/rules/ENERGY_TAX.md (not ported — inline comments below
 * summarize the same 3-regime model).
 *
 * Model: 3 regimes (daily 5%, weekly 15%, activity exemption 0%). Rates are always
 * per-day, over that day's mining — never retroactive.
 *
 * DEVIATIONS from legacy (documented, not silently dropped):
 *  - `applyUserBalanceDelta` (in-memory mining-engine balance sync) is NOT called —
 *    server/modules/mining/ does not exist yet in current/ (built by a parallel
 *    agent as of this writing). Whoever wires mining's in-memory engine should call
 *    it after `payDailyTax` / `runWeeklySweep` debits, same as legacy did.
 *  - `economyMetrics.energyTaxPaid()/energyTaxSweep()` (Prometheus counters) are NOT
 *    called — server/shared/observability/ does not exist yet in current/.
 *  - Calendar/period math: UTC 00:00 rollover (shared/calendar/utcCalendar.ts),
 *    explicit product decision by the user replacing the legacy 21h BRT
 *    rollover. energy-tax.calendar.ts is now just a thin re-export of it.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import * as energyTaxRepo from "./energy-tax.repository.js";
import { getUtcDayKey, getUtcPeriodStartAt, addDaysToUtcDayKey, normalizeUtcDayKey } from "../../shared/calendar/utcCalendar.js";
import {
  findUsersWithRewardsInWindow,
  getActivitiesForPeriod,
  getMiningRewardsForPeriod,
  ACTIVITY_DISCOUNT_THRESHOLD,
} from "./energy-tax.activity.js";
import type { EnergyTaxSummary, MiningBreakdown, TodayActivities, WeeklySweepResult } from "./energy-tax.types.js";
import {
  EnergyTaxAlreadyPaid,
  EnergyTaxInsufficientBalance,
  EnergyTaxNoRewards,
  EnergyTaxNotStarted,
} from "./energy-tax.errors.js";
import {
  balancesFromUser,
  buildTaxPayQuotes,
  convertPolFeeToCurrency,
  type TaxPayCurrency,
} from "../../shared/taxPaymentCurrency.js";

export { ACTIVITY_DISCOUNT_THRESHOLD };

/** Rate constants — see legacy TaxesPage spec.
 *  • FULL_WEEK_RATE  = 15% — automatic Monday 21h charge (penalty for letting it accumulate)
 *  • DAILY_WEEK_RATE = 5%  — pay once/day (7 days straight) → big savings
 */
export const FULL_WEEK_RATE = 0.15;
export const DAILY_WEEK_RATE = 0.05;
export const DAILY_PER_DAY_RATE = DAILY_WEEK_RATE / 7;
export const AUTO_PER_DAY_RATE = FULL_WEEK_RATE / 7;

/** Feature flag — energy tax starts 29/06/2026 21:00 BRT. No charge (manual or cron) before this. */
const DEFAULT_STARTS_AT_ISO = "2026-06-30T00:00:00.000Z";
export const ENERGY_TAX_STARTS_AT = new Date(process.env.ENERGY_TAX_STARTS_AT_ISO || DEFAULT_STARTS_AT_ISO);

export function isEnergyTaxActive(now: Date = new Date()): boolean {
  return now.getTime() >= ENERGY_TAX_STARTS_AT.getTime();
}

export function miningPeriodEndKey(date: Date = new Date()): string {
  return getUtcDayKey(date);
}

export function miningPeriodStartFromEndKey(endKey: string): Date {
  return getUtcPeriodStartAt(normalizeUtcDayKey(endKey));
}

export function miningPeriodStart(date: Date = new Date()): Date {
  return miningPeriodStartFromEndKey(miningPeriodEndKey(date));
}

export function lastClosedMiningPeriodStart(now: Date = new Date()): Date {
  const closedEndKey = addDaysToUtcDayKey(miningPeriodEndKey(now), -1);
  return miningPeriodStartFromEndKey(closedEndKey);
}

export function firstTaxableDayStart(): Date {
  return miningPeriodStart(ENERGY_TAX_STARTS_AT);
}

export function isTaxableDay(dayStart: Date): boolean {
  return dayStart.getTime() >= firstTaxableDayStart().getTime();
}

function nextMiningPeriodStart(dayStart: Date): Date {
  const endKey = miningPeriodEndKey(new Date(dayStart.getTime() + 12 * 3600000));
  return miningPeriodStartFromEndKey(addDaysToUtcDayKey(endKey, 1));
}

export function lastSevenUtcDays(now: Date = new Date()): Date[] {
  return lastSevenMiningPeriodStarts(now);
}

export function lastSevenMiningPeriodStarts(now: Date = new Date()): Date[] {
  const currentEndKey = miningPeriodEndKey(now);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const endKey = addDaysToUtcDayKey(currentEndKey, -i);
    days.push(miningPeriodStartFromEndKey(endKey));
  }
  return days;
}

/**
 * Last 7 closed mining days (excludes "today"). Used by the Monday auto sweep so the
 * previous Monday is still inside the window — `lastSevenMiningPeriodStarts` on a Monday
 * would be Tue..Mon and skip last Monday entirely after excluding today.
 */
export function lastSevenClosedMiningPeriodStarts(now: Date = new Date()): Date[] {
  const closedEndKey = addDaysToUtcDayKey(miningPeriodEndKey(now), -1);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const endKey = addDaysToUtcDayKey(closedEndKey, -i);
    days.push(miningPeriodStartFromEndKey(endKey));
  }
  return days;
}

/**
 * Auto (15%) sweep day — Monday UTC, matching the taxes UI countdown to Mon 00:00 UTC.
 * Without this gate the hourly cron charged every closed unpaid day immediately as `auto`.
 */
export function isEnergyTaxAutoSweepDay(now: Date = new Date()): boolean {
  return now.getUTCDay() === 1;
}

export async function countTodayActivities(userId: number, periodStart: Date): Promise<TodayActivities> {
  const a = await getActivitiesForPeriod(userId, periodStart);
  return {
    // item 82: MoneyRain somado no mesmo balde de "offerwall externo" que o OfferwallMe —
    // não criou campo novo no contrato de API/frontend, só passou a contar de verdade.
    offerwallExtCount: a.offerwallMe + a.moneyRain,
    offerwallIntCount: a.offerwallInt,
    zeradsClicksCount: a.zeradsClicks,
    faucetCount: a.faucet,
    shortlinkCount: a.shortlink,
    youtubeCount: a.youtube,
    gamesCount: a.games,
    totalActivities: a.total,
    exempt: a.exempt,
  };
}

export async function computeConsecutiveUnpaidMiningDays(
  userId: number,
  now: Date = new Date(),
): Promise<{ consecutiveUnpaid: number }> {
  const days = lastSevenUtcDays(now);
  const currentPeriodStart = miningPeriodStart(now);

  const charges = await energyTaxRepo.listChargesInWindow(userId, days[0]!, nextMiningPeriodStart(days[6]!));
  const paidKeys = new Set(charges.map((c) => c.periodDayStartsAt.getTime()));

  let consecutiveUnpaid = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const dayStart = days[i]!;
    if (dayStart.getTime() === currentPeriodStart.getTime()) continue;

    const rewards = await rewardsForUtcDay(userId, dayStart);
    if (rewards <= 0) break;
    if (paidKeys.has(dayStart.getTime())) break;

    const act = await countTodayActivities(userId, dayStart);
    if (act.exempt) break;

    consecutiveUnpaid++;
  }

  return { consecutiveUnpaid };
}

export async function rewardsForUtcDay(userId: number, dayStart: Date): Promise<number> {
  const m = await getMiningRewardsForPeriod(userId, dayStart);
  return m.total;
}

export async function miningBreakdownForUtcDay(userId: number, dayStart: Date): Promise<MiningBreakdown> {
  return getMiningRewardsForPeriod(userId, dayStart);
}

export async function computeWeekSummary(userId: number, now: Date = new Date()): Promise<EnergyTaxSummary> {
  const days = lastSevenMiningPeriodStarts(now);
  const weekStart = days[0]!;
  const weekEnd = nextMiningPeriodStart(days[6]!);
  const currentEndKey = miningPeriodEndKey(now);
  const closedEndKey = addDaysToUtcDayKey(currentEndKey, -1);
  const closedStart = lastClosedMiningPeriodStart(now);
  const currentStart = miningPeriodStart(now);

  const existingCharges = await energyTaxRepo.listChargesInWindowFull(userId, weekStart, weekEnd);
  const chargeByDay = new Map<number, (typeof existingCharges)[number]>();
  for (const c of existingCharges) chargeByDay.set(c.periodDayStartsAt.getTime(), c);

  const rewardsByDay = await Promise.all(days.map((d) => rewardsForUtcDay(userId, d)));

  let totalRewards7d = 0;
  let paidPol = 0;
  let paidDays = 0;
  let paidDaysManual = 0;
  let paidDaysAuto = 0;
  let paidDaysExempt = 0;
  for (let i = 0; i < days.length; i++) {
    totalRewards7d += rewardsByDay[i]!;
    const c = chargeByDay.get(days[i]!.getTime());
    if (c) {
      paidPol += Number(c.amount);
      paidDays += 1;
      if (c.mode === "daily") paidDaysManual += 1;
      else if (c.mode === "auto") paidDaysAuto += 1;
      else if (c.mode === "exempt") paidDaysExempt += 1;
    }
  }
  const closedCharge = chargeByDay.get(closedStart.getTime()) ?? null;
  const closedRewards = await rewardsForUtcDay(userId, closedStart);
  const todayRewards = rewardsByDay[6]!;
  const yesterdayRewards = closedRewards;
  const todayDailyCharge = Number((closedRewards * DAILY_PER_DAY_RATE).toFixed(8));

  const [todayAct, todayMining] = await Promise.all([
    countTodayActivities(userId, currentStart),
    getMiningRewardsForPeriod(userId, currentStart),
  ]);

  const { consecutiveUnpaid: unpaidDays } = await computeConsecutiveUnpaidMiningDays(userId, now);

  const periodEndKeys = Array.from({ length: 7 }, (_, i) => addDaysToUtcDayKey(currentEndKey, i - 6));

  const history = await energyTaxRepo.listRecentCharges(userId, 10);

  const userBalances = await energyTaxRepo.findUserBalances(userId);
  const balances = balancesFromUser(userBalances);
  const todayPayQuotes = await buildTaxPayQuotes(todayDailyCharge, balances);

  return {
    startsAt: ENERGY_TAX_STARTS_AT.toISOString(),
    active: isEnergyTaxActive(now),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalRewards7d,
    fullRateTax: Number((totalRewards7d * FULL_WEEK_RATE).toFixed(8)),
    dailyRateTax: Number((totalRewards7d * DAILY_WEEK_RATE).toFixed(8)),
    paidPol,
    paidDays,
    paidDaysManual,
    paidDaysAuto,
    paidDaysExempt,
    unpaidDays,
    todayPaid: !!closedCharge,
    todayRewards,
    yesterdayRewards,
    todayDailyCharge,
    todayPayQuotes,
    balances,
    todayExempt: todayAct.exempt,
    offerwallExtToday: todayAct.offerwallExtCount,
    offerwallIntToday: todayAct.offerwallIntCount,
    zeradsToday: todayAct.zeradsClicksCount,
    faucetToday: todayAct.faucetCount,
    shortlinkToday: todayAct.shortlinkCount,
    youtubeToday: todayAct.youtubeCount,
    gamesToday: todayAct.gamesCount,
    totalActivitiesToday: todayAct.totalActivities,
    todayMiningBreakdown: todayMining,
    resetHour: 0,
    lastClosedPeriodEndKey: closedEndKey,
    currentPeriodEndKey: currentEndKey,
    days: days.map((d, i) => {
      const c = chargeByDay.get(d.getTime());
      return {
        dayStart: d.toISOString(),
        periodEndKey: periodEndKeys[i]!,
        rewards: rewardsByDay[i]!,
        charge: c
          ? {
              id: c.id,
              mode: c.mode,
              amount: Number(c.amount),
              ratePercent: Number(c.ratePercent),
              status: c.status,
              createdAt: c.createdAt.toISOString(),
            }
          : null,
      };
    }),
    history: history.map((c) => ({
      id: c.id,
      mode: c.mode,
      amount: Number(c.amount),
      ratePercent: Number(c.ratePercent),
      rewardsBase: Number(c.rewardsBase),
      status: c.status,
      periodDayStartsAt: c.periodDayStartsAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/**
 * Manual daily payment. Idempotent: 1 charge per (userId, mined-BRT-day).
 * "Pay today" settles the tax on yesterday's mining; periodDayStartsAt = yesterday.
 * `currency` chooses which wallet balance to debit (POL / BLK / SHIB); charge.amount
 * stays POL-denominated for reporting.
 */
export async function payDailyTax(
  userId: number,
  currency: TaxPayCurrency = "POL",
  now: Date = new Date(),
) {
  if (!isEnergyTaxActive(now)) throw new EnergyTaxNotStarted(ENERGY_TAX_STARTS_AT);
  const taxedDay = lastClosedMiningPeriodStart(now);
  const currentPeriodStart = miningPeriodStart(now);

  if (!isTaxableDay(taxedDay)) throw new EnergyTaxNoRewards();

  const existing = await energyTaxRepo.findChargeForDay(userId, taxedDay);
  if (existing) throw new EnergyTaxAlreadyPaid();

  const rewards = await rewardsForUtcDay(userId, taxedDay);
  if (rewards <= 0) throw new EnergyTaxNoRewards();

  const { exempt } = await countTodayActivities(userId, currentPeriodStart);

  if (exempt) {
    const charge = await energyTaxRepo.createExemptCharge({
      userId,
      periodDayStartsAt: taxedDay,
      rewardsBase: new Prisma.Decimal(rewards.toFixed(8)),
      notes: "Isento: 10+ atividades no dia do pagamento",
    });
    await checkAndUpdateEnergyBlock(userId);
    return charge;
  }

  const amountPol = Number((rewards * DAILY_PER_DAY_RATE).toFixed(8));
  const amountPolDec = new Prisma.Decimal(amountPol);
  const debitAmount = await convertPolFeeToCurrency(amountPol, currency);
  const debitDec = new Prisma.Decimal(debitAmount.toFixed(8));

  const result = await prisma.$transaction(async (tx) => {
    const user = await energyTaxRepo.findUserTaxBalancesTx(tx, userId);
    if (!user) throw new Error("User not found");
    const balance = balancesFromUser(user)[currency];
    if (balance < debitAmount) {
      throw new EnergyTaxInsufficientBalance(debitAmount, balance, currency);
    }

    const transaction = await energyTaxRepo.createTaxTransactionTx(tx, userId, debitDec, currency);
    await energyTaxRepo.decrementUserBalanceTx(tx, userId, currency, debitDec);

    const notes =
      currency === "POL"
        ? null
        : `paidCurrency=${currency};debit=${debitAmount};polEquivalent=${amountPol}`;

    const charge = await energyTaxRepo.createChargeTx(tx, {
      userId,
      periodDayStartsAt: taxedDay,
      mode: "daily",
      rewardsBase: new Prisma.Decimal(rewards.toFixed(8)),
      ratePercent: new Prisma.Decimal((DAILY_PER_DAY_RATE * 100).toFixed(4)),
      amount: amountPolDec,
      status: "paid",
      notes,
      transactionId: transaction.id,
    });
    return charge;
  });

  // NOTE: legacy also called applyUserBalanceDelta(userId, -amount) here to sync
  // the in-memory mining engine — see file header, mining/ doesn't exist yet.
  await checkAndUpdateEnergyBlock(userId);
  return result;
}

/** Clears the legacy `energyBlocked` flag if still set. Does not block mining. */
export async function checkAndUpdateEnergyBlock(userId: number): Promise<boolean> {
  const user = await energyTaxRepo.findUserEnergyBlocked(userId);
  if (!user?.energyBlocked) return false;

  await energyTaxRepo.clearUserEnergyBlock(userId);
  return false;
}

/**
 * Weekly closing sweep — Monday 00:00 UTC (UI: “próxima cobrança automática”).
 * For every user who mined in the last 7 closed days, charges days without a manual
 * payment at AUTO_PER_DAY_RATE (2.1429%/day). Days exempted by activity (10+) get a
 * mode="exempt" charge instead of a debit.
 *
 * CRITICAL: must NOT run mid-week. The hourly cron polls often; this function no-ops
 * unless `isEnergyTaxAutoSweepDay(now)` (Monday UTC). Mid-week runs were debiting users
 * at the 15% penalty rate every day — the bug that looked like “cobrando no auto”.
 *
 * Insufficient balance:
 *   - charges what's available → status="partial" (with a note)
 *   - if zero → status="skipped" (no debit, no Transaction created)
 */
export async function runWeeklySweep(now: Date = new Date()): Promise<WeeklySweepResult> {
  if (!isEnergyTaxActive(now)) {
    return { touched: 0, chargesCreated: 0 };
  }
  if (!isEnergyTaxAutoSweepDay(now)) {
    return { touched: 0, chargesCreated: 0 };
  }

  const days = lastSevenClosedMiningPeriodStarts(now);
  const windowStart = days[0]!;
  const windowEnd = nextMiningPeriodStart(days[6]!);
  const firstTaxable = firstTaxableDayStart();

  const userIds = await findUsersWithRewardsInWindow(windowStart, windowEnd);

  let touched = 0;
  let chargesCreated = 0;

  for (const userId of userIds) {
    const existing = await energyTaxRepo.listChargesInWindow(userId, windowStart, windowEnd);
    const paidDayKeys = new Set(existing.map((e) => e.periodDayStartsAt.getTime()));

    for (const dayStart of days) {
      if (dayStart.getTime() < firstTaxable.getTime()) continue;
      if (paidDayKeys.has(dayStart.getTime())) continue;
      const dayRewards = await rewardsForUtcDay(userId, dayStart);
      if (dayRewards <= 0) continue;

      const { exempt } = await countTodayActivities(userId, dayStart);
      if (exempt) {
        try {
          await energyTaxRepo.createExemptCharge({
            userId,
            periodDayStartsAt: dayStart,
            rewardsBase: new Prisma.Decimal(dayRewards.toFixed(8)),
            notes: "Isento: 10+ atividades (offerwall/faucet/shortlink/youtube/jogos) no dia",
          });
          chargesCreated++;
        } catch {
          /* keep sweeping remaining users/days */
        }
        continue;
      }

      const amount = Number((dayRewards * AUTO_PER_DAY_RATE).toFixed(8));
      if (amount <= 0) continue;

      try {
        await prisma.$transaction(async (tx) => {
          const user = await energyTaxRepo.findUserPolBalanceTx(tx, userId);
          if (!user) return 0;
          const balance = Number(user.polBalance);

          let debit = amount;
          let status: "paid" | "partial" | "skipped" = "paid";
          let txId: number | null = null;
          let notes: string | null = null;

          if (balance <= 0) {
            status = "skipped";
            debit = 0;
            notes = "Saldo zero no momento da cobrança";
          } else if (balance < amount) {
            status = "partial";
            debit = balance;
            notes = `Saldo insuficiente: cobrado ${balance} de ${amount}`;
          }

          if (debit > 0) {
            const debitDec = new Prisma.Decimal(debit.toFixed(8));
            const transaction = await energyTaxRepo.createTaxTransactionTx(tx, userId, debitDec);
            txId = transaction.id;
            await energyTaxRepo.decrementUserPolBalanceTx(tx, userId, debitDec);
          }

          await energyTaxRepo.createChargeTx(tx, {
            userId,
            periodDayStartsAt: dayStart,
            mode: "auto",
            rewardsBase: new Prisma.Decimal(dayRewards.toFixed(8)),
            ratePercent: new Prisma.Decimal((AUTO_PER_DAY_RATE * 100).toFixed(4)),
            amount: new Prisma.Decimal(debit.toFixed(8)),
            status,
            notes,
            transactionId: txId,
          });
          return debit;
        });
        chargesCreated++;
      } catch {
        /* keep sweeping remaining users/days */
      }
    }
    await checkAndUpdateEnergyBlock(userId).catch(() => {});
    touched++;
  }

  return { touched, chargesCreated };
}
