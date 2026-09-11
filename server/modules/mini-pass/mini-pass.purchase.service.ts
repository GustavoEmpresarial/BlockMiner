/**
 * Ported from legacy miniPassPurchaseService.
 * applyUserBalanceDelta skipped — DB balance is source of truth.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { PURCHASE_BUY_LEVEL, PURCHASE_COMPLETE_PASS, XP_SOURCE_PURCHASE } from "./mini-pass.constants.js";
import { xpRemainingToCap } from "./mini-pass.level-math.js";
import { isMiniPassSeasonLive } from "./mini-pass.season-live.js";
import { applyMiniPassXp } from "./mini-pass.xp.service.js";

const log = logger.child("mini-pass.purchase");

function polBalanceOf(user: { polBalance?: unknown } | null | undefined) {
  return user?.polBalance != null ? Number(user.polBalance) : 0;
}

function gateCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code =
    e instanceof Error && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : undefined;
  return code || msg;
}

function mapPurchaseError(e: unknown) {
  const gate = gateCode(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (gate === "INSUFFICIENT" || msg === "INSUFFICIENT_POL") {
    return { ok: false as const, code: "insufficient_balance", status: 400 };
  }
  if (gate === "NOT_FOUND" || msg === "SEASON_NOT_FOUND") {
    return { ok: false as const, code: "not_found", status: 404 };
  }
  if (gate === "NOT_LIVE" || msg === "SEASON_NOT_LIVE") {
    return { ok: false as const, code: "season_not_live", status: 400 };
  }
  if (gate === "ALREADY_MAX" || msg === "ALREADY_MAX") {
    return { ok: false as const, code: "already_max_level", status: 400 };
  }
  if (gate === "BAD_CONFIG" || msg === "PRICE_NOT_CONFIGURED") {
    return { ok: false as const, code: "misconfigured", status: 503 };
  }
  if (gate === "FORBIDDEN" || msg === "USER_BLOCKED") {
    return { ok: false as const, code: "forbidden", status: 403 };
  }
  return null;
}

export async function purchaseMiniPassLevels(userId: number, seasonId: number, quantity = 1) {
  const q = Math.min(50, Math.max(1, Math.floor(Number(quantity) || 1)));
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.id || user.isBanned) {
        throw Object.assign(new Error("USER_BLOCKED"), { code: "FORBIDDEN" });
      }

      const season = await tx.miniPassSeason.findFirst({
        where: { id: seasonId, deletedAt: null, isActive: true },
      });
      if (!season) {
        throw Object.assign(new Error("SEASON_NOT_FOUND"), { code: "NOT_FOUND" });
      }
      if (!isMiniPassSeasonLive(season, now)) {
        throw Object.assign(new Error("SEASON_NOT_LIVE"), { code: "NOT_LIVE" });
      }

      const priceEach = Number(new Prisma.Decimal(season.buyLevelPricePol.toString()));
      if (!Number.isFinite(priceEach) || priceEach <= 0) {
        throw Object.assign(new Error("PRICE_NOT_CONFIGURED"), { code: "BAD_CONFIG" });
      }

      const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
      const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));

      await tx.userMiniPassEnrollment.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, totalXp: 0 },
        update: {},
      });

      const enr = await tx.userMiniPassEnrollment.findUnique({
        where: { userId_seasonId: { userId, seasonId } },
      });
      const currentXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
      const remaining = xpRemainingToCap(currentXp, maxLevel, xpPerLevel);
      if (remaining <= 0) {
        throw Object.assign(new Error("ALREADY_MAX"), { code: "ALREADY_MAX" });
      }

      const xpIntent = q * xpPerLevel;
      const xpGrant = Math.min(xpIntent, remaining);
      const levelsEffective = Math.ceil(xpGrant / xpPerLevel);
      const price = new Prisma.Decimal(String(priceEach * levelsEffective));

      if (polBalanceOf(user) < Number(price)) {
        throw Object.assign(new Error("INSUFFICIENT_POL"), { code: "INSUFFICIENT" });
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: price } },
      });

      const purchase = await tx.userMiniPassPurchase.create({
        data: {
          userId,
          seasonId,
          kind: PURCHASE_BUY_LEVEL,
          levelsAdded: levelsEffective,
          xpAdded: xpGrant,
          pricePaid: price,
          currency: "POL",
        },
      });

      await applyMiniPassXp({
        userId,
        seasonId,
        amount: xpGrant,
        source: XP_SOURCE_PURCHASE,
        idempotencyKey: `mini-pass-buy-level-${purchase.id}`,
        metadataJson: { purchaseId: purchase.id, quantityRequested: q },
        tx,
      });

      const fresh = await tx.user.findUnique({ where: { id: userId } });
      return { purchase, polBalance: polBalanceOf(fresh) };
    });

    // applyUserBalanceDelta skipped — DB is source of truth

    await prisma.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_PURCHASE",
        detailsJson: JSON.stringify({
          seasonId,
          kind: PURCHASE_BUY_LEVEL,
          purchaseId: result.purchase.id,
          pricePaid: result.purchase.pricePaid.toString(),
        }),
      },
    });

    return { ok: true as const, purchaseId: result.purchase.id, polBalance: result.polBalance };
  } catch (e: unknown) {
    const mapped = mapPurchaseError(e);
    if (mapped) return mapped;
    log.error("purchaseMiniPassLevels", { error: String(e) });
    return { ok: false as const, code: "error", status: 500 };
  }
}

export async function purchaseMiniPassComplete(userId: number, seasonId: number) {
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.id || user.isBanned) {
        throw Object.assign(new Error("USER_BLOCKED"), { code: "FORBIDDEN" });
      }

      const season = await tx.miniPassSeason.findFirst({
        where: { id: seasonId, deletedAt: null, isActive: true },
      });
      if (!season) {
        throw Object.assign(new Error("SEASON_NOT_FOUND"), { code: "NOT_FOUND" });
      }
      if (!isMiniPassSeasonLive(season, now)) {
        throw Object.assign(new Error("SEASON_NOT_LIVE"), { code: "NOT_LIVE" });
      }

      const price = new Prisma.Decimal(season.completePassPricePol.toString());
      if (price.lte(0)) {
        throw Object.assign(new Error("PRICE_NOT_CONFIGURED"), { code: "BAD_CONFIG" });
      }

      const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
      const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));

      await tx.userMiniPassEnrollment.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, totalXp: 0 },
        update: {},
      });

      const enr = await tx.userMiniPassEnrollment.findUnique({
        where: { userId_seasonId: { userId, seasonId } },
      });
      const currentXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
      const need = xpRemainingToCap(currentXp, maxLevel, xpPerLevel);
      if (need <= 0) {
        throw Object.assign(new Error("ALREADY_MAX"), { code: "ALREADY_MAX" });
      }

      if (polBalanceOf(user) < Number(price)) {
        throw Object.assign(new Error("INSUFFICIENT_POL"), { code: "INSUFFICIENT" });
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: price } },
      });

      const purchase = await tx.userMiniPassPurchase.create({
        data: {
          userId,
          seasonId,
          kind: PURCHASE_COMPLETE_PASS,
          levelsAdded: 0,
          xpAdded: need,
          pricePaid: price,
          currency: "POL",
        },
      });

      await applyMiniPassXp({
        userId,
        seasonId,
        amount: need,
        source: XP_SOURCE_PURCHASE,
        idempotencyKey: `mini-pass-complete-${purchase.id}`,
        metadataJson: { purchaseId: purchase.id },
        tx,
      });

      const fresh = await tx.user.findUnique({ where: { id: userId } });
      return { purchase, polBalance: polBalanceOf(fresh) };
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_PURCHASE",
        detailsJson: JSON.stringify({
          seasonId,
          kind: PURCHASE_COMPLETE_PASS,
          purchaseId: result.purchase.id,
          pricePaid: result.purchase.pricePaid.toString(),
        }),
      },
    });

    return { ok: true as const, purchaseId: result.purchase.id, polBalance: result.polBalance };
  } catch (e: unknown) {
    const mapped = mapPurchaseError(e);
    if (mapped) return mapped;
    log.error("purchaseMiniPassComplete", { error: String(e) });
    return { ok: false as const, code: "error", status: 500 };
  }
}
