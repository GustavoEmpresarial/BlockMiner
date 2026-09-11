// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy miniPassRewardFulfillmentService.
 *
 * Deviations:
 * - applyPolDeltaInEngine: skipped — DB balance is source of truth (documented).
 * - syncMiningAfterMiniPassReward: syncUserBaseHashRate only; socket emit no-op.
 * - Inventory via grantPurchasedInventoryItems from inventory/index.
 */
import { Prisma } from "@prisma/client";
import { grantPurchasedInventoryItems, normalizePersistableMinerImageUrl } from "../inventory/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { MINI_PASS_GAME_SLUG, REWARD_BLK, REWARD_EVENT_MINER, REWARD_HASHRATE_TEMP, REWARD_NONE, REWARD_POL, REWARD_SHOP_MINER, } from "./mini-pass.constants.js";
async function getOrCreateMiniPassGameId(tx) {
    const g = await tx.game.upsert({
        where: { slug: MINI_PASS_GAME_SLUG },
        create: {
            name: "Mini Pass bonus",
            slug: MINI_PASS_GAME_SLUG,
            isActive: true,
        },
        update: {},
    });
    return g.id;
}
export async function fulfillMiniPassLevelReward(tx, { userId, reward }) {
    const kind = String(reward.rewardKind || REWARD_NONE).toUpperCase();
    const now = new Date();
    if (kind === REWARD_NONE || !reward) {
        return { kind: REWARD_NONE };
    }
    if (kind === REWARD_SHOP_MINER) {
        const minerId = reward.minerId;
        if (!minerId)
            throw new Error("MINER_REQUIRED");
        const miner = await tx.miner.findUnique({ where: { id: minerId } });
        if (!miner)
            throw new Error("MINER_NOT_FOUND");
        await grantPurchasedInventoryItems(tx, userId, {
            minerId: miner.id,
            minerName: miner.name,
            level: 1,
            hashRate: Number(miner.baseHashRate || 0),
            slotSize: Number(miner.slotSize || 1),
            imageUrl: normalizePersistableMinerImageUrl(miner.imageUrl),
            acquisitionSource: "mini_pass",
        }, 1, now);
        return { kind: REWARD_SHOP_MINER, minerName: miner.name };
    }
    if (kind === REWARD_EVENT_MINER) {
        const eventMinerId = reward.eventMinerId;
        if (!eventMinerId)
            throw new Error("EVENT_MINER_REQUIRED");
        const em = await tx.eventMiner.findUnique({ where: { id: eventMinerId } });
        if (!em)
            throw new Error("EVENT_MINER_NOT_FOUND");
        await grantPurchasedInventoryItems(tx, userId, {
            minerId: null,
            eventMinerId: em.id,
            minerName: `[Event] ${em.name}`,
            level: 1,
            hashRate: Number(em.hashRate || 0),
            slotSize: Number(em.slotSize || 1),
            imageUrl: normalizePersistableMinerImageUrl(em.imageUrl),
            acquisitionSource: "mini_pass",
        }, 1, now);
        return { kind: REWARD_EVENT_MINER, minerName: em.name };
    }
    if (kind === REWARD_HASHRATE_TEMP) {
        const hr = Number(reward.hashRate || 0);
        const days = Math.max(1, Math.floor(Number(reward.hashRateDays || 7)));
        if (!(hr > 0))
            throw new Error("HASHRATE_INVALID");
        const gameId = await getOrCreateMiniPassGameId(tx);
        const playedAt = now;
        const expiresAt = new Date(playedAt.getTime() + days * 24 * 60 * 60 * 1000);
        await tx.userPowerGame.create({
            data: {
                userId,
                gameId,
                hashRate: hr,
                playedAt,
                expiresAt,
            },
        });
        return { kind: REWARD_HASHRATE_TEMP, hashRate: hr, days };
    }
    if (kind === REWARD_BLK) {
        const raw = reward.blkAmount;
        const amt = raw != null ? new Prisma.Decimal(String(raw)) : new Prisma.Decimal(0);
        if (amt.lte(0))
            throw new Error("BLK_INVALID");
        await tx.user.update({
            where: { id: userId },
            data: { blkBalance: { increment: amt } },
        });
        return { kind: REWARD_BLK, amount: amt.toString() };
    }
    if (kind === REWARD_POL) {
        const raw = reward.polAmount;
        const amt = raw != null ? new Prisma.Decimal(String(raw)) : new Prisma.Decimal(0);
        if (amt.lte(0))
            throw new Error("POL_INVALID");
        await tx.user.update({
            where: { id: userId },
            data: { polBalance: { increment: amt } },
        });
        return { kind: REWARD_POL, amount: amt.toString() };
    }
    throw new Error("UNKNOWN_REWARD_KIND");
}
export async function syncMiningAfterMiniPassReward(userId) {
    await syncUserBaseHashRate(userId);
    // Socket emit machines:update — no-op in current/
}
/**
 * Legacy applied POL delta into the in-memory mining engine.
 * Skipped here: DB `polBalance` is the source of truth; no miningRuntime in current/.
 */
export function applyPolDeltaInEngine(_userId, _deltaPol) {
    // intentionally no-op — see module deviation note above
}
