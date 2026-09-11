/**
 * Ported 1:1 from legacy/server/modules/youtube/infrastructure/repositories/youtube.repository.ts
 * (achatado para a raiz do módulo — current/ não tem infrastructure/repositories/).
 */
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { YoutubeClaimError } from "./youtube.errors.js";

export const REWARD_PER_CLAIM = 10.0;
export const DURATION_HOURS = Number(process.env.YOUTUBE_REWARD_DURATION_HOURS || 24);
/** Daily hash cap (resets at UTC midnight — see youtube.domain.ts). */
export const DAILY_LIMIT_HASH = 1000;
/** Max claims per UTC calendar day (1 claim ≈ 1 minute watched). */
export const MAX_DAILY_CLAIM_MINUTES = Math.floor(DAILY_LIMIT_HASH / REWARD_PER_CLAIM);
/** Minimum ytSecondsBalance required to claim. MUST equal SECONDS_DEBITED_PER_CLAIM (legacy
 *  comment, preserved): a gate/debit mismatch traps the user in an endless retry loop. */
export const MIN_SECONDS_TO_CLAIM = 45;
const SECONDS_DEBITED_PER_CLAIM = MIN_SECONDS_TO_CLAIM;

export { YoutubeClaimError };

export async function findActivePowers(userId: number, now: Date) {
  return prisma.youtubeWatchPower.findMany({
    where: { userId, expiresAt: { gt: now } },
  });
}

export async function getYtSecondsBalance(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { ytSecondsBalance: true },
  });
}

export async function getClaimsBetween(userId: number, start: Date, end: Date) {
  return prisma.youtubeWatchHistory.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
  });
}

export async function getAggregateStats(userId: number) {
  return prisma.youtubeWatchHistory.aggregate({
    where: { userId },
    _count: true,
    _sum: { hashRate: true },
  });
}

export async function claimRewardTx(
  tx: TxClient,
  userId: number,
  videoId: string,
  now: Date,
  expiresAt: Date,
) {
  await tx.youtubeWatchPower.create({
    data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM, claimedAt: now, expiresAt },
  });

  const debited = await tx.user.updateMany({
    where: { id: userId, ytSecondsBalance: { gte: SECONDS_DEBITED_PER_CLAIM } },
    data: { ytSecondsBalance: { decrement: SECONDS_DEBITED_PER_CLAIM } },
  });
  if (debited.count === 0) {
    throw new YoutubeClaimError("INSUFFICIENT_BALANCE");
  }

  const hist = await tx.youtubeWatchHistory.create({
    data: {
      userId,
      sourceVideoId: videoId,
      hashRate: REWARD_PER_CLAIM,
      claimedAt: now,
      expiresAt,
      status: "granted",
    },
  });

  await tx.auditLog.create({
    data: {
      userId,
      action: "youtube_claim",
      detailsJson: JSON.stringify({ videoId, hashRate: REWARD_PER_CLAIM, expiresAt }),
    },
  });

  return hist;
}
