// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/services/readEarnService.ts.
 *
 * Cross-module note: the "machine" reward type reuses inventory/'s public
 * `grantPurchasedInventoryItems(tx, ...)` (quantity 1, acquisitionSource
 * "read-earn") instead of duplicating the create-inventory-row logic.
 *
 * Deviation (documented, same pattern as mining/machines/auto-mining):
 * legacy also calls `syncUserBaseHashRate()` + `getMiningEngine().reloadMinerProfile()`
 * after granting a hashrate/machine reward, to resync the live in-memory mining
 * engine. FIXED (item 75/88): `syncUserBaseHashRate` now both recomputes AND applies to
 * the live engine — see the real call site below, not a stub.
 */
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { logger } from "../../core/logger/index.js";
import { READ_EARN_BLK, READ_EARN_GAME_SLUG, READ_EARN_HASHRATE, READ_EARN_MACHINE, REDEEM_ALREADY, REDEEM_GENERIC } from "./read-earn.errors.js";
const log = logger.child("read-earn.service");
class RedeemAbort extends Error {
    redeemCode;
    constructor(code) {
        super(code);
        this.name = "RedeemAbort";
        this.redeemCode = code;
    }
}
async function getOrCreateReadEarnGameId(tx) {
    const g = await tx.game.upsert({
        where: { slug: READ_EARN_GAME_SLUG },
        create: { name: "Read & Earn partner", slug: READ_EARN_GAME_SLUG, isActive: true },
        update: {},
    });
    return g.id;
}
export function isReadEarnCampaignLive(c, now) {
    if (!c?.isActive)
        return false;
    if (now < new Date(c.startsAt))
        return false;
    if (now > new Date(c.expiresAt))
        return false;
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
export async function redeemReadEarnCampaign({ userId, campaignId, rawCode, ip = null, userAgent = null, logger: log2 = null, }) {
    const code = String(rawCode || "").trim();
    if (!code || code.length > 128)
        return { ok: false, code: REDEEM_GENERIC };
    const now = new Date();
    const preview = await prisma.readEarnCampaign.findUnique({
        where: { id: campaignId },
        select: { id: true, title: true, isActive: true, startsAt: true, expiresAt: true },
    });
    if (!preview || !isReadEarnCampaignLive(preview, now))
        return { ok: false, code: REDEEM_GENERIC };
    let needsHashReload = false;
    try {
        const snapshot = await prisma.$transaction(async (tx) => {
            const c = await tx.readEarnCampaign.findUnique({ where: { id: campaignId } });
            if (!c || !isReadEarnCampaignLive(c, now))
                throw new RedeemAbort(REDEEM_GENERIC);
            const existing = await tx.readEarnRedemption.findUnique({ where: { userId_campaignId: { userId, campaignId } } });
            if (existing)
                throw new RedeemAbort(REDEEM_ALREADY);
            if (c.maxRedemptions != null) {
                const cnt = await tx.readEarnRedemption.count({ where: { campaignId } });
                if (cnt >= c.maxRedemptions)
                    throw new RedeemAbort(REDEEM_GENERIC);
            }
            const match = await bcrypt.compare(code, c.codeHash);
            if (!match)
                throw new RedeemAbort(REDEEM_GENERIC);
            const rt = String(c.rewardType || "").toLowerCase();
            const amt = Number(c.rewardAmount || 0);
            const snap = {
                rewardType: rt,
                rewardAmount: amt,
                rewardMinerId: c.rewardMinerId,
                hashrateValidityDays: rt === READ_EARN_HASHRATE ? Math.max(1, Number(c.hashrateValidityDays || 7)) : undefined,
            };
            if (rt === READ_EARN_BLK && amt > 0) {
                await tx.user.update({ where: { id: userId }, data: { blkBalance: { increment: new Prisma.Decimal(String(amt)) } } });
            }
            else if (rt === READ_EARN_HASHRATE && amt > 0) {
                const gameId = await getOrCreateReadEarnGameId(tx);
                const days = Math.max(1, Number(c.hashrateValidityDays || 7));
                const playedAt = new Date();
                const expiresAt = new Date(playedAt.getTime() + days * 86_400_000);
                await tx.userPowerGame.create({ data: { userId, gameId, hashRate: amt, playedAt, expiresAt } });
                needsHashReload = true;
            }
            else if (rt === READ_EARN_MACHINE) {
                if (!c.rewardMinerId)
                    throw new RedeemAbort(REDEEM_GENERIC);
                const miner = await tx.miner.findUnique({ where: { id: c.rewardMinerId } });
                if (!miner)
                    throw new RedeemAbort(REDEEM_GENERIC);
                const level = Math.max(1, Math.min(100, Math.floor(amt) || 1));
                await grantPurchasedInventoryItems(tx, userId, { minerId: miner.id, minerName: miner.name, level, hashRate: miner.baseHashRate, slotSize: miner.slotSize, imageUrl: miner.imageUrl, acquisitionSource: "read-earn" }, 1, new Date());
                needsHashReload = true;
            }
            else {
                throw new RedeemAbort(REDEEM_GENERIC);
            }
            await tx.readEarnRedemption.create({
                data: { campaignId, userId, rewardSnapshot: snap, ip: ip ? String(ip).slice(0, 64) : null, userAgent: userAgent ? String(userAgent).slice(0, 512) : null },
            });
            await tx.notification.create({ data: { userId, title: "Partner reward unlocked", message: `Read & Earn: ${c.title}`, type: "reward" } });
            return snap;
        });
        log2?.info?.("readEarn redeem success", { userId, campaignId });
        if (needsHashReload) {
            // Real bug fixed 12/08/2026 (PROGRESSO.txt item 75): mining/index.ts's public
            // syncUserBaseHashRate now both recomputes AND applies to the live engine (item 74) — this
            // resync used to be deferred indefinitely (documented no-op).
            await syncUserBaseHashRate(userId).catch((err) => log.warn("readEarn.hashrate_sync_failed", { userId, campaignId, error: String(err) }));
        }
        return { ok: true, code: "OK", reward: snapshot };
    }
    catch (e) {
        if (e instanceof RedeemAbort)
            return { ok: false, code: e.redeemCode };
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            return { ok: false, code: REDEEM_ALREADY };
        }
        log2?.error?.("readEarn redeem failed", { err: e instanceof Error ? e.message : String(e), userId, campaignId });
        return { ok: false, code: REDEEM_GENERIC };
    }
}
export async function hashReadEarnCode(plainCode) {
    return bcrypt.hash(String(plainCode).trim(), 10);
}
