/**
 * Read & Earn core service.
 *
 * Handles campaign verification, secret code hashing via bcrypt (BCRYPT_COST = 12),
 * and transactional reward redemption across 3 reward types (blk, hashrate, machine).
 */
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { TxClient } from "../../core/database/prisma.js";
import prisma from "../../core/database/prisma.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";

import { syncUserBaseHashRate } from "../mining/index.js";
import { logger } from "../../core/logger/index.js";
import { BCRYPT_COST } from "../../shared/security/password.js";
import {
  DEFAULT_HASHRATE_VALIDITY_DAYS,
  MINER_LEVEL_MAX,
  MINER_LEVEL_MIN,
  MS_PER_DAY,
  READ_EARN_BLK,
  READ_EARN_GAME_SLUG,
  READ_EARN_HASHRATE,
  READ_EARN_IP_MAX_LENGTH,
  READ_EARN_MACHINE,
  READ_EARN_UA_MAX_LENGTH,
  REDEEM_ALREADY,
  REDEEM_GENERIC,
} from "./read-earn.errors.js";

const log = logger.child("read-earn.service");

export interface ReadEarnRewardSnapshot {
  rewardType: string;
  rewardAmount: number;
  rewardMinerId?: number | null;
  hashrateValidityDays?: number;
}

export interface RedeemResultSuccess {
  ok: true;
  code: "OK";
  reward: ReadEarnRewardSnapshot;
}

export interface RedeemResultFailure {
  ok: false;
  code: typeof REDEEM_ALREADY | typeof REDEEM_GENERIC;
}

export type RedeemResult = RedeemResultSuccess | RedeemResultFailure;

export interface RedeemReadEarnCampaignParams {
  userId: number;
  campaignId: number;
  rawCode: string;
  ip?: string | null;
  userAgent?: string | null;
  logger?: {
    info?: (msg: string, meta?: Record<string, unknown>) => void;
    error?: (msg: string, meta?: Record<string, unknown>) => void;
  } | null;
}

export interface CampaignDateCheck {
  isActive: boolean;
  startsAt: Date | string;
  expiresAt: Date | string;
}

class RedeemAbort extends Error {
  readonly redeemCode: typeof REDEEM_ALREADY | typeof REDEEM_GENERIC;
  constructor(code: typeof REDEEM_ALREADY | typeof REDEEM_GENERIC) {
    super(code);
    this.name = "RedeemAbort";
    this.redeemCode = code;
  }
}

async function getOrCreateReadEarnGameId(tx: TxClient): Promise<number> {
  const g = await tx.game.upsert({
    where: { slug: READ_EARN_GAME_SLUG },
    create: { name: "Read & Earn partner", slug: READ_EARN_GAME_SLUG, isActive: true },
    update: {},
  });
  return g.id;
}

export function isReadEarnCampaignLive(c: CampaignDateCheck | null | undefined, now = new Date()): boolean {
  if (!c?.isActive) return false;
  if (now < new Date(c.startsAt)) return false;
  if (now > new Date(c.expiresAt)) return false;
  return true;
}

/** Public listing: active window only (no secret fields). */
export async function listPublicReadEarnCampaigns(now = new Date()) {
  return prisma.readEarnCampaign.findMany({
    where: { isActive: true, startsAt: { lte: now }, expiresAt: { gte: now } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, title: true, partnerUrl: true, startsAt: true, expiresAt: true },
  });
}

/** Validates campaign + code, grants reward, writes redemption + notification. */
export async function redeemReadEarnCampaign({
  userId,
  campaignId,
  rawCode,
  ip = null,
  userAgent = null,
  logger: log2 = null,
}: RedeemReadEarnCampaignParams): Promise<RedeemResult> {
  const code = String(rawCode || "").trim();
  if (!code || code.length > 128) {
    return { ok: false, code: REDEEM_GENERIC };
  }

  const now = new Date();
  const preview = await prisma.readEarnCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, title: true, isActive: true, startsAt: true, expiresAt: true },
  });

  if (!preview || !isReadEarnCampaignLive(preview, now)) {
    return { ok: false, code: REDEEM_GENERIC };
  }

  let needsHashReload = false;

  try {
    const snapshot = await prisma.$transaction(async (tx) => {
      const c = await tx.readEarnCampaign.findUnique({ where: { id: campaignId } });
      if (!c || !isReadEarnCampaignLive(c, now)) {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      const existing = await tx.readEarnRedemption.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
      });
      if (existing) {
        throw new RedeemAbort(REDEEM_ALREADY);
      }

      if (c.maxRedemptions != null) {
        const cnt = await tx.readEarnRedemption.count({ where: { campaignId } });
        if (cnt >= c.maxRedemptions) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
      }

      const match = await bcrypt.compare(code, c.codeHash);
      if (!match) {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      const rt = String(c.rewardType || "").toLowerCase();
      const amt = Number(c.rewardAmount || 0);

      const snap: ReadEarnRewardSnapshot = {
        rewardType: rt,
        rewardAmount: amt,
        rewardMinerId: c.rewardMinerId,
        hashrateValidityDays:
          rt === READ_EARN_HASHRATE
            ? Math.max(1, Number(c.hashrateValidityDays || DEFAULT_HASHRATE_VALIDITY_DAYS))
            : undefined,
      };

      if (rt === READ_EARN_BLK && amt > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { blkBalance: { increment: new Prisma.Decimal(String(amt)) } },
        });
      } else if (rt === READ_EARN_HASHRATE && amt > 0) {
        const gameId = await getOrCreateReadEarnGameId(tx);
        const days = Math.max(1, Number(c.hashrateValidityDays || DEFAULT_HASHRATE_VALIDITY_DAYS));
        const playedAt = new Date();
        const expiresAt = new Date(playedAt.getTime() + days * MS_PER_DAY);
        await tx.userPowerGame.create({
          data: { userId, gameId, hashRate: amt, playedAt, expiresAt },
        });
        needsHashReload = true;
      } else if (rt === READ_EARN_MACHINE) {
        if (!c.rewardMinerId) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
        const miner = await tx.miner.findUnique({ where: { id: c.rewardMinerId } });
        if (!miner) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
        const level = Math.max(MINER_LEVEL_MIN, Math.min(MINER_LEVEL_MAX, Math.floor(amt) || 1));
        await grantPurchasedInventoryItems(
          tx,
          userId,
          {
            minerId: miner.id,
            minerName: miner.name,
            level,
            hashRate: miner.baseHashRate,
            slotSize: miner.slotSize,
            imageUrl: miner.imageUrl,
            acquisitionSource: "read-earn",
          },
          1,
          new Date(),
        );
        needsHashReload = true;
      } else {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      await tx.readEarnRedemption.create({
        data: {
          campaignId,
          userId,
          rewardSnapshot: snap as unknown as Prisma.InputJsonValue,
          ip: ip ? String(ip).slice(0, READ_EARN_IP_MAX_LENGTH) : null,
          userAgent: userAgent ? String(userAgent).slice(0, READ_EARN_UA_MAX_LENGTH) : null,
        },
      });

      await tx.notification.create({
        data: {
          userId,
          title: "Partner reward unlocked",
          message: `Read & Earn: ${c.title}`,
          type: "reward",
        },
      });

      return snap;
    });

    log2?.info?.("readEarn redeem success", { userId, campaignId });

    if (needsHashReload) {
      await syncUserBaseHashRate(userId).catch((err) =>
        log.warn("readEarn.hashrate_sync_failed", { userId, campaignId, error: String(err) }),
      );
    }

    return { ok: true, code: "OK", reward: snapshot };
  } catch (e: unknown) {
    if (e instanceof RedeemAbort) {
      return { ok: false, code: e.redeemCode };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: REDEEM_ALREADY };
    }
    log2?.error?.("readEarn redeem failed", {
      err: e instanceof Error ? e.message : String(e),
      userId,
      campaignId,
    });
    return { ok: false, code: REDEEM_GENERIC };
  }
}

export async function hashReadEarnCode(plainCode: string): Promise<string> {
  return bcrypt.hash(String(plainCode).trim(), BCRYPT_COST);
}
