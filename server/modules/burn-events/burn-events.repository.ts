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
      if (typeof n === "number" || typeof n === "string") {
        const id = Number(n);
        if (Number.isInteger(id) && id > 0) ids.push(id);
        continue;
      }
      if (n && typeof n === "object" && "id" in n) {
        const id = Number((n as { id: unknown }).id);
        if (Number.isInteger(id) && id > 0) ids.push(id);
      }
    }
  }
  return ids;
}

export async function listUserBurnableMachines(userId: number) {
  const locked = await listPendingBurnMachineIds(userId);
  return prisma.userOwnedMachine.findMany({
    where: {
      userId,
      // Off-rack only: inventory + vault (warehouse). Rack machines stay mining.
      location: { in: ["INVENTORY", "WAREHOUSE"] },
      ...(locked.length ? { id: { notIn: locked } } : {}),
    },
    orderBy: [{ hashRate: "asc" }, { id: "asc" }],
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

export async function findUserBalancesTx(tx: Tx, userId: number) {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      polBalance: true,
      shibBalance: true,
      blkBalance: true,
    },
  });
}

export async function decrementUserFeeBalanceTx(
  tx: Tx,
  userId: number,
  currency: "SHIB" | "POL" | "BLK",
  amount: number,
) {
  const data =
    currency === "SHIB"
      ? { shibBalance: { decrement: amount } }
      : currency === "POL"
        ? { polBalance: { decrement: amount } }
        : { blkBalance: { decrement: amount } };

  return tx.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      polBalance: true,
      shibBalance: true,
      blkBalance: true,
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
    where: { id: { in: ids }, userId, location: { in: ["INVENTORY", "WAREHOUSE"] } },
  });
}

/**
 * Permanently destroy burned machines and all location rows that point at them.
 * Throws if the owned-machine delete count does not match — caller transaction rolls back.
 */
export async function deleteBurnedMachineRowsTx(
  tx: Tx,
  ownedMachineIds: number[],
  userId: number,
): Promise<{ deletedOwned: number }> {
  const ids = Array.from(
    new Set(
      ownedMachineIds
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );
  if (ids.length === 0) return { deletedOwned: 0 };

  const miners = await tx.userMiner.findMany({
    where: { ownedMachineId: { in: ids } },
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
  await tx.userMiner.deleteMany({ where: { ownedMachineId: { in: ids } } });
  await tx.userInventory.deleteMany({ where: { ownedMachineId: { in: ids } } });
  await tx.userVault.deleteMany({ where: { ownedMachineId: { in: ids } } });
  // Orphan sala placements (no Prisma FK to UserOwnedMachine — still clear by id).
  await tx.salaTileMiner.deleteMany({
    where: { userOwnedMachineId: { in: ids }, userId },
  });
  const deleted = await tx.userOwnedMachine.deleteMany({
    where: { id: { in: ids }, userId },
  });
  if (deleted.count !== ids.length) {
    throw Object.assign(
      new Error(
        `Burn destroy incomplete: expected ${ids.length} owned machines removed, got ${deleted.count}`,
      ),
      { code: "BURN_DESTROY_INCOMPLETE" },
    );
  }
  return { deletedOwned: deleted.count };
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

export async function createBurnSessionTx(
  tx: Tx,
  opts: {
    eventId: number;
    userId: number;
    /** Legacy number[] or snapshot objects (preferred — machines already destroyed). */
    ownedMachineIds: unknown[];
    startedAt: Date;
    completesAt: Date;
  },
): Promise<BurnSessionRow> {
  // Do NOT cancel prior pending sessions here. Machines are destroyed on start;
  // cancelling would orphan destroyed machines / fees. Caller must reject BURN_ALREADY_PENDING.
  const rows = await tx.$queryRaw<BurnSessionRow[]>`
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

export async function createBurnSession(opts: {
  eventId: number;
  userId: number;
  ownedMachineIds: unknown[];
  startedAt: Date;
  completesAt: Date;
}): Promise<BurnSessionRow> {
  return prisma.$transaction((tx) => createBurnSessionTx(tx, opts));
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

/** Latest pending session for this user+event (server-side burn clock). */
export async function findPendingBurnSessionForEvent(
  userId: number,
  eventId: number,
): Promise<BurnSessionRow | null> {
  const rows = await prisma.$queryRaw<BurnSessionRow[]>`
    SELECT id, event_id, user_id, owned_machine_ids, started_at, completes_at, status
    FROM burn_sessions
    WHERE user_id = ${userId} AND event_id = ${eventId} AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Same as findPendingBurnSessionForEvent, scoped to an open transaction (after advisory lock). */
export async function findPendingBurnSessionForEventTx(
  tx: Tx,
  userId: number,
  eventId: number,
): Promise<BurnSessionRow | null> {
  const rows = await tx.$queryRaw<BurnSessionRow[]>`
    SELECT id, event_id, user_id, owned_machine_ids, started_at, completes_at, status
    FROM burn_sessions
    WHERE user_id = ${userId} AND event_id = ${eventId} AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** All pending burn sessions for a user (hub badges). */
export async function listPendingBurnSessionsForUser(userId: number): Promise<BurnSessionRow[]> {
  return prisma.$queryRaw<BurnSessionRow[]>`
    SELECT id, event_id, user_id, owned_machine_ids, started_at, completes_at, status
    FROM burn_sessions
    WHERE user_id = ${userId} AND status = 'pending'
    ORDER BY id DESC
  `;
}

export async function completeBurnSession(sessionId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE burn_sessions
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${sessionId} AND status = 'pending'
  `;
}
