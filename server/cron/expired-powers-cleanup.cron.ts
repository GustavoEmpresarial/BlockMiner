// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Expired powers cleanup cron — ported from legacy/server/cron/gamePowerCleanup.ts,
 * `setInterval`-based (same as mining.cron.ts / checkin.cron.ts). Kept as its own file rather
 * than folded into auto-mining-session-cleanup.cron.ts: that cron owns auto-mining v2 session
 * sweeping specifically, while this one owns the generic "expired power/inventory row" sweep
 * across several unrelated modules (inventory, power-games, youtube, shortlinks, auto-mining v2
 * grants) — one schedule per concern per cron doctrine.
 *
 * Each delete is a plain `deleteMany where expiresAt < now` — identical, trivial logic per
 * table, no business rules involved, so it is not worth routing through five separate module
 * boundaries just to run the same one-liner. The Auto Mining v2 grant delete is guarded by
 * `isAutoMiningV2SchemaAvailable()` exactly like legacy, since that schema may not exist in
 * every environment.
 */
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
import { isAutoMiningV2SchemaAvailable } from "../modules/auto-mining/index.js";
const log = logger.child("ExpiredPowersCleanupCron");
const DEFAULT_INTERVAL_MS = 300_000; // 5 minutes, matches legacy default
export async function cleanupExpiredPowers() {
    const now = new Date();
    const expiredInventoryRows = await prisma.userInventory.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true, ownedMachineId: true },
    });
    if (expiredInventoryRows.length > 0) {
        const omIds = expiredInventoryRows
            .map((r) => r.ownedMachineId)
            .filter((id) => typeof id === "number" && id > 0);
        await prisma.$transaction(async (tx) => {
            await tx.userInventory.deleteMany({
                where: { id: { in: expiredInventoryRows.map((r) => r.id) } },
            });
            if (omIds.length > 0) {
                // Only delete OMs that are no longer referenced by rack/vault after inventory delete.
                const stillLinked = await tx.userOwnedMachine.findMany({
                    where: { id: { in: omIds } },
                    select: {
                        id: true,
                        rackMiner: { select: { id: true } },
                        vaultRow: { select: { id: true } },
                        inventoryRow: { select: { id: true } },
                    },
                });
                const orphanIds = stillLinked
                    .filter((om) => !om.rackMiner && !om.vaultRow && !om.inventoryRow)
                    .map((om) => om.id);
                if (orphanIds.length > 0) {
                    await tx.userOwnedMachine.deleteMany({ where: { id: { in: orphanIds } } });
                }
            }
        });
        log.info(`Cleaned up ${expiredInventoryRows.length} expired inventory items.`);
    }
    const expiredGamePowers = await prisma.userPowerGame.deleteMany({
        where: { expiresAt: { lt: now } },
    });
    if (expiredGamePowers.count > 0) {
        log.info(`Cleaned up ${expiredGamePowers.count} expired game powers.`);
    }
    const expiredYtPowers = await prisma.youtubeWatchPower.deleteMany({
        where: { expiresAt: { lt: now } },
    });
    if (expiredYtPowers.count > 0) {
        log.info(`Cleaned up ${expiredYtPowers.count} expired YouTube powers.`);
    }
    const expiredShortlinkPowers = await prisma.shortlinkPower.deleteMany({
        where: { expiresAt: { lt: now } },
    });
    if (expiredShortlinkPowers.count > 0) {
        log.info(`Cleaned up ${expiredShortlinkPowers.count} expired shortlink powers.`);
    }
    if (await isAutoMiningV2SchemaAvailable()) {
        const expiredAmV2Grants = await prisma.autoMiningV2PowerGrant.deleteMany({
            where: { expiresAt: { lt: now } },
        });
        if (expiredAmV2Grants.count > 0) {
            log.info(`Cleaned up ${expiredAmV2Grants.count} expired Auto Mining v2 power grants.`);
        }
    }
}
export function startExpiredPowersCleanupCron() {
    const intervalMs = Number(process.env.EXPIRED_POWERS_CLEANUP_CRON_MS || DEFAULT_INTERVAL_MS);
    const run = () => {
        cleanupExpiredPowers().catch((err) => {
            log.error("Cleanup error", { error: err instanceof Error ? err.message : String(err) });
        });
    };
    run();
    const handle = setInterval(run, intervalMs);
    handle.unref?.();
    log.info("Expired powers cleanup cron started", { intervalMs });
    return { stop: () => clearInterval(handle) };
}
