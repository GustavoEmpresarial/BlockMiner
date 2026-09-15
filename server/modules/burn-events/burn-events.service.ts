/**
 * Burn events service — start destroys selected machines + charges fee; claim after
 * completesAt delivers the reward to the inbox (BURN_PROCESS_DURATION_SECONDS).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { createRewardInboxEntry } from "../notifications/index.js";
import { miningEngine, syncUserBaseHashRate } from "../mining/index.js";
import { BURN_EVENTS_ERROR, burnEventsError } from "./burn-events.errors.js";
import { isEventCurrentlyOpen, isEventVisibleOnHub, normalizeMinerIds } from "./burn-events.helpers.js";
import {
  readBurnProcessDurationSeconds,
  isAllowedBurnFeeCurrency,
  getBurnFeeAmount,
  normalizeClaimLimitPerUser,
  normalizeStockTotal,
  readMaxBurnOwnedMachineIds,
} from "./burn-events.config.js";
import * as repo from "./burn-events.repository.js";

const log = logger.child("BurnEventsService");

function isPgUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505" || code === "P2002") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(msg);
}

type BurnedMachineSnapshot = {
  id: number;
  name: string;
  hashRate: number;
  slotSize: number;
  location: string;
};

/** Session payload may be number[] (legacy) or snapshot objects (machines destroyed on start). */
function parseSessionMachineEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseSessionMachineIds(raw: unknown): number[] {
  const ids: number[] = [];
  for (const entry of parseSessionMachineEntries(raw)) {
    if (typeof entry === "number" || typeof entry === "string") {
      const id = Number(entry);
      if (Number.isInteger(id) && id > 0) ids.push(id);
      continue;
    }
    if (entry && typeof entry === "object" && "id" in entry) {
      const id = Number((entry as { id: unknown }).id);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
  }
  return Array.from(new Set(ids));
}

function parseSessionMachineSnapshots(raw: unknown): BurnedMachineSnapshot[] {
  const out: BurnedMachineSnapshot[] = [];
  for (const entry of parseSessionMachineEntries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    out.push({
      id,
      name: String(o.name ?? o.minerName ?? "Machine"),
      hashRate: Number(o.hashRate ?? 0) || 0,
      slotSize: Number(o.slotSize ?? 1) || 1,
      location: String(o.location ?? "INVENTORY"),
    });
  }
  return out;
}

export async function adminListEvents() {
  return repo.adminListEvents();
}

export type AdminEventInput = {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate?: number;
  rewardMinerId?: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
};

export async function adminCreateEvent(data: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
}) {
  if (!data.title || data.title.trim().length === 0) throw new Error("Title is required");
  if (!(data.requiredHashRate > 0)) throw new Error("requiredHashRate must be > 0");
  const miner = await repo.findMinerById(data.rewardMinerId);
  if (!miner) throw new Error("Reward miner not found");
  return repo.createBurnEvent({
    title: data.title.trim(),
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? null,
    requiredHashRate: data.requiredHashRate,
    claimLimitPerUser: normalizeClaimLimitPerUser(data.claimLimitPerUser),
    stockTotal: normalizeStockTotal(data.stockTotal),
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    isActive: data.isActive ?? true,
    rewardMiner: { connect: { id: data.rewardMinerId } },
  });
}

export async function adminUpdateEvent(
  id: number,
  data: {
    title?: string;
    description?: string | null;
    imageUrl?: string | null;
    requiredHashRate?: number;
    rewardMinerId?: number;
    claimLimitPerUser?: number;
    stockTotal?: number | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    isActive?: boolean;
  },
) {
  return repo.updateBurnEvent(id, {
    ...(data.title !== undefined && { title: data.title.trim() }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
    ...(data.requiredHashRate !== undefined && { requiredHashRate: data.requiredHashRate }),
    ...(data.rewardMinerId !== undefined && { rewardMiner: { connect: { id: data.rewardMinerId } } }),
    ...(data.claimLimitPerUser !== undefined && {
      claimLimitPerUser: normalizeClaimLimitPerUser(data.claimLimitPerUser),
    }),
    ...(data.stockTotal !== undefined && { stockTotal: normalizeStockTotal(data.stockTotal) }),
    ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
    ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
  });
}

export async function adminSoftDeleteEvent(id: number) {
  return repo.softDeleteBurnEvent(id);
}

export async function adminListClaims(eventId: number, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const { claims, total } = await repo.listClaimsForEvent(eventId, skip, limit);
  return { claims, total, page, limit };
}

export async function listActiveEvents(userId?: number) {
  const burnDurationSeconds = readBurnProcessDurationSeconds();
  const events = await repo.listActiveBurnEvents();
  const filtered = events.filter((e) => isEventVisibleOnHub(e));
  if (!userId) {
    return filtered.map((e) => {
      const open = isEventCurrentlyOpen(e);
      return {
        ...e,
        burnDurationSeconds,
        userClaimsCount: 0,
        userCanClaim: open,
        isOpen: open,
        pendingSession: null as null,
      };
    });
  }
  const userCounts = await repo.groupUserBurnClaimCounts(
    userId,
    filtered.map((e) => e.id),
  );
  const countMap = new Map(userCounts.map((r) => [r.eventId, r._count.id]));
  const pendingRows = await repo.listPendingBurnSessionsForUser(userId);
  const pendingByEvent = new Map<number, (typeof pendingRows)[number]>();
  for (const row of pendingRows) {
    if (!pendingByEvent.has(row.event_id)) pendingByEvent.set(row.event_id, row);
  }
  const nowMs = Date.now();
  return filtered.map((e) => {
    const userClaimsCount = countMap.get(e.id) ?? 0;
    const open = isEventCurrentlyOpen(e);
    const pending = pendingByEvent.get(e.id) ?? null;
    const pendingSession = pending
      ? {
          sessionId: pending.id,
          eventId: pending.event_id,
          startedAt: new Date(pending.started_at).toISOString(),
          completesAt: new Date(pending.completes_at).toISOString(),
          burnDurationSeconds,
          ready: nowMs >= new Date(pending.completes_at).getTime(),
        }
      : null;
    return {
      ...e,
      burnDurationSeconds,
      userClaimsCount,
      userCanClaim: open && userClaimsCount < e.claimLimitPerUser,
      isOpen: open,
      pendingSession,
    };
  });
}

export async function getUserBurnableMachines(userId: number) {
  return repo.listUserBurnableMachines(userId);
}

/** Pending server-side burn clock for this event (null if none). */
export async function getPendingBurnSession(userId: number, eventId: number) {
  const session = await repo.findPendingBurnSessionForEvent(userId, eventId);
  if (!session) return null;
  const burnDurationSeconds = readBurnProcessDurationSeconds();
  const completesAt = new Date(session.completes_at);
  const startedAt = new Date(session.started_at);
  const ready = Date.now() >= completesAt.getTime();
  return {
    sessionId: session.id,
    eventId: session.event_id,
    startedAt: startedAt.toISOString(),
    completesAt: completesAt.toISOString(),
    burnDurationSeconds,
    ready,
  };
}

export const repoRef = {
  findBurnEventWithRewardMinerTx: repo.findBurnEventWithRewardMinerTx,
  countUserBurnClaimsTx: repo.countUserBurnClaimsTx,
  findOwnedMachinesForBurnTx: repo.findOwnedMachinesForBurnTx,
  findUserBalancesTx: repo.findUserBalancesTx,
  decrementUserFeeBalanceTx: repo.decrementUserFeeBalanceTx,
  createBurnSessionTx: repo.createBurnSessionTx,
  deleteBurnedMachineRowsTx: repo.deleteBurnedMachineRowsTx,
  incrementBurnEventStockClaimedTx: repo.incrementBurnEventStockClaimedTx,
  createBurnClaimTx: repo.createBurnClaimTx,
  completeBurnSession: repo.completeBurnSession,
  findPendingBurnSession: repo.findPendingBurnSession,
  findPendingBurnSessionForEvent: repo.findPendingBurnSessionForEvent,
  findPendingBurnSessionForEventTx: repo.findPendingBurnSessionForEventTx,
};

async function assertCanStartOrClaim(
  tx: Parameters<typeof repo.findBurnEventWithRewardMinerTx>[0],
  userId: number,
  eventId: number,
  uniqueIds: number[],
) {
  const event = await repoRef.findBurnEventWithRewardMinerTx(tx, eventId);
  if (!event) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_NOT_FOUND);
  if (!isEventCurrentlyOpen(event)) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_CLOSED);
  const userClaimCount = await repoRef.countUserBurnClaimsTx(tx, eventId, userId);
  if (userClaimCount >= event.claimLimitPerUser) {
    throw burnEventsError(BURN_EVENTS_ERROR.CLAIM_LIMIT_REACHED);
  }
  if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) {
    throw burnEventsError(BURN_EVENTS_ERROR.OUT_OF_STOCK);
  }
  const machines = await repoRef.findOwnedMachinesForBurnTx(tx, uniqueIds, userId);
  if (machines.length !== uniqueIds.length) {
    throw burnEventsError(BURN_EVENTS_ERROR.INVALID_MACHINES);
  }
  const totalHashRate = machines.reduce((sum, m) => sum + Number(m.hashRate || 0), 0);
  if (totalHashRate < event.requiredHashRate) {
    throw burnEventsError(BURN_EVENTS_ERROR.INSUFFICIENT_HASHRATE);
  }
  return { event, machines, totalHashRate };
}

/** Start burn: charge fee + destroy selected machines; claim after completesAt delivers reward. */
export async function startBurnEvent(
  userId: number,
  eventId: number,
  ownedMachineIds: unknown,
  feeCurrencyRaw?: unknown,
) {
  const feeCurrency = String(feeCurrencyRaw || "").trim().toUpperCase();
  if (!isAllowedBurnFeeCurrency(feeCurrency)) {
    throw burnEventsError(
      BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY,
      "Moeda de taxa inválida. Escolha entre 'SHIB', 'POL' ou 'BLK'.",
    );
  }

  const feeAmount = getBurnFeeAmount(feeCurrency);

  if (Array.isArray(ownedMachineIds) && ownedMachineIds.length > readMaxBurnOwnedMachineIds()) {
    throw burnEventsError(BURN_EVENTS_ERROR.TOO_MANY_MACHINES);
  }
  const uniqueIds = normalizeMinerIds(ownedMachineIds);
  if (uniqueIds.length === 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
  }
  if (uniqueIds.length > readMaxBurnOwnedMachineIds()) {
    throw burnEventsError(BURN_EVENTS_ERROR.TOO_MANY_MACHINES);
  }

  const durationSeconds = readBurnProcessDurationSeconds();
  const startedAt = new Date();
  const completesAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  let session;
  try {
    session = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${eventId}::int)`;

    // Never cancel a pending burn to start another — machines/fees are already spent on start.
    const alreadyPending = await repoRef.findPendingBurnSessionForEventTx(tx, userId, eventId);
    if (alreadyPending) {
      throw burnEventsError(
        BURN_EVENTS_ERROR.BURN_ALREADY_PENDING,
        "Você já tem uma queima em andamento neste evento. Aguarde o timer e colete o prêmio.",
      );
    }

    const { machines, totalHashRate } = await assertCanStartOrClaim(tx, userId, eventId, uniqueIds);

    const userBalances = await repoRef.findUserBalancesTx(tx, userId);
    if (!userBalances) {
      throw burnEventsError("USER_NOT_FOUND", "Usuário não encontrado.");
    }

    const currentBalance =
      feeCurrency === "SHIB"
        ? Number(userBalances.shibBalance || 0)
        : feeCurrency === "POL"
          ? Number(userBalances.polBalance || 0)
          : Number(userBalances.blkBalance || 0);

    if (currentBalance < feeAmount) {
      throw burnEventsError(
        BURN_EVENTS_ERROR.INSUFFICIENT_FEE_BALANCE,
        `Saldo insuficiente de ${feeCurrency}. Necessário: ${feeAmount}, disponível: ${currentBalance}.`,
      );
    }

    await repoRef.decrementUserFeeBalanceTx(tx, userId, feeCurrency, feeAmount);

    // Destroy machines immediately on start — "queima" is irreversible once confirmed.
    const snapshots: BurnedMachineSnapshot[] = machines.map((m) => ({
      id: m.id,
      name: m.minerName,
      hashRate: Number(m.hashRate || 0) || 0,
      slotSize: Number(m.slotSize || 1) || 1,
      location: String(m.location ?? "INVENTORY"),
    }));
    const destroy = await repoRef.deleteBurnedMachineRowsTx(tx, uniqueIds, userId);
    if (destroy.deletedOwned !== uniqueIds.length) {
      throw burnEventsError(
        BURN_EVENTS_ERROR.BURN_DESTROY_INCOMPLETE,
        "Falha ao destruir as máquinas da queima. Nenhuma alteração foi aplicada.",
      );
    }
    // Defense in depth: re-read so a partial delete cannot commit.
    const stillThere = await repoRef.findOwnedMachinesForBurnTx(tx, uniqueIds, userId);
    if (stillThere.length > 0) {
      throw burnEventsError(
        BURN_EVENTS_ERROR.BURN_DESTROY_INCOMPLETE,
        "Falha ao destruir as máquinas da queima. Nenhuma alteração foi aplicada.",
      );
    }

    const session = await repoRef.createBurnSessionTx(tx, {
      eventId,
      userId,
      ownedMachineIds: snapshots,
      startedAt,
      completesAt,
    });

    log.info("burn.start.destroy", {
      userId,
      eventId,
      sessionId: session.id,
      burned: uniqueIds.length,
      deletedOwned: destroy.deletedOwned,
      totalHashRate,
    });

    return session;
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw burnEventsError(BURN_EVENTS_ERROR.BURN_ALREADY_PENDING);
    }
    throw err;
  }

  try {
    await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
  } catch {
    /* engine cache resync is best-effort */
  }

  log.info("burn.start", {
    userId,
    eventId,
    sessionId: session.id,
    completesAt: completesAt.toISOString(),
    feeCurrency,
    feeAmount,
  });

  return {
    ok: true as const,
    sessionId: session.id,
    startedAt: startedAt.toISOString(),
    completesAt: completesAt.toISOString(),
    burnDurationSeconds: durationSeconds,
    feePaid: {
      currency: feeCurrency,
      amount: feeAmount,
    },
  };
}

export async function claimBurnEvent(userId: number, eventId: number, sessionIdRaw: unknown) {
  const sessionId = Number(sessionIdRaw);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.BURN_SESSION_INVALID);
  }
  const session = await repoRef.findPendingBurnSession(sessionId, userId, eventId);
  if (!session) throw burnEventsError(BURN_EVENTS_ERROR.BURN_SESSION_NOT_FOUND);

  const now = new Date();
  if (now < new Date(session.completes_at)) {
    throw burnEventsError(BURN_EVENTS_ERROR.BURN_NOT_READY, "Burn process still running");
  }

  const snapshots = parseSessionMachineSnapshots(session.owned_machine_ids);
  const uniqueIds = snapshots.length > 0 ? snapshots.map((s) => s.id) : parseSessionMachineIds(session.owned_machine_ids);
  if (uniqueIds.length === 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
  }

  let rewardInboxId: number | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${eventId}::int)`;

    const event = await repoRef.findBurnEventWithRewardMinerTx(tx, eventId);
    if (!event) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_NOT_FOUND);
    if (!isEventCurrentlyOpen(event)) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_CLOSED);
    const userClaimCount = await repoRef.countUserBurnClaimsTx(tx, eventId, userId);
    if (userClaimCount >= event.claimLimitPerUser) {
      throw burnEventsError(BURN_EVENTS_ERROR.CLAIM_LIMIT_REACHED);
    }
    if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) {
      throw burnEventsError(BURN_EVENTS_ERROR.OUT_OF_STOCK);
    }

    // Machines are destroyed on start. Prefer session snapshot; legacy sessions may still
    // have live rows — delete those if present (no-op when already gone).
    const legacyStillOwned = await repoRef.findOwnedMachinesForBurnTx(tx, uniqueIds, userId);
    if (legacyStillOwned.length > 0) {
      await repoRef.deleteBurnedMachineRowsTx(tx, legacyStillOwned.map((m) => m.id), userId);
    }

    const burnedMachinesJson =
      snapshots.length > 0
        ? snapshots
        : legacyStillOwned.map((m) => ({
            id: m.id,
            name: m.minerName,
            hashRate: m.hashRate,
            slotSize: m.slotSize,
            location: m.location,
          }));

    const totalHashRate = burnedMachinesJson.reduce((sum, m) => sum + Number(m.hashRate || 0), 0);

    await repoRef.incrementBurnEventStockClaimedTx(tx, eventId);
    const reward = event.rewardMiner;
    const inbox = await createRewardInboxEntry(tx, {
      userId,
      source: "burn_event",
      rewardType: "machine",
      rewardValue: Number(reward.baseHashRate ?? 0),
      minerId: reward.id,
      minerName: reward.name,
      minerImageUrl: reward.imageUrl ?? null,
      slotSize: reward.slotSize ?? 1,
      metaJson: { burnEventId: event.id, burnEventTitle: event.title, burnSessionId: sessionId },
    });
    rewardInboxId = inbox.id;
    await repoRef.createBurnClaimTx(tx, {
      eventId,
      userId,
      totalHashRate,
      burnedMachinesJson,
      rewardMinerName: reward.name,
      rewardInboxId: inbox.id,
    });
    log.info("burn.claim", {
      userId,
      eventId,
      sessionId,
      burned: uniqueIds.length,
      totalHashRate,
      rewardMiner: reward.name,
    });
  });

  await repoRef.completeBurnSession(sessionId);

  try {
    await syncUserBaseHashRate(userId);
  } catch (err) {
    log.error("burn.engine_reload_failed", { userId, err: String(err) });
  }
  return { ok: true as const, rewardInboxId };
}
