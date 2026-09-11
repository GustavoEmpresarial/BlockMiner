import prisma from "../../core/database/prisma.js";

/** Prisma interactive transaction client — avoid importing @prisma/client types (generate drift). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const rewardMinerSelect = {
  id: true,
  name: true,
  imageUrl: true,
  baseHashRate: true,
  slotSize: true,
} as const;

export async function adminListEvents() {
  return prisma.burnEvent.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      rewardMiner: { select: rewardMinerSelect },
      _count: { select: { claims: true } },
    },
  });
}

export async function findMinerById(id: number) {
  return prisma.miner.findUnique({ where: { id } });
}

export async function createBurnEvent(data: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate: number;
  claimLimitPerUser: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  rewardMiner: { connect: { id: number } };
}) {
  return prisma.burnEvent.create({ data });
}

export async function updateBurnEvent(id: number, data: Record<string, unknown>) {
  return prisma.burnEvent.update({ where: { id }, data: data as never });
}

export async function softDeleteBurnEvent(id: number) {
  return prisma.burnEvent.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function listClaimsForEvent(eventId: number, skip: number, limit: number) {
  const [claims, total] = await Promise.all([
    prisma.burnClaim.findMany({
      where: { eventId },
      orderBy: { claimedAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.burnClaim.count({ where: { eventId } }),
  ]);
  return { claims, total };
}

export async function listActiveBurnEvents() {
  return prisma.burnEvent.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      rewardMiner: {
        select: { ...rewardMinerSelect, tier: true },
      },
    },
  });
}

export async function groupUserBurnClaimCounts(userId: number, eventIds: number[]) {
  if (eventIds.length === 0) return [];
  return prisma.burnClaim.groupBy({
    by: ["eventId"],
    where: { userId, eventId: { in: eventIds } },
    _count: { id: true },
  });
}

export async function listPendingBurnMachineIds(userId: number): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ owned_machine_ids: unknown }>>`
    SELECT owned_machine_ids
    FROM burn_sessions
    WHERE user_id = ${userId} AND status = 'pending'
  `;
  const ids: number[] = [];
  for (const row of rows) {
    const raw = row.owned_machine_ids;
    const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
    for (const n of arr) {
      const id = Number(n);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
  }
  return ids;
}

export async function listUserBurnableMachines(userId: number) {
  const locked = await listPendingBurnMachineIds(userId);
  return prisma.userOwnedMachine.findMany({
    where: {
      userId,
      location: { in: ["INVENTORY", "RACK"] },
      ...(locked.length ? { id: { notIn: locked } } : {}),
    },
    orderBy: [{ hashRate: "desc" }, { id: "asc" }],
    select: {
      id: true,
      location: true,
      minerName: true,
      hashRate: true,
      slotSize: true,
      imageUrl: true,
      level: true,
    },
  });
}

export async function findBurnEventWithRewardMinerTx(tx: Tx, eventId: number) {
  return tx.burnEvent.findUnique({
    where: { id: eventId },
    include: { rewardMiner: true },
  });
}

export async function countUserBurnClaimsTx(tx: Tx, eventId: number, userId: number) {
  return tx.burnClaim.count({ where: { eventId, userId } });
}

export async function findOwnedMachinesForBurnTx(tx: Tx, ids: number[], userId: number) {
  return tx.userOwnedMachine.findMany({
    where: { id: { in: ids }, userId, location: { in: ["INVENTORY", "RACK"] } },
  });
}

export async function deleteBurnedMachineRowsTx(
  tx: Tx,
  ownedMachineIds: number[],
  userId: number,
) {
  const miners = await tx.userMiner.findMany({
    where: { ownedMachineId: { in: ownedMachineIds } },
    select: { id: true },
  });
  const minerIds = miners.map((m: { id: number }) => m.id);
  if (minerIds.length > 0) {
    await tx.userRack.updateMany({
      where: { userMinerId: { in: minerIds } },
      data: { userMinerId: null, installedAt: null },
    });
    await tx.userRack.updateMany({
      where: { blockedByMinerId: { in: minerIds } },
      data: { blockedByMinerId: null },
    });
  }
  await tx.userMiner.deleteMany({ where: { ownedMachineId: { in: ownedMachineIds } } });
  await tx.userInventory.deleteMany({ where: { ownedMachineId: { in: ownedMachineIds } } });
  await tx.userVault.deleteMany({ where: { ownedMachineId: { in: ownedMachineIds } } });
  await tx.userOwnedMachine.deleteMany({ where: { id: { in: ownedMachineIds }, userId } });
}

export async function incrementBurnEventStockClaimedTx(tx: Tx, eventId: number) {
  await tx.burnEvent.update({
    where: { id: eventId },
    data: { stockClaimed: { increment: 1 } },
  });
}

export async function createBurnClaimTx(tx: Tx, data: Record<string, unknown>) {
  await tx.burnClaim.create({ data });
}

export type BurnSessionRow = {
  id: number;
  event_id: number;
  user_id: number;
  owned_machine_ids: unknown;
  started_at: Date;
  completes_at: Date;
  status: string;
};

export async function cancelPendingBurnSessions(userId: number, eventId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE burn_sessions
    SET status = 'cancelled', updated_at = NOW()
    WHERE user_id = ${userId} AND event_id = ${eventId} AND status = 'pending'
  `;
}

export async function createBurnSession(opts: {
  eventId: number;
  userId: number;
  ownedMachineIds: number[];
  startedAt: Date;
  completesAt: Date;
}): Promise<BurnSessionRow> {
  await cancelPendingBurnSessions(opts.userId, opts.eventId);
  const rows = await prisma.$queryRaw<BurnSessionRow[]>`
    INSERT INTO burn_sessions (event_id, user_id, owned_machine_ids, started_at, completes_at, status, created_at, updated_at)
    VALUES (
      ${opts.eventId},
      ${opts.userId},
      ${JSON.stringify(opts.ownedMachineIds)}::jsonb,
      ${opts.startedAt},
      ${opts.completesAt},
      'pending',
      NOW(),
      NOW()
    )
    RETURNING id, event_id, user_id, owned_machine_ids, started_at, completes_at, status
  `;
  return rows[0]!;
}

export async function findPendingBurnSession(
  sessionId: number,
  userId: number,
  eventId: number,
): Promise<BurnSessionRow | null> {
  const rows = await prisma.$queryRaw<BurnSessionRow[]>`
    SELECT id, event_id, user_id, owned_machine_ids, started_at, completes_at, status
    FROM burn_sessions
    WHERE id = ${sessionId} AND user_id = ${userId} AND event_id = ${eventId} AND status = 'pending'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function completeBurnSession(sessionId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE burn_sessions
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${sessionId} AND status = 'pending'
  `;
}
