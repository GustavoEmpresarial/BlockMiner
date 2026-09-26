import { Prisma } from "@prisma/client";
import prisma from "../../../core/database/prisma.js";

export const WITHDRAWAL_FEE_PERCENT = 2.5;
/** Offerwall/ad completions required in a day to waive the withdrawal fee. */
export const WITHDRAWAL_FEE_WAIVER_REQUIRED = 10;

/** Counts all offerwall/ad completions today (UTC) — used for withdrawal fee waiver.
 *  Includes: offerwall.me credits + zerads PTC ads viewed + internal offerwall (iframe) completions.
 *  Zerads batches multiple ad clicks per callback (1 row can represent 1..N ads viewed),
 *  so we SUM the `clicks` column instead of counting rows. Other providers are 1:1. */
export async function countTodayOfferwallCompletions(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [offerwallMe, internalOw, zeradsAgg] = await Promise.all([
    prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfDay } } }),
    prisma.internalOfferwallAttempt.count({ where: { userId, status: "COMPLETED", completedAt: { gte: startOfDay } } }),
    prisma.zeradsCallback.aggregate({ where: { userId, callbackAt: { gte: startOfDay } }, _sum: { clicks: true } }),
  ]);
  const zeradsClicks = Number(zeradsAgg._sum?.clicks ?? 0);
  return offerwallMe + internalOw + zeradsClicks;
}

/** True if the user already submitted a withdrawal today (UTC) that got charged a non-zero fee. */
export async function hasFeeChargedWithdrawalToday(userId: number): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const charged = await prisma.transaction.findFirst({
    where: { userId, type: "withdrawal", createdAt: { gte: startOfDay }, fee: { gt: 0 } },
    select: { id: true },
  });
  return charged != null;
}

export async function findPendingWithdrawal(userId: number) {
  return prisma.transaction.findFirst({
    where: { userId, type: "withdrawal", status: { in: ["pending", "approved"] } },
  });
}

export async function findPendingShibWithdrawal(userId: number) {
  return prisma.transaction.findFirst({
    where: { userId, type: "shib_withdrawal", status: { in: ["pending", "approved"] } },
  });
}

/** Amount + fee that were reserved when the withdrawal row was created. */
function reservedRefundTotal(row: { amount: Prisma.Decimal; fee: Prisma.Decimal | null }): Prisma.Decimal {
  const fee = row.fee != null ? new Prisma.Decimal(row.fee) : new Prisma.Decimal(0);
  return new Prisma.Decimal(row.amount).plus(fee);
}

/**
 * Reserves funds and creates the withdrawal request atomically — the financial
 * invariant from legacy walletModel.createWithdrawal: balance check + decrement +
 * transaction row creation all happen inside one `$transaction`.
 */
export async function createWithdrawal(
  userId: number,
  amountPol: Prisma.Decimal,
  address: string,
  feeAmount: Prisma.Decimal,
) {
  // item 87: soma em Decimal, não Number — ver withdrawal.service.ts header.
  const totalDeduct = amountPol.plus(feeAmount);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { userId, type: "withdrawal", status: { in: ["pending", "approved"] } },
    });
    if (existing) throw new Error("Pending withdrawal exists");

    const user = await tx.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
    if (!user) throw new Error("User not found");
    if (new Prisma.Decimal(user.polBalance).lessThan(totalDeduct)) throw new Error("Insufficient balance");

    await tx.user.update({ where: { id: userId }, data: { polBalance: { decrement: totalDeduct } } });
    return tx.transaction.create({
      data: {
        userId,
        type: "withdrawal",
        amount: amountPol,
        fee: feeAmount,
        address,
        status: "approved",
        fundsReserved: true,
      },
    });
  });
}

/**
 * SHIB ERC20 withdraw — reserves `netAmount + fee` from `shibBalance`, stores net as `amount`.
 * Mirrors legacy `executeShibWithdrawal`.
 */
export async function createShibWithdrawal(
  userId: number,
  netAmount: Prisma.Decimal,
  address: string,
  feeAmount: Prisma.Decimal,
) {
  const totalDeduct = netAmount.plus(feeAmount);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { userId, type: "shib_withdrawal", status: { in: ["pending", "approved"] } },
    });
    if (existing) throw new Error("Pending withdrawal exists");

    const user = await tx.user.findUnique({ where: { id: userId }, select: { shibBalance: true } });
    if (!user) throw new Error("User not found");
    if (new Prisma.Decimal(user.shibBalance).lessThan(totalDeduct)) throw new Error("Insufficient balance");

    await tx.user.update({ where: { id: userId }, data: { shibBalance: { decrement: totalDeduct } } });
    return tx.transaction.create({
      data: {
        userId,
        type: "shib_withdrawal",
        amount: netAmount,
        fee: feeAmount,
        address,
        status: "approved",
        fundsReserved: true,
      },
    });
  });
}

/**
 * Admin withdrawal queue — pending/approved/processing rows first (needs review), plus the
 * most recent completed/failed/rejected rows for visibility (was pending-only, no user
 * relation, no txHash — admin saw only "#userId" with no name/email/hash. Fix: joins `user`
 * (name/username/email) and returns `txHash` so the admin panel can show who requested what
 * and link the real on-chain proof of an already-sent withdrawal).
 */
export async function getWithdrawalsForAdmin() {
  const [active, recent] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        type: { in: ["withdrawal", "shib_withdrawal"] },
        status: { in: ["pending", "approved", "processing"] },
      },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, username: true, email: true } } },
    }),
    prisma.transaction.findMany({
      where: {
        type: { in: ["withdrawal", "shib_withdrawal"] },
        status: { in: ["completed", "failed", "rejected"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true, username: true, email: true } } },
    }),
  ]);
  return [...active, ...recent];
}

export async function findWithdrawalById(id: number) {
  return prisma.transaction.findUnique({ where: { id } });
}

/**
 * Atomic admin transitions — same `updateMany` + status-guard pattern as
 * `claimWithdrawalForSend`/`releaseWithdrawalClaim` below, applied to the admin
 * approve/reject/complete actions. Previously these did a plain `update` after a
 * separate read-and-check in the controller, which is a classic read-then-write
 * race: two concurrent admin clicks (e.g. approve + reject fired near-simultaneously)
 * could both pass their precondition check before either write landed. Returning
 * `false` on a lost race lets the controller answer 409 instead of silently
 * reporting success for an action that didn't actually apply.
 */
export async function markWithdrawalApproved(id: number): Promise<boolean> {
  const result = await prisma.transaction.updateMany({
    where: { id, status: "pending" },
    data: { status: "approved", updatedAt: new Date() },
  });
  return result.count === 1;
}

/**
 * Admin-initiated rejection. Distinct from `markAutoSendFailed` below: a human
 * rejected the request (status "rejected"), vs. the auto-send engine failing to
 * broadcast it (status "failed") — the admin UI shows these as different outcomes.
 * Rejecting refunds the reserved balance — legacy invariant, done atomically. The
 * status transition itself is guarded the same way as `markWithdrawalApproved`;
 * only the winner of that guard ever reads/refunds `fundsReserved`, so a second,
 * losing caller can't double-refund.
 */
export async function markWithdrawalRejected(id: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.transaction.updateMany({
      where: { id, status: { in: ["pending", "approved"] } },
      data: { status: "rejected", updatedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    const row = await tx.transaction.findUniqueOrThrow({ where: { id } });
    if (row.fundsReserved) {
      const refund = reservedRefundTotal(row);
      if (row.type === "shib_withdrawal") {
        await tx.user.update({ where: { id: row.userId }, data: { shibBalance: { increment: refund } } });
      } else {
        await tx.user.update({ where: { id: row.userId }, data: { polBalance: { increment: refund } } });
      }
      await tx.transaction.update({ where: { id }, data: { fundsReserved: false } });
    }
    return true;
  });
}

/** Returns the updated row on success, or `null` if the atomic guard lost the race
 *  (someone else already transitioned this withdrawal away from pending/approved). */
export async function markWithdrawalCompleted(id: number, txHash: string) {
  const result = await prisma.transaction.updateMany({
    where: { id, status: { in: ["pending", "approved"] } },
    data: { status: "completed", txHash, completedAt: new Date() },
  });
  if (result.count !== 1) return null;
  return prisma.transaction.findUniqueOrThrow({ where: { id } });
}

// --- Auto-send engine (ported from legacy withdrawalsCron.ts / walletModel.ts) ---

/** Withdrawals already `approved` by an admin and eligible for the auto-send tick. */
export async function getApprovedWithdrawalsForAutoSend() {
  return prisma.transaction.findMany({
    where: { type: { in: ["withdrawal", "shib_withdrawal"] }, status: "approved" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, username: true, autoMiningLastHeartbeatAt: true } } },
  });
}

/**
 * Atomic claim: flips `approved` → `processing` conditioned on the row still being
 * `approved`. This is the DB-level replacement for legacy's Redis-backed per-row claim —
 * `updateMany` with a `status: "approved"` guard is atomic at the Postgres row level, so two
 * concurrent tick runs can never both claim the same withdrawal for broadcast.
 *
 * A distributed `AUTO_SEND_LOCK_KEY` Redis lock now also runs on top of this at the tick
 * level (see withdrawal.auto-send.ts) when REDIS_URL is configured, restoring legacy's
 * multi-container guarantee; it falls back to a single-process lock when Redis is absent.
 */
export async function claimWithdrawalForSend(id: number): Promise<boolean> {
  const result = await prisma.transaction.updateMany({
    where: { id, status: "approved" },
    data: { status: "processing", updatedAt: new Date() },
  });
  return result.count === 1;
}

/** Returns a claimed (processing) withdrawal back to `approved` — used when send is provably not broadcast. */
export async function releaseWithdrawalClaim(id: number): Promise<void> {
  await prisma.transaction.updateMany({
    where: { id, status: "processing" },
    data: { status: "approved", updatedAt: new Date() },
  });
}

/** Marks a claimed withdrawal as sent successfully (hot-wallet or CoinEx). */
export async function markAutoSendCompleted(id: number, status: "completed" | "processing", txHash: string | null) {
  return prisma.transaction.update({
    where: { id },
    data: {
      status,
      txHash,
      completedAt: status === "completed" ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });
}

/**
 * Marks a claimed withdrawal as failed (e.g. CoinEx cancellation) and refunds the reserved
 * balance atomically — same invariant as `markWithdrawalRejected`. Guarded by `fundsReserved`
 * so a retried/duplicated cancel callback can never refund the same withdrawal twice.
 */
export async function markAutoSendFailed(id: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.transaction.findUnique({ where: { id } });
    if (!row) throw new Error("Withdrawal not found");
    if (row.fundsReserved) {
      const refund = reservedRefundTotal(row);
      if (row.type === "shib_withdrawal") {
        await tx.user.update({ where: { id: row.userId }, data: { shibBalance: { increment: refund } } });
      } else {
        await tx.user.update({ where: { id: row.userId }, data: { polBalance: { increment: refund } } });
      }
    }
    return tx.transaction.update({ where: { id }, data: { status: "failed", fundsReserved: false, updatedAt: new Date() } });
  });
}

/**
 * Per-user daily cap counter. `current/` has no dedicated "auto-sent" marker column, so this
 * conservatively counts ALL completed withdrawals (auto or admin-manual) for the user today —
 * safer to over-count against the cap than to under-count and risk exceeding it.
 */
/** Withdrawals sent via CoinEx (marker `coinex:<id>` in txHash), still `processing`. */
export async function getProcessingCoinExWithdrawals() {
  return prisma.transaction.findMany({
    where: { type: { in: ["withdrawal", "shib_withdrawal"] }, status: "processing", txHash: { startsWith: "coinex:" } },
    orderBy: { createdAt: "asc" },
  });
}

export async function countAutoSentToday(userId: number): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  return prisma.transaction.count({
    where: {
      userId,
      type: { in: ["withdrawal", "shib_withdrawal"] },
      status: "completed",
      completedAt: { gte: startOfDayUtc },
    },
  });
}
