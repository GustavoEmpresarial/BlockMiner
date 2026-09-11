// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * User count snapshot cron — ported from legacy/server/cron/userCountSnapshotCron.ts,
 * `setInterval`-based (same as mining.cron.ts / checkin.cron.ts).
 *
 * Daily snapshot of user metrics — written to audit_logs so we have a real historical series of
 * `total / banned / active7d / active30d / max_id`. Combined with any delete-audit trigger, this
 * catches both planned (admin actions) and unplanned (silent SQL) shrinkage of the user base.
 *
 * action: "user_count_snapshot" | source: "system" | severity: "info"
 */
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
const log = logger.child("UserCountSnapshotCron");
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h, matches legacy default
export async function takeUserCountSnapshot() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [total, banned, neverLogged, active7d, active30d, maxIdRow] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isBanned: true } }),
        prisma.user.count({ where: { lastLoginAt: null } }),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
        prisma.$queryRaw `SELECT COALESCE(MAX(id), 0)::int AS max_id FROM users`,
    ]);
    const maxId = Array.isArray(maxIdRow) && maxIdRow[0]?.max_id != null ? Number(maxIdRow[0].max_id) : 0;
    const deletedEver = Math.max(0, maxId - total);
    await prisma.auditLog.create({
        data: {
            action: "user_count_snapshot",
            source: "system",
            severity: "info",
            label: `Users: ${total} (banned ${banned} · 7d ${active7d} · gaps ${deletedEver})`,
            metadata: { total, banned, neverLogged, active7d, active30d, maxId, deletedEver },
        },
    });
    log.info("snapshot written", { total, banned, active7d, active30d, deletedEver });
}
export function startUserCountSnapshotCron() {
    const intervalMs = Number(process.env.USER_COUNT_SNAPSHOT_MS || DEFAULT_INTERVAL_MS);
    const run = () => {
        takeUserCountSnapshot().catch((err) => {
            log.warn("snapshot failed", { error: err instanceof Error ? err.message : String(err) });
        });
    };
    run();
    const handle = setInterval(run, intervalMs);
    handle.unref?.();
    log.info("User count snapshot cron started", { intervalMs });
    return { stop: () => clearInterval(handle) };
}
