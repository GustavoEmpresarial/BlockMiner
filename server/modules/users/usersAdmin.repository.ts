import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { getCachedIpIntelligence } from "../ip-intelligence/index.js";

export class NegativeBalanceError extends Error {
  constructor() {
    super("Saldo final não pode ser negativo.");
    this.name = "NegativeBalanceError";
  }
}

export async function findUserFieldForBalanceAdjust(userId: number, field: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, [field]: true },
  });
}

/**
 * Atomic read-modify-write for admin manual balance adjustments. Two admins editing the same
 * user/field concurrently used to be a plain find+update outside any transaction, so one edit
 * could silently overwrite the other. Serializable isolation makes Postgres abort the loser of
 * a conflicting pair with a serialization failure instead of letting it clobber the winner.
 */
export async function adjustUserBalanceFieldTx(
  userId: number,
  field: string,
  nextValueFromPrev: (prev: number) => number
) {
  return prisma.$transaction(
    async (tx) => {
      const before = (await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, [field]: true },
      })) as Record<string, unknown> | null;
      if (!before) return null;
      const prevValue = Number(before[field] ?? 0);
      const nextValue = nextValueFromPrev(prevValue);
      if (nextValue < 0) throw new NegativeBalanceError();
      await tx.user.update({ where: { id: userId }, data: { [field]: nextValue } });
      return { before, prevValue, nextValue };
    },
    { isolationLevel: "Serializable" }
  );
}

export async function createBalanceAdjustAuditLog(data: {
  userId: number;
  label: string;
  description?: string | null;
  metadata?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: "admin_balance_adjust",
      source: "admin",
      severity: "warn",
      label: data.label,
      description: data.description,
      detailsJson: data.metadata ? JSON.stringify(data.metadata) : null,
    },
  });
}

export async function deleteSecLockCallbacks(userId: number): Promise<number> {
  const { count } = await prisma.callbackQueue.deleteMany({
    where: { callbackType: "SEC_LOCK", userId },
  });
  return count;
}

export async function findUserForPasswordReset(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export interface ListUsersOptions {
  page: number;
  pageSize: number;
  query?: string;
  status?: "all" | "active" | "banned";
  fromDate?: string;
  toDate?: string;
}

export async function listUsers(opts: ListUsersOptions) {
  const { page, pageSize, query, status, fromDate, toDate } = opts;
  const skip = (page - 1) * pageSize;
  const where: Prisma.UserWhereInput = {};

  if (status === "active") {
    where.isBanned = false;
  } else if (status === "banned") {
    where.isBanned = true;
  }

  if (query) {
    const q = query.trim();
    const numId = Number(q);
    if (!Number.isNaN(numId) && Number.isInteger(numId) && numId > 0) {
      where.id = numId;
    } else {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
        { walletAddress: { contains: q, mode: "insensitive" } },
        { refCode: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) where.createdAt.lte = new Date(toDate);
  }

  const [users, total, activeCount, bannedCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        ip: true,
        isBanned: true,
        createdAt: true,
        lastLoginAt: true,
        polBalance: true,
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { isBanned: false } }),
    prisma.user.count({ where: { isBanned: true } }),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
    stats: {
      total: activeCount + bannedCount,
      active: activeCount,
      banned: bannedCount,
    },
  };
}

export async function getUserDetail(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      createdAt: true,
      lastLoginAt: true,
      ip: true,
      registrationIp: true,
      userAgent: true,
      walletAddress: true,
      refCode: true,
      referredBy: true,
      isBanned: true,
      banReason: true,
      bannedAt: true,
      bannedUntil: true,
      bannedByAdminId: true,
      polBalance: true,
      shibBalance: true,
      blkBalance: true,
      blkLocked: true,
      btcBalance: true,
      ethBalance: true,
      usdtBalance: true,
      usdcBalance: true,
      zerBalance: true,
      totalWithdrawn: true,
      miningPayoutMode: true,
      miningAllocationPolBps: true,
      ytSecondsBalance: true,
      autoMiningSecondsBalance: true,
      lastHeartbeatAt: true,
      ytLastHeartbeatAt: true,
      autoMiningLastHeartbeatAt: true,
      referred: {
        select: {
          createdAt: true,
          referrer: { select: { id: true, username: true, name: true, email: true } },
        },
      },
      polygonHdAddress: { select: { address: true, derivationIndex: true, createdAt: true } },
      _count: {
        select: {
          miners: true,
          inventory: true,
          ownedMachines: true,
          referrals: true,
          auditLogs: true,
        },
      },
      miners: {
        orderBy: { slotIndex: "asc" },
        take: 100,
        select: {
          id: true,
          minerId: true,
          slotIndex: true,
          level: true,
          hashRate: true,
          slotSize: true,
          imageUrl: true,
          isActive: true,
          purchasedAt: true,
          ownedMachineId: true,
          miner: { select: { name: true, slug: true } },
        },
      },
      inventory: {
        orderBy: { acquiredAt: "desc" },
        take: 100,
        select: {
          id: true,
          minerId: true,
          minerName: true,
          level: true,
          hashRate: true,
          slotSize: true,
          imageUrl: true,
          acquiredAt: true,
          expiresAt: true,
          ownedMachineId: true,
          miner: { select: { slug: true } },
        },
      },
      ownedMachines: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          location: true,
          minerId: true,
          minerName: true,
          snapshotSlug: true,
          level: true,
          hashRate: true,
          slotSize: true,
          imageUrl: true,
          acquisitionSource: true,
          createdAt: true,
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          label: true,
          description: true,
          source: true,
          severity: true,
          ip: true,
          createdAt: true,
          detailsJson: true,
        },
      },
    },
  });
}

/**
 * Extra profile metrics for the admin user detail view.
 * Cache-only lookup for IP intelligence to guarantee sub-millisecond response without network blocking.
 */
export async function getUserProfileMetrics(userId: number, userIp: string | null | undefined) {
  const [
    activeMachines,
    hashAgg,
    faucet,
    txCount,
    logCount,
    ticketCount,
    depositAgg,
    withdrawalAgg,
    lastIpIntelligence,
  ] = await Promise.all([
    prisma.userMiner.count({ where: { userId, isActive: true } }),
    prisma.userMiner.aggregate({ where: { userId, isActive: true }, _sum: { hashRate: true } }),
    prisma.faucetClaim.findUnique({ where: { userId } }).catch(() => null),
    prisma.transaction.count({ where: { userId } }),
    prisma.auditLog.count({ where: { userId } }),
    prisma.supportMessage.count({ where: { userId } }),
    prisma.transaction.aggregate({ where: { userId, type: "deposit", status: "completed" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: "withdrawal", status: "completed" }, _sum: { amount: true } }),
    userIp ? getCachedIpIntelligence(prisma, userIp, { cacheOnly: true }).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    activeMachines,
    realHashRate: Number(hashAgg._sum.hashRate || 0),
    faucetClaims: faucet?.totalClaims ?? 0,
    totalTransactions: txCount,
    totalLogs: logCount,
    totalTickets: ticketCount,
    totalDeposited: Number(depositAgg._sum.amount || 0),
    totalWithdrawn: Number(withdrawalAgg._sum.amount || 0),
    lastIpIntelligence,
    riskSummary: "Use a aba Relacionados para confirmar sinais antes de agir.",
  };
}

export async function listUserSupportTickets(userId: number) {
  return prisma.supportMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      isRead: true,
      isReplied: true,
      repliedAt: true,
      createdAt: true,
      _count: { select: { replies: true } },
    },
  });
}

function usableSignal(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  return Boolean(normalized && normalized.toLowerCase() !== "unknown");
}

export async function listRelatedUsers(userId: number) {
  const [ipLogs, sessions] = await Promise.all([
    prisma.userIpLog.findMany({
      where: { userId },
      select: { ip: true, deviceFingerprint: true },
      take: 50,
    }),
    prisma.antibotSession.findMany({
      where: { userId },
      select: { ip: true, deviceId: true, fingerprint: true },
      take: 50,
    }),
  ]);

  const ips = new Set<string>();
  const fingerprints = new Set<string>();
  const deviceIds = new Set<string>();

  for (const row of ipLogs) {
    if (usableSignal(row.ip)) ips.add(row.ip!);
    if (usableSignal(row.deviceFingerprint)) fingerprints.add(row.deviceFingerprint!);
  }

  for (const row of sessions) {
    if (usableSignal(row.ip)) ips.add(row.ip!);
    if (usableSignal(row.fingerprint)) fingerprints.add(row.fingerprint!);
    if (usableSignal(row.deviceId)) deviceIds.add(row.deviceId!);
  }

  const [matchingIpLogs, matchingSessions] = await Promise.all([
    ips.size || fingerprints.size
      ? prisma.userIpLog.findMany({
          where: {
            userId: { not: userId },
            OR: [
              ...(ips.size ? [{ ip: { in: [...ips] } }] : []),
              ...(fingerprints.size ? [{ deviceFingerprint: { in: [...fingerprints] } }] : []),
            ],
          },
          select: { userId: true, ip: true, deviceFingerprint: true },
          take: 250,
        })
      : [],
    ips.size || deviceIds.size || fingerprints.size
      ? prisma.antibotSession.findMany({
          where: {
            userId: { not: userId },
            OR: [
              ...(ips.size ? [{ ip: { in: [...ips] } }] : []),
              ...(deviceIds.size ? [{ deviceId: { in: [...deviceIds] } }] : []),
              ...(fingerprints.size ? [{ fingerprint: { in: [...fingerprints] } }] : []),
            ],
          },
          select: { userId: true, ip: true, deviceId: true, fingerprint: true },
          take: 250,
        })
      : [],
  ]);

  const reasonsByUser = new Map<number, Set<string>>();
  const addReason = (relatedUserId: number, reason: string) => {
    const reasons = reasonsByUser.get(relatedUserId) ?? new Set<string>();
    reasons.add(reason);
    reasonsByUser.set(relatedUserId, reasons);
  };

  for (const row of matchingIpLogs) {
    if (row.ip && ips.has(row.ip)) addReason(row.userId, "ip");
    if (row.deviceFingerprint && fingerprints.has(row.deviceFingerprint)) addReason(row.userId, "fingerprint");
  }

  for (const row of matchingSessions) {
    if (row.ip && ips.has(row.ip)) addReason(row.userId, "ip");
    if (row.deviceId && deviceIds.has(row.deviceId)) addReason(row.userId, "device");
    if (row.fingerprint && fingerprints.has(row.fingerprint)) addReason(row.userId, "fingerprint");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...reasonsByUser.keys()] } },
    select: { id: true, username: true, name: true, email: true, isBanned: true, createdAt: true },
    take: 100,
  });

  return users
    .map((user) => ({ ...user, reasons: [...(reasonsByUser.get(user.id) ?? [])] }))
    .sort((a, b) => b.reasons.length - a.reasons.length || b.createdAt.getTime() - a.createdAt.getTime());
}

export async function findGrantableMiner(minerId: number) {
  return prisma.miner.findFirst({
    where: { id: minerId, isActive: true, isArchived: false },
    select: { id: true, name: true, baseHashRate: true, slotSize: true, imageUrl: true, slug: true, price: true },
  });
}

export async function findUserForBan(userId: number) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function setUserBanState(userId: number, data: Prisma.UserUpdateInput) {
  return prisma.user.update({ where: { id: userId }, data });
}
