import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import {
  getUtcDayKey as getCheckinPeriodKey,
  getUtcDayKeyLookupKeys as getCheckinPeriodLookupKeys,
  isSameUtcDay,
  normalizeUtcDayKey,
} from "../../shared/calendar/utcCalendar.js";

type DailyCheckinDb = Pick<typeof prisma, "dailyCheckin">;

export function buildDailyCheckinDayWhere(userId: number, dateOrKey: string | Date = new Date()) {
  const periodEndKey =
    typeof dateOrKey === "string"
      ? normalizeUtcDayKey(dateOrKey) || getCheckinPeriodKey()
      : getCheckinPeriodKey(dateOrKey);
  return {
    userId,
    checkinDate: { in: getCheckinPeriodLookupKeys(periodEndKey) },
  };
}

export async function findDailyCheckinForDay(
  db: DailyCheckinDb,
  userId: number,
  dateOrKey: string | Date = new Date(),
) {
  return db.dailyCheckin.findFirst({
    where: buildDailyCheckinDayWhere(userId, dateOrKey),
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
}

export async function writeDailyCheckinForDay(
  tx: TxClient,
  userId: number,
  normalizedDateKey: string,
  existingRow: { id: number } | null | undefined,
  data: Record<string, unknown>,
) {
  const normalized = normalizeUtcDayKey(normalizedDateKey);
  if (!normalized) {
    throw new Error(`Invalid daily check-in key: ${String(normalizedDateKey)}`);
  }
  if (existingRow?.id) {
    return tx.dailyCheckin.update({
      where: { id: existingRow.id },
      data: { checkinDate: normalized, ...data },
    });
  }
  return tx.dailyCheckin.create({
    data: { userId, checkinDate: normalized, ...data },
  });
}

export async function findConflictingCheckinTxHash(
  db: DailyCheckinDb,
  txHash: string,
  userId: number,
  todayKey: string,
): Promise<"TX_ALREADY_USED" | null> {
  const row = await db.dailyCheckin.findUnique({ where: { txHash } });
  if (!row) return null;
  if (row.userId !== userId) return "TX_ALREADY_USED";
  const day = normalizeUtcDayKey(row.checkinDate);
  if (row.status === "confirmed" && day && !isSameUtcDay(day, todayKey)) {
    return "TX_ALREADY_USED";
  }
  return null;
}

export async function loadRecentHistory(userId: number, take = 21) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      checkinDate: true,
      confirmedAt: true,
      paymentMethod: true,
      usedGrace: true,
      usedFreeze: true,
      streak: true,
    },
  });
  return rows.map((r) => ({
    date: normalizeUtcDayKey(r.checkinDate) || r.checkinDate,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    paymentMethod: r.paymentMethod,
    usedGrace: r.usedGrace,
    usedFreeze: r.usedFreeze,
    streak: r.streak,
  }));
}

export function rowToCadenceSlice(row: {
  status?: string | null;
  txHash?: string | null;
} | null) {
  return {
    checkedIn: row?.status === "confirmed",
    pending: row?.status === "pending",
    failed: row?.status === "failed",
    status: row?.status || null,
    txHash: row?.txHash || null,
  };
}

export async function countGraceUsesInMonth(userId: number, monthKey: string): Promise<number> {
  return prisma.dailyCheckin.count({
    where: { userId, status: "confirmed", usedGrace: true, checkinDate: { startsWith: monthKey } },
  });
}

export async function countFreezeUsesInMonth(userId: number, monthKey: string): Promise<number> {
  return prisma.dailyCheckin.count({
    where: { userId, status: "confirmed", usedFreeze: true, checkinDate: { startsWith: monthKey } },
  });
}

export async function getUserWallet(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true, polBalance: true, isBanned: true },
  });
}

export async function getDailyRowForToday(userId: number) {
  const period = getCheckinPeriodKey();
  return prisma.dailyCheckin.findFirst({
    where: { userId, checkinDate: { in: getCheckinPeriodLookupKeys(period) } },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
}
