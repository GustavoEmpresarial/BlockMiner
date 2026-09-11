/**
 * Paid streak recovery — fills missed UTC days within configured max gap.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import {
  addDaysToUtcDayKey,
  getUtcDayKey as getCheckinPeriodKey,
  normalizeUtcDayKey,
} from "../../shared/calendar/utcCalendar.js";
import { logger } from "../../core/logger/index.js";
import {
  balancesFromUser,
  buildTaxPayQuotes,
  convertPolFeeToCurrency,
  taxPayBalanceField,
  type TaxPayCurrency,
} from "../../shared/taxPaymentCurrency.js";
import { CHECKIN_PAYMENT_STREAK_RECOVERY, getCheckinRecoveryFeePol, getCheckinRecoveryMaxMissedDays } from "./checkin.config.js";

const log = logger.child("checkin.recovery");

const CHAIN_INTERNAL = 0;

export async function computeRecoveryStatus(userId: number, now = new Date()) {
  const todayKey = getCheckinPeriodKey(now);
  const maxMissed = getCheckinRecoveryMaxMissedDays();
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true, streak: true },
  });
  const confirmedKeys = new Set(
    rows.map((r) => normalizeUtcDayKey(r.checkinDate)).filter((k): k is string => Boolean(k)),
  );
  if (confirmedKeys.has(todayKey)) {
    return { eligible: false as const, reason: "already_checked_in_today" };
  }
  const missedDateKeys: string[] = [];
  let cursor = addDaysToUtcDayKey(todayKey, -1);
  while (!confirmedKeys.has(cursor) && missedDateKeys.length < maxMissed) {
    missedDateKeys.push(cursor);
    cursor = addDaysToUtcDayKey(cursor, -1);
  }
  if (missedDateKeys.length === 0) {
    return { eligible: false as const, reason: "streak_active" };
  }
  if (!confirmedKeys.has(cursor)) {
    return { eligible: false as const, reason: "too_many_missed_days" };
  }

  const anchorRow = rows.find((r) => normalizeUtcDayKey(r.checkinDate) === cursor);
  let lastStreak = Number(anchorRow?.streak ?? 0);
  if (!(Number.isFinite(lastStreak) && lastStreak > 0)) {
    lastStreak = 0;
    let sc = cursor;
    while (confirmedKeys.has(sc)) {
      lastStreak += 1;
      sc = addDaysToUtcDayKey(sc, -1);
    }
  }
  if (lastStreak === 0) {
    return { eligible: false as const, reason: "no_streak" };
  }
  const existing = await prisma.dailyCheckin.findMany({
    where: { userId, checkinDate: { in: missedDateKeys } },
    select: { checkinDate: true },
  });
  if (existing.length > 0) {
    return { eligible: false as const, reason: "already_recovered" };
  }
  const feePol = getCheckinRecoveryFeePol();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, blkBalance: true, shibBalance: true },
  });
  const feeQuotes = await buildTaxPayQuotes(feePol, balancesFromUser(user));
  return {
    eligible: true as const,
    lastStreak,
    missedDays: missedDateKeys.length,
    missedDateKeys,
    feePol,
    feeQuotes,
  };
}

export class RecoveryNotEligibleError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`streak recovery not eligible: ${reason}`);
    this.name = "RecoveryNotEligibleError";
    this.reason = reason;
  }
}

export class RecoveryInsufficientBalanceError extends Error {
  currency: string;
  required: number;
  available: number;
  constructor(currency: string, required: number, available: number) {
    super("insufficient balance for streak recovery");
    this.name = "RecoveryInsufficientBalanceError";
    this.currency = currency;
    this.required = required;
    this.available = available;
  }
}

export async function payStreakRecoveryForUser(userId: number, currency: TaxPayCurrency = "POL") {
  const status = await computeRecoveryStatus(userId);
  if (!status.eligible) {
    log.info("streak_recovery_not_eligible", { userId, reason: status.reason });
    throw new RecoveryNotEligibleError(status.reason);
  }
  const { lastStreak, missedDays, missedDateKeys, feePol } = status;
  const debitAmount = await convertPolFeeToCurrency(feePol, currency);
  const field = taxPayBalanceField(currency);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { polBalance: true, blkBalance: true, shibBalance: true },
    });
    const bal = balancesFromUser(user)[currency];
    if (bal < debitAmount) {
      log.warn("streak_recovery_rejected", {
        userId,
        reason: "INSUFFICIENT_BALANCE",
        bal,
        debitAmount,
        currency,
      });
      throw new RecoveryInsufficientBalanceError(currency, debitAmount, bal);
    }
    await tx.user.update({
      where: { id: userId },
      data: { [field]: { decrement: new Prisma.Decimal(debitAmount.toFixed(8)) } },
    });
    const baseConfirmedAt = new Date();
    for (let i = 0; i < missedDateKeys.length; i++) {
      const dateKey = missedDateKeys[i]!;
      const streakForRow = lastStreak + (missedDays - i);
      const confirmedAt = new Date(baseConfirmedAt.getTime() + (missedDateKeys.length - 1 - i));
      await tx.dailyCheckin.create({
        data: {
          userId,
          checkinDate: dateKey,
          confirmedAt,
          txHash: `streak-recovery-${userId}-${dateKey}`,
          status: "confirmed",
          amount: 0,
          chainId: CHAIN_INTERNAL,
          paymentMethod: CHECKIN_PAYMENT_STREAK_RECOVERY,
          streak: streakForRow,
          usedGrace: false,
          usedFreeze: false,
        },
      });
    }
    await tx.checkinStreakRecovery.create({
      data: { userId, recoveredStreak: lastStreak, missedDays, feePolPaid: feePol },
    });
    return { feePol, feePaid: debitAmount, currency, missedDays, restoredStreak: lastStreak };
  });
  log.info("streak_recovery_paid", { userId, lastStreak, missedDays, feePol, currency, feePaid: debitAmount });
  return result;
}
