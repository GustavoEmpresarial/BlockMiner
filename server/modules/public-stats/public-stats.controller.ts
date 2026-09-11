// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("public-stats.controller");
export function maskUsername(name) {
    const s = name ?? "user";
    if (s.length <= 2)
        return s + "***";
    return s.slice(0, 2) + "***";
}
export function decimalToNumber(value) {
    if (value == null)
        return 0;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "bigint")
        return Number(value);
    if (typeof value === "object" &&
        value !== null &&
        typeof value.toString === "function") {
        const n = Number(value.toString());
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
/** Fixed launch date replicated verbatim from legacy. */
const LAUNCH_DATE = "2026-03-05T00:00:00.000Z";
/**
 * GET /api/public-stats — landing trust strip; must stay best-effort (no 500 on partial DB issues).
 */
export async function getPublicStats(_req, res) {
    const settled = await Promise.allSettled([
        prisma.user.count(),
        prisma.transaction.aggregate({
            where: { type: "withdrawal", status: "completed" },
            _sum: { amount: true },
        }),
        prisma.userMiner.count({ where: { isActive: true } }),
    ]);
    const failures = [];
    let userCount = 0;
    let totalWithdrawn = 0;
    let activeMiners = 0;
    if (settled[0].status === "fulfilled") {
        userCount = settled[0].value;
    }
    else {
        const r = settled[0].reason;
        failures.push({ metric: "users", reason: r instanceof Error ? r.message : String(r) });
    }
    if (settled[1].status === "fulfilled") {
        totalWithdrawn = decimalToNumber(settled[1].value._sum?.amount);
    }
    else {
        const r = settled[1].reason;
        failures.push({ metric: "withdrawals", reason: r instanceof Error ? r.message : String(r) });
    }
    if (settled[2].status === "fulfilled") {
        activeMiners = settled[2].value;
    }
    else {
        const r = settled[2].reason;
        failures.push({ metric: "activeMiners", reason: r instanceof Error ? r.message : String(r) });
    }
    if (failures.length > 0) {
        log.warn("public-stats degraded", { failures });
    }
    res.json({
        ok: true,
        users: userCount,
        totalWithdrawn,
        activeMiners,
        launchDate: LAUNCH_DATE,
        ...(failures.length > 0 ? { degraded: true } : {}),
    });
}
/**
 * GET /api/public-feed — last 10 payments + last 10 deposits for landing page trust feed.
 * Usernames are masked (first 2 chars + ***; short/missing names fall back to "user" + ***).
 */
export async function getPublicFeed(_req, res) {
    try {
        const [withdrawals, deposits] = await Promise.all([
            prisma.transaction.findMany({
                where: { type: "withdrawal", status: "completed" },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    amount: true,
                    createdAt: true,
                    user: { select: { username: true } },
                },
            }),
            prisma.transaction.findMany({
                where: { type: "deposit", status: "completed" },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    amount: true,
                    createdAt: true,
                    user: { select: { username: true } },
                },
            }),
        ]);
        const mapRow = (r) => ({
            id: r.id,
            user: maskUsername(r.user?.username),
            amount: decimalToNumber(r.amount),
            at: r.createdAt.toISOString(),
        });
        res.json({ ok: true, withdrawals: withdrawals.map(mapRow), deposits: deposits.map(mapRow) });
    }
    catch (err) {
        log.warn("public-feed failed", { err: err instanceof Error ? err.message : String(err) });
        res.json({ ok: true, withdrawals: [], deposits: [] });
    }
}
