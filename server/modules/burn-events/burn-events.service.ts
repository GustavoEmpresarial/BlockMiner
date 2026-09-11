/**
 * Burn events service — claim requires a prior start session that has reached completesAt
 * (burn process duration from burn-events.config / BURN_PROCESS_DURATION_SECONDS).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { createRewardInboxEntry } from "../notifications/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { BURN_EVENTS_ERROR, burnEventsError } from "./burn-events.errors.js";
import { isEventCurrentlyOpen, isEventVisibleOnHub, normalizeMinerIds } from "./burn-events.helpers.js";
import { readBurnProcessDurationSeconds } from "./burn-events.config.js";
import * as repo from "./burn-events.repository.js";

const log = logger.child("BurnEventsService");

function parseSessionMachineIds(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
  return normalizeMinerIds(arr);
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
    claimLimitPerUser: Math.max(1, data.claimLimitPerUser ?? 1),
    stockTotal: data.stockTotal ?? null,
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
      claimLimitPerUser: Math.max(1, data.claimLimitPerUser),
    }),
    ...(data.stockTotal !== undefined && { stockTotal: data.stockTotal }),
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
      };
    });
  }
  const userCounts = await repo.groupUserBurnClaimCounts(
    userId,
    filtered.map((e) => e.id),
  );
  const countMap = new Map(userCounts.map((r) => [r.eventId, r._count.id]));
  return filtered.map((e) => {
    const userClaimsCount = countMap.get(e.id) ?? 0;
    const open = isEventCurrentlyOpen(e);
    return {
      ...e,
      burnDurationSeconds,
      userClaimsCount,
      userCanClaim: open && userClaimsCount < e.claimLimitPerUser,
      isOpen: open,
    };
  });
}

export async function getUserBurnableMachines(userId: number) {
  return repo.listUserBurnableMachines(userId);
}

async function assertCanStartOrClaim(
  tx: Parameters<typeof repo.findBurnEventWithRewardMinerTx>[0],
  userId: number,
  eventId: number,
  uniqueIds: number[],
) {
  const event = await repo.findBurnEventWithRewardMinerTx(tx, eventId);
  if (!event) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_NOT_FOUND);
  if (!isEventCurrentlyOpen(event)) throw burnEventsError(BURN_EVENTS_ERROR.EVENT_CLOSED);
  const userClaimCount = await repo.countUserBurnClaimsTx(tx, eventId, userId);
  if (userClaimCount >= event.claimLimitPerUser) {
    throw burnEventsError(BURN_EVENTS_ERROR.CLAIM_LIMIT_REACHED);
  }
  if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) {
    throw burnEventsError(BURN_EVENTS_ERROR.OUT_OF_STOCK);
  }
  const machines = await repo.findOwnedMachinesForBurnTx(tx, uniqueIds, userId);
  if (machines.length !== uniqueIds.length) {
    throw burnEventsError(BURN_EVENTS_ERROR.INVALID_MACHINES);
  }
  const totalHashRate = machines.reduce((sum, m) => sum + Number(m.hashRate || 0), 0);
  if (totalHashRate < event.requiredHashRate) {
    throw burnEventsError(BURN_EVENTS_ERROR.INSUFFICIENT_HASHRATE);
  }
  return { event, machines, totalHashRate };
}

/** Start the burn clock — machines stay owned until claim after completesAt. */
export async function startBurnEvent(userId: number, eventId: number, ownedMachineIds: unknown) {
  const uniqueIds = normalizeMinerIds(ownedMachineIds);
  if (uniqueIds.length === 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
  }
  const durationSeconds = readBurnProcessDurationSeconds();
  await prisma.$transaction(async (tx) => {
    await assertCanStartOrClaim(tx, userId, eventId, uniqueIds);
  });
  const startedAt = new Date();
  const completesAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  const session = await repo.createBurnSession({
    eventId,
    userId,
    ownedMachineIds: uniqueIds,
    startedAt,
    completesAt,
  });
  log.info("burn.start", { userId, eventId, sessionId: session.id, completesAt: completesAt.toISOString() });
  return {
    ok: true as const,
    sessionId: session.id,
    startedAt: startedAt.toISOString(),
    completesAt: completesAt.toISOString(),
    burnDurationSeconds: durationSeconds,
  };
}

export async function claimBurnEvent(userId: number, eventId: number, sessionIdRaw: unknown) {
  const sessionId = Number(sessionIdRaw);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.BURN_SESSION_INVALID);
  }
  const session = await repo.findPendingBurnSession(sessionId, userId, eventId);
  if (!session) throw burnEventsError(BURN_EVENTS_ERROR.BURN_SESSION_NOT_FOUND);

  const now = new Date();
  if (now < new Date(session.completes_at)) {
    throw burnEventsError(BURN_EVENTS_ERROR.BURN_NOT_READY, "Burn process still running");
  }

  const uniqueIds = parseSessionMachineIds(session.owned_machine_ids);
  if (uniqueIds.length === 0) {
    throw burnEventsError(BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
  }

  let burnedFromRack = false;
  let rewardInboxId: number | null = null;

  await prisma.$transaction(async (tx) => {
    const { event, machines, totalHashRate } = await assertCanStartOrClaim(
      tx,
      userId,
      eventId,
      uniqueIds,
    );
    burnedFromRack = machines.some((m) => m.location === "RACK");
    await repo.deleteBurnedMachineRowsTx(tx, uniqueIds, userId);
    await repo.incrementBurnEventStockClaimedTx(tx, eventId);
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
    await repo.createBurnClaimTx(tx, {
      eventId,
      userId,
      totalHashRate,
      burnedMachinesJson: machines.map((m) => ({
        id: m.id,
        name: m.minerName,
        hashRate: m.hashRate,
        slotSize: m.slotSize,
        location: m.location,
      })),
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

  await repo.completeBurnSession(sessionId);

  if (burnedFromRack) {
    try {
      await syncUserBaseHashRate(userId);
    } catch (err) {
      log.error("burn.engine_reload_failed", { userId, err: String(err) });
    }
  }
  return { ok: true as const, rewardInboxId };
}
