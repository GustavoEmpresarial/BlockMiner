/**
 * V1 Auto Mining ("GPU flow") — business logic layer.
 * Ported 1:1 from legacy/server/modules/auto-mining/application/auto-mining.service.ts.
 *
 * Deviation from legacy: legacy's claimGPU() also called
 * services/powerBoostService.{computeRewardExpiresAt,resolveRewardExpiresAtForGrant} and
 * services/userOwnedMachineService.createInventoryWithOwnedMachineTx. The owning modules
 * (mining/machines/boosts) are not fully built out in `current/` yet (Fase 3, in progress —
 * only types/errors/repository skeletons exist, no service/index.ts to import from). Per the
 * task's dependency rule ("do not import mining/ internals directly"), the small slice of that
 * logic actually needed here (power-boost TTL lookup, inventory+owned-machine row creation) is
 * inlined below, scoped tightly to what claimGPU needs. When modules/boosts and
 * modules/machines grow real index.ts exports, this inlined logic should be replaced with calls
 * through their public boundary.
 */
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { V1_DAILY_LIMIT, V1_CLAIM_COST_SECONDS } from "./auto-mining.config.js";
import * as repo from "./auto-mining.repository.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";

const log = logger.child("AutoMiningService");

const GPU_AUTO_RELEASE_INTERVAL_MS = 5 * 60 * 1000;

const NORMAL_TTL_MS = 24 * 60 * 60 * 1000;
const BOOST_TTL_MS = 7 * NORMAL_TTL_MS;

function todayKeyUTC(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRewardExpiresAt(earnedAt: Date, durationMs: number): Date {
  return new Date(earnedAt.getTime() + durationMs);
}

/** Immutable grant expiry: boost status for today's UTC day at creation time only. Mirrors
 *  legacy powerBoostService.resolveRewardExpiresAtForGrant for the "autoMining" reward system. */
async function resolveRewardExpiresAtForGrant(
  tx: TxClient,
  userId: number,
  earnedAt: Date,
): Promise<{ expiresAt: Date; durationMs: number }> {
  const row = await tx.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKeyUTC(earnedAt) } },
    select: { id: true },
  });
  const durationMs = row != null ? BOOST_TTL_MS : NORMAL_TTL_MS;
  return { expiresAt: computeRewardExpiresAt(earnedAt, durationMs), durationMs };
}

/** Mirrors legacy services/userOwnedMachineService.createInventoryWithOwnedMachineTx. */
async function createInventoryWithOwnedMachineTx(
  tx: TxClient,
  payload: {
    userId: number;
    minerId: number | null;
    minerName: string;
    level?: number;
    hashRate: number;
    slotSize?: number;
    imageUrl?: string | null;
    acquiredAt: Date;
    updatedAt: Date;
    expiresAt?: Date | null;
  }
) {
  const om = await tx.userOwnedMachine.create({
    data: {
      userId: payload.userId,
      location: "INVENTORY",
      minerId: payload.minerId ?? null,
      minerName: payload.minerName,
      level: payload.level ?? 1,
      hashRate: payload.hashRate,
      slotSize: payload.slotSize ?? 1,
      imageUrl: payload.imageUrl ?? null,
    },
  });
  return tx.userInventory.create({
    data: {
      userId: payload.userId,
      minerId: payload.minerId ?? null,
      minerName: payload.minerName,
      level: payload.level ?? 1,
      hashRate: payload.hashRate,
      slotSize: payload.slotSize ?? 1,
      imageUrl: payload.imageUrl ?? null,
      acquiredAt: payload.acquiredAt,
      updatedAt: payload.updatedAt,
      expiresAt: payload.expiresAt ?? undefined,
      ownedMachineId: om.id,
    },
  });
}

export async function getAvailableGPUs(userId: number) {
  let gpus = await repo.findAvailableGPUs(userId);

  if (gpus.length === 0) {
    const lastGpu = await repo.findLastReleasedGPU(userId);
    const now = new Date();
    const nextReleaseAt = lastGpu
      ? new Date(lastGpu.releasedAt.getTime() + GPU_AUTO_RELEASE_INTERVAL_MS)
      : now;

    if (now >= nextReleaseAt) {
      const user = await repo.findUserSecondsBalance(userId);
      if (user && user.autoMiningSecondsBalance >= V1_CLAIM_COST_SECONDS) {
        const reward = await repo.findActiveReward();
        if (reward) {
          const newGpu = await repo.createGPU(userId, reward.id, reward.gpuHashRate, now);
          gpus = [newGpu];
        }
      }
    }
  }

  return gpus;
}

export async function claimGPU(
  userId: number,
  gpuId: number
): Promise<{ gpu: Awaited<ReturnType<typeof repo.claimGPUTx>>; expiresAt: Date }> {
  const now = new Date();
  const gpu = await repo.findGPUForClaim(gpuId, userId);
  if (!gpu) {
    const err = new Error("GPU not available") as Error & { code: string };
    err.code = "GPU_NOT_FOUND";
    throw err;
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const claims24h = await repo.countClaimsLast24h(userId, yesterday);
  if (claims24h >= V1_DAILY_LIMIT) {
    const err = new Error("Limite diário de resgates alcançado. Volte mais tarde!") as Error & { code: string };
    err.code = "DAILY_LIMIT_REACHED";
    throw err;
  }

  const user = await repo.findUserSecondsBalance(userId);
  if (!user || user.autoMiningSecondsBalance < V1_CLAIM_COST_SECONDS) {
    const err = new Error("Tempo de atividade focado insuficiente.") as Error & { code: string };
    err.code = "INSUFFICIENT_SECONDS";
    throw err;
  }

  const gpuWithReward = await repo.findGPUWithReward(gpu.id);
  let grantExpiresAt = computeRewardExpiresAt(now, NORMAL_TTL_MS);

  const updatedGpu = await prisma.$transaction(async (tx) => {
    const { expiresAt } = await resolveRewardExpiresAtForGrant(tx, userId, now);
    grantExpiresAt = expiresAt;
    const u = await repo.claimGPUTx(tx, gpu.id, now, expiresAt);
    await repo.decrementSecondsBalanceTx(tx, userId, V1_CLAIM_COST_SECONDS);

    const reward = gpuWithReward?.reward;
    await createInventoryWithOwnedMachineTx(tx, {
      userId,
      minerId: null,
      minerName: reward?.name || "Pulse GPU v1",
      level: 1,
      hashRate: gpu.gpuHashRate,
      slotSize: 1,
      imageUrl: reward?.imageUrl || "/media/miners/reward2.webp",
      acquiredAt: now,
      updatedAt: now,
      expiresAt,
    });

    await repo.createGPULogTx(tx, {
      userId,
      gpuId: gpu.id,
      rewardId: gpu.rewardId,
      gpuHashRate: gpu.gpuHashRate,
      action: "claim",
      source: "auto_mining",
      claimedAt: now,
      expiresAt,
    });

    return u;
  });

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.AUTO_MINING,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `am:v1:${gpu.id}:${now.toISOString()}`,
    metadata: { gpuId: gpu.id, mode: "v1" },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));

  return { gpu: updatedGpu, expiresAt: grantExpiresAt };
}

export async function getGPUHistory(userId: number) {
  return repo.findGPUHistory(userId, 20);
}

export async function getActiveRewardWithStats(userId: number) {
  const reward = await repo.findActiveReward();

  if (!reward) {
    const anyReward = await repo.findAnyReward();
    if (anyReward) {
      log.info(`Found reward (ID: ${anyReward.id}) but isActive is ${anyReward.isActive}`);
    } else {
      log.error("DATABASE IS EMPTY! auto_mining_rewards table has 0 rows.");
    }
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [claims24h, hash24hAggr, totalStats] = await Promise.all([
    repo.countClaimsLast24h(userId, yesterday),
    repo.sumHashRateLast24h(userId, yesterday),
    repo.aggregateTotalStats(userId),
  ]);

  return {
    reward,
    stats: {
      claims24h,
      hash24h: Number(hash24hAggr._sum.gpuHashRate || 0),
      claimsTotal: totalStats._count,
      hashTotal: Number(totalStats._sum.gpuHashRate || 0),
      dailyLimit: V1_DAILY_LIMIT,
    },
  };
}
