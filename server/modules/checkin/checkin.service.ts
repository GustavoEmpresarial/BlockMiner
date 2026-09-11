/**
 * Ported from legacy/server/modules/checkin/checkin.controller.ts (business logic
 * portion) + checkin.finalize.ts + checkin.status.ts, split into a pure service
 * layer per the doctrine (controller stays HTTP-only).
 *
 * DEVIATION (documented, see checkin.repository.ts / checkin.chain.ts headers):
 * Postgres advisory lock (`pg_advisory_xact_lock`) is used inline instead of the
 * legacy `advisoryXactTryLockOrThrow` + `lockUserRowForUpdate` helper pair (not
 * ported into core/database yet) — same effect (serializes concurrent check-ins
 * for one user), narrower interface. `applyUserBalanceDelta` / mining-engine
 * in-memory resync are NOT called (mining module has no equivalent hook yet,
 * same deviation as energy-tax.service.ts) — the Postgres balance write is
 * authoritative.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import {
  addDaysToUtcDayKey,
  getUtcDayKey as getCheckinPeriodKey,
  getUtcPeriodResetAt as getPeriodResetAt,
  isSameUtcDay as isSameCheckinPeriod,
  normalizeUtcDayKey,
} from "../../shared/calendar/utcCalendar.js";
import {
  allowsOffchainCheckin,
  allowsWalletCheckin,
  getBalanceCheckinWei,
  getCheckinGraceHours,
  getCheckinMaxFreezeUsesPerMonth,
  getCheckinMaxGraceUsesPerMonth,
  getCheckinMode,
  getWalletCheckinWei,
  isCheckinPaymentRequired,
  isCheckinStreakFreezeEnabled,
  requiresWalletForOffchainCheckin,
} from "./checkin.config.js";
import {
  assertValidWalletAddress,
  evaluateCheckinPayment,
  getExpectedCheckinChainId,
  getReceiver,
  hasCheckinTreasury,
  normalizeAddr,
  parseOptionalChainIdFromBody,
  resolveCheckinContractAddress,
} from "./checkin.chain.js";
import {
  buildDailyCheckinDayWhere,
  countFreezeUsesInMonth,
  countGraceUsesInMonth,
  findConflictingCheckinTxHash,
  findDailyCheckinForDay,
  getDailyRowForToday,
  loadRecentHistory,
  rowToCadenceSlice,
  writeDailyCheckinForDay,
} from "./checkin.repository.js";
import { computeCheckinStreak, computeStreakAfterCheckin } from "./checkin.streak.js";
import { buildMilestoneStatusForUser, buildUpcomingMilestones } from "./checkin.milestones.js";
import { fireCheckinSideEffects } from "./checkin.notifications.js";
import { CheckinHttpError } from "./checkin.errors.js";

const log = logger.child("checkin.service");

export const CHAIN_INTERNAL_CHECKIN = 0;

/** Deterministic placeholder tx hash for balance check-ins (satisfies unique `tx_hash`). */
export function balanceCheckinSyntheticTxHash(userId: number, checkinDate: string): string {
  const h = createHash("sha256").update(`bm:v2:daily-checkin:balance|${userId}|${checkinDate}`, "utf8").digest("hex");
  return `0x${h}`;
}

function polDecimalFromWei(wei: bigint): Prisma.Decimal {
  return new Prisma.Decimal(wei.toString()).div(new Prisma.Decimal("1000000000000000000"));
}

async function advisoryLock(tx: TxClient, key: string): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
}

async function resolveStreakFlags(userId: number, periodKey: string) {
  return computeStreakAfterCheckin(
    { userId, periodKey },
    {
      countGraceUsesInMonth,
      countFreezeUsesInMonth,
      maxGracePerMonth: getCheckinMaxGraceUsesPerMonth(),
      maxFreezePerMonth: getCheckinMaxFreezeUsesPerMonth(),
      freezeEnabled: isCheckinStreakFreezeEnabled(),
      graceHours: getCheckinGraceHours(),
    },
  );
}

/** Confirms or fails a pending row using on-chain data (stubbed — see checkin.chain.ts). */
export async function tryFinalizeCheckinRow(row: {
  id: number;
  userId: number;
  status: string;
  checkinDate: string;
  paymentMethod?: string | null;
  txHash: string | null;
  user?: { walletAddress: string | null } | null;
} | null) {
  if (!row || row.status !== "pending") return row;
  if (row.paymentMethod === "balance") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  const contractAddr = resolveCheckinContractAddress();
  if (!receiver && !contractAddr) return row;

  const minWei = getWalletCheckinWei();
  const ev = await evaluateCheckinPayment({
    txHash: row.txHash as string,
    userWalletLower: normalizeAddr(wallet),
    receiverLower: normalizeAddr(receiver || contractAddr),
    minValueWei: minWei,
  }).catch(() => null);
  if (!ev) return row;

  if (ev.state === "confirmed") {
    const periodKey = normalizeUtcDayKey(row.checkinDate) || row.checkinDate;
    const streakFlags = await resolveStreakFlags(row.userId, periodKey);
    const updated = await prisma.dailyCheckin.update({
      where: { id: row.id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(minWei) / 1e18,
        chainId: getExpectedCheckinChainId(),
        paymentMethod: "wallet",
        streak: streakFlags.streakAfter,
        usedGrace: streakFlags.usedGrace,
        usedFreeze: streakFlags.usedFreeze,
      },
    });
    await fireCheckinSideEffects(updated.userId, periodKey);
    return updated;
  }

  if (ev.state === "failed") {
    return prisma.dailyCheckin.update({ where: { id: row.id }, data: { status: "failed" } });
  }

  return row;
}

export async function tryFinalizeTodayCheckin(userId: number, walletAddress: string | null | undefined) {
  const row = await getDailyRowForToday(userId);
  if (!row || row.status !== "pending" || !walletAddress) return row;
  return tryFinalizeCheckinRow({ ...row, user: { walletAddress } });
}

export async function processStalePendingCheckins({ batchSize = 40 }: { batchSize?: number } = {}): Promise<void> {
  const since = new Date(Date.now() - 72 * 3600000);
  const pending = await prisma.dailyCheckin.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { walletAddress: true } } },
  });

  for (const row of pending) {
    await tryFinalizeCheckinRow(row).catch((e: unknown) => log.warn("tryFinalizeCheckinRow stale pending", { error: String(e) }));
  }
}

export async function buildCadenceStatusBundle(userId: number, wallet: string | null, treasuryOk: boolean) {
  const todayKey = getCheckinPeriodKey();

  if (treasuryOk) {
    await tryFinalizeTodayCheckin(userId, wallet);
  }

  const dailyRow = await prisma.dailyCheckin.findFirst({
    where: buildDailyCheckinDayWhere(userId, todayKey),
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });

  const resetAt = getPeriodResetAt(todayKey);
  const startsAt = new Date(resetAt.getTime() - 86400000);
  const endsAt = new Date(resetAt.getTime() - 1000);

  const dailySlice = {
    ...rowToCadenceSlice(dailyRow),
    periodKey: todayKey,
    currentPeriod: {
      dateKey: todayKey,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      nextResetAt: resetAt.toISOString(),
      timezone: "UTC",
      resetHour: 0,
    },
  };

  return {
    cadenceStatus: { daily: dailySlice },
    currentPeriod: dailySlice.currentPeriod,
  };
}

export async function getStatusForUser(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true, polBalance: true } });
  const wallet = user?.walletAddress || null;
  const polBalance = user?.polBalance != null ? Number(user.polBalance) : 0;
  const treasuryOk = hasCheckinTreasury();
  const walletWei = getWalletCheckinWei();
  const balanceWei = getBalanceCheckinWei();

  let streak = 0;
  let recentCheckins: Awaited<ReturnType<typeof loadRecentHistory>> = [];
  let totalConfirmed = 0;
  let milestones: Awaited<ReturnType<typeof buildMilestoneStatusForUser>> = [];
  let statusDegraded = false;
  let cadenceStatus: Awaited<ReturnType<typeof buildCadenceStatusBundle>>["cadenceStatus"] | null = null;
  let currentPeriod: Awaited<ReturnType<typeof buildCadenceStatusBundle>>["currentPeriod"] | null = null;

  try {
    const bundle = await buildCadenceStatusBundle(userId, wallet, treasuryOk);
    cadenceStatus = bundle.cadenceStatus;
    currentPeriod = bundle.currentPeriod;

    streak = await computeCheckinStreak(userId, new Date(), getCheckinGraceHours());
    const results = await Promise.all([
      loadRecentHistory(userId, 21),
      prisma.dailyCheckin.count({ where: { userId, status: "confirmed" } }),
      buildMilestoneStatusForUser(userId, streak).catch((err: unknown) => {
        log.warn("checkin getStatus: milestones unavailable", { error: err instanceof Error ? err.message : String(err) });
        return [];
      }),
    ]);
    recentCheckins = results[0];
    totalConfirmed = results[1];
    milestones = results[2];
  } catch (dbErr: unknown) {
    statusDegraded = true;
    log.error("checkin getStatus: daily_checkins / milestones DB error", { error: String(dbErr) });
  }

  const dailyFromBundle = cadenceStatus?.daily;
  const todayCheckedIn = statusDegraded ? false : dailyFromBundle?.checkedIn ?? false;
  const todayPending = statusDegraded ? false : dailyFromBundle?.pending ?? false;
  const missedPeriodEndKey = addDaysToUtcDayKey(getCheckinPeriodKey(), -1);
  const graceEndsAt =
    !statusDegraded && getCheckinGraceHours() > 0 && !todayCheckedIn
      ? new Date(getPeriodResetAt(missedPeriodEndKey).getTime() + getCheckinGraceHours() * 3600000).toISOString()
      : null;

  const lastHistory = statusDegraded ? null : recentCheckins[0] ?? null;
  const lastCheckin =
    lastHistory && lastHistory.date
      ? {
          dateKey: lastHistory.date,
          confirmedAt: lastHistory.confirmedAt ?? null,
          isCurrentPeriod: currentPeriod ? isSameCheckinPeriod(lastHistory.date, currentPeriod.dateKey) : false,
        }
      : null;

  return {
    statusDegraded,
    cadenceStatus: statusDegraded ? null : cadenceStatus,
    currentPeriod: statusDegraded ? null : currentPeriod,
    lastCheckin: statusDegraded ? null : lastCheckin,
    checkedIn: todayCheckedIn,
    todayCheckedIn,
    canCheckin: !todayCheckedIn && !todayPending,
    pending: todayPending,
    failed: statusDegraded ? false : dailyFromBundle?.failed ?? false,
    status: statusDegraded ? null : dailyFromBundle?.status ?? null,
    txHash: statusDegraded ? null : dailyFromBundle?.txHash ?? null,
    streak: statusDegraded ? 0 : streak,
    totalConfirmed: statusDegraded ? 0 : totalConfirmed,
    recentCheckins: statusDegraded ? [] : recentCheckins,
    walletLinked: Boolean(wallet),
    savedWallet: wallet,
    paymentRequired: isCheckinPaymentRequired(),
    checkinMode: getCheckinMode(),
    allowsWalletCheckin: allowsWalletCheckin(),
    allowsOffchainCheckin: allowsOffchainCheckin(),
    nextResetAt: getPeriodResetAt(getCheckinPeriodKey()).toISOString(),
    graceEndsAt,
    checkinReceiver: getReceiver() || null,
    checkinContractAddress: resolveCheckinContractAddress() || null,
    checkinAmountWei: walletWei.toString(),
    checkinBalanceAmountWei: balanceWei.toString(),
    chainId: getExpectedCheckinChainId(),
    checkinChainId: getExpectedCheckinChainId(),
    rpcConfigured: false,
    milestones: statusDegraded ? [] : milestones,
    upcomingMilestones: statusDegraded ? [] : buildUpcomingMilestones(milestones),
    polBalance: statusDegraded ? 0 : polBalance,
  };
}

export async function getRewardsForUser(userId: number) {
  const streak = await computeCheckinStreak(userId, new Date(), getCheckinGraceHours());
  const milestones = await buildMilestoneStatusForUser(userId, streak);
  return { streak, milestones, upcomingMilestones: buildUpcomingMilestones(milestones) };
}

export async function getHistoryForUser(userId: number) {
  return loadRecentHistory(userId, 60);
}

export async function successWithStreak(userId: number, extra: Record<string, unknown> = {}) {
  const streak = await computeCheckinStreak(userId, new Date(), getCheckinGraceHours());
  const recentCheckins = await loadRecentHistory(userId, 21);
  return { streak, recentCheckins, ...extra };
}

type BalanceOutcome = { kind: "already" } | { kind: "ok"; polBalance: number; debit: number };

/** Deduct in-game POL (pool balance) for daily check-in — no on-chain tx required. */
export async function checkinBalanceForUser(userId: number) {
  const today = getCheckinPeriodKey();
  const balanceWei = getBalanceCheckinWei();
  const cost = polDecimalFromWei(balanceWei);
  const synthTx = balanceCheckinSyntheticTxHash(userId, today);

  log.info("checkin_balance_start", { userId, periodKey: today });

  const outcome = await prisma.$transaction(async (tx): Promise<BalanceOutcome> => {
    await advisoryLock(tx, `checkin:${userId}`);

    const user = await tx.user.findUnique({ where: { id: userId }, select: { walletAddress: true, polBalance: true, isBanned: true } });
    if (!user || user.isBanned) {
      log.warn("checkin_balance_rejected", { userId, periodKey: today, reason: "FORBIDDEN" });
      throw new CheckinHttpError("FORBIDDEN", "forbidden");
    }
    if (requiresWalletForOffchainCheckin() && !user.walletAddress?.trim()) {
      log.warn("checkin_balance_rejected", { userId, periodKey: today, reason: "WALLET_REQUIRED" });
      throw new CheckinHttpError("WALLET_REQUIRED", "wallet");
    }

    const existing = await findDailyCheckinForDay(tx, userId, today);
    if (existing?.status === "confirmed") return { kind: "already" };
    if (existing?.status === "pending") {
      log.warn("checkin_balance_rejected", { userId, periodKey: today, reason: "CHECKIN_PENDING_PAYMENT" });
      throw new CheckinHttpError("CHECKIN_PENDING_PAYMENT", "pending");
    }

    const bal = new Prisma.Decimal(user.polBalance != null ? user.polBalance.toString() : "0");
    if (bal.lt(cost)) {
      log.warn("checkin_balance_rejected", { userId, periodKey: today, reason: "INSUFFICIENT_BALANCE" });
      throw new CheckinHttpError("INSUFFICIENT_BALANCE", "balance");
    }

    await tx.user.update({ where: { id: userId }, data: { polBalance: { decrement: cost } } });
    const updatedUser = await tx.user.findUnique({ where: { id: userId }, select: { polBalance: true } });

    const streakFlags = await resolveStreakFlags(userId, today);
    await writeDailyCheckinForDay(tx, userId, today, existing, {
      txHash: synthTx,
      status: "confirmed",
      confirmedAt: new Date(),
      amount: Number(balanceWei) / 1e18,
      chainId: CHAIN_INTERNAL_CHECKIN,
      paymentMethod: "balance",
      streak: streakFlags.streakAfter,
      usedGrace: streakFlags.usedGrace,
      usedFreeze: streakFlags.usedFreeze,
    });

    return { kind: "ok", polBalance: Number(updatedUser?.polBalance ?? 0), debit: Number(cost) };
  });

  if (outcome.kind === "already") {
    log.info("checkin_balance_already_checked_in", { userId, periodKey: today });
    return successWithStreak(userId, { alreadyCheckedIn: true, status: "confirmed", cadence: "daily", paymentMethod: "balance" });
  }

  await fireCheckinSideEffects(userId, today);
  const streakAfter = await computeCheckinStreak(userId, new Date(), getCheckinGraceHours());
  log.info("checkin_balance_confirmed", { userId, periodKey: today, streakAfter });

  return successWithStreak(userId, { status: "confirmed", cadence: "daily", paymentMethod: "balance", polBalance: outcome.polBalance });
}

type ConfirmTxOutcome =
  | { type: "already" }
  | { type: "pending" }
  | { type: "failed"; reason: string }
  | { type: "confirmed" };

export type ConfirmWalletCheckinInput = {
  userId: number;
  txHash: string;
  chainIdFromBody: number | null;
  walletFromBody?: string | null;
};

export type ConfirmWalletCheckinOutcome =
  | { kind: "already" }
  | { kind: "pending" }
  | { kind: "failed"; reason: string }
  | { kind: "confirmed" };

/** On-chain POL daily check-in confirmation. Verification is stubbed — see checkin.chain.ts. */
export async function confirmWalletCheckinForUser(input: ConfirmWalletCheckinInput): Promise<ConfirmWalletCheckinOutcome> {
  const { userId, txHash } = input;
  const today = getCheckinPeriodKey();
  log.info("checkin_wallet_start", { userId, periodKey: today });

  const expectedChainId = getExpectedCheckinChainId();
  if (input.chainIdFromBody !== null && input.chainIdFromBody !== expectedChainId) {
    throw new CheckinHttpError("INVALID_CHAIN", "chain mismatch");
  }

  if (input.walletFromBody) {
    assertValidWalletAddress(input.walletFromBody);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
  const walletAddress = user?.walletAddress?.trim();
  if (!walletAddress) {
    throw new CheckinHttpError("WALLET_REQUIRED", "wallet");
  }

  if (input.walletFromBody && normalizeAddr(input.walletFromBody) !== normalizeAddr(walletAddress)) {
    throw new CheckinHttpError("INVALID_WALLET_ADDRESS", "mismatch");
  }

  const receiver = getReceiver();
  const contractAddr = resolveCheckinContractAddress();
  if (!receiver && !contractAddr) {
    throw new CheckinHttpError("CHECKIN_RECEIVER_NOT_CONFIGURED", "not configured");
  }

  const existingQuick = await findDailyCheckinForDay(prisma, userId, today);
  if (existingQuick?.status === "confirmed") {
    log.info("checkin_wallet_already_checked_in", { userId, periodKey: today });
    return { kind: "already" };
  }

  const txConflict = await findConflictingCheckinTxHash(prisma, txHash, userId, today);
  if (txConflict) {
    throw new CheckinHttpError("TX_ALREADY_USED", "tx already used");
  }

  const minWei = getWalletCheckinWei();
  const evalResult = await evaluateCheckinPayment({
    txHash,
    userWalletLower: normalizeAddr(walletAddress),
    receiverLower: normalizeAddr(receiver || contractAddr),
    minValueWei: minWei,
  });

  const baseRow = { txHash, amount: Number(minWei) / 1e18, chainId: expectedChainId, paymentMethod: "wallet" };

  const outcome = await prisma.$transaction(async (tx): Promise<ConfirmTxOutcome> => {
    await advisoryLock(tx, `checkin:${userId}`);

    const existing = await findDailyCheckinForDay(tx, userId, today);
    if (existing?.status === "confirmed") return { type: "already" };

    if (evalResult.state === "pending") {
      await writeDailyCheckinForDay(tx, userId, today, existing, { ...baseRow, status: "pending", confirmedAt: null });
      return { type: "pending" };
    }

    if (evalResult.state === "failed") {
      await writeDailyCheckinForDay(tx, userId, today, existing, { ...baseRow, status: "failed", confirmedAt: null });
      return { type: "failed", reason: evalResult.reason || "This transaction cannot be used for check-in." };
    }

    const streakFlags = await resolveStreakFlags(userId, today);
    await writeDailyCheckinForDay(tx, userId, today, existing, {
      ...baseRow,
      status: "confirmed",
      confirmedAt: new Date(),
      streak: streakFlags.streakAfter,
      usedGrace: streakFlags.usedGrace,
      usedFreeze: streakFlags.usedFreeze,
    });
    return { type: "confirmed" };
  });

  if (outcome.type === "already") return { kind: "already" };
  if (outcome.type === "pending") return { kind: "pending" };
  if (outcome.type === "failed") return { kind: "failed", reason: outcome.reason };

  await fireCheckinSideEffects(userId, today);
  const streakAfter = await computeCheckinStreak(userId, new Date(), getCheckinGraceHours());
  log.info("checkin_wallet_confirmed", { userId, periodKey: today, streakAfter });
  return { kind: "confirmed" };
}
