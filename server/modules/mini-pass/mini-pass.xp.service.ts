import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { isMiniPassSeasonLive } from "./mini-pass.season-live.js";
import type { ApplyMiniPassXpInput, ApplyMiniPassXpResult } from "./mini-pass.types.js";

/**
 * Idempotent XP grant: duplicate idempotency_key returns { duplicate: true }.
 */
export async function applyMiniPassXp({
  userId,
  seasonId,
  amount,
  source,
  idempotencyKey,
  missionId = null,
  periodKey = null,
  metadataJson = null,
  tx: outerTx = null,
}: ApplyMiniPassXpInput): Promise<ApplyMiniPassXpResult> {
  const n = Math.floor(Number(amount));
  if (!userId || !seasonId || !idempotencyKey || !Number.isFinite(n) || n <= 0) {
    return { ok: false, code: "invalid_input" };
  }

  const run = async (tx: TxClient): Promise<ApplyMiniPassXpResult> => {
    const season = await tx.miniPassSeason.findFirst({
      where: { id: seasonId, deletedAt: null },
    });
    if (!season) {
      throw Object.assign(new Error("SEASON_NOT_FOUND"), { code: "SEASON_NOT_FOUND" });
    }
    if (!isMiniPassSeasonLive(season, new Date())) {
      throw Object.assign(new Error("SEASON_NOT_LIVE"), { code: "SEASON_NOT_LIVE" });
    }

    await tx.userMiniPassEnrollment.upsert({
      where: { userId_seasonId: { userId, seasonId } },
      create: { userId, seasonId, totalXp: 0 },
      update: {},
    });

    try {
      await tx.userMiniPassXpLedger.create({
        data: {
          userId,
          seasonId,
          amount: n,
          source,
          idempotencyKey,
          missionId,
          periodKey,
          metadataJson: metadataJson ?? undefined,
        },
      });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true, duplicate: true };
      }
      throw e;
    }

    await tx.userMiniPassEnrollment.update({
      where: { userId_seasonId: { userId, seasonId } },
      data: { totalXp: { increment: n } },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_XP",
        ip: null,
        userAgent: null,
        detailsJson: JSON.stringify({
          seasonId,
          amount: n,
          source,
          idempotencyKey,
          missionId,
          periodKey,
        }),
      },
    });

    return { ok: true, duplicate: false };
  };

  if (outerTx) return run(outerTx);
  return prisma.$transaction((tx) => run(tx));
}
