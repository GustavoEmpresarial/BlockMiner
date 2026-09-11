// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/offerwall/infrastructure/repositories/offerwall.repository.ts. */
import prisma from "../../core/database/prisma.js";
const INTERNAL_COMPLETED = "COMPLETED";
export async function fetchOfferwallAnalyticsRaw(filter) {
    const userFilter = filter.userId != null ? { userId: filter.userId } : {};
    const dateInternal = { completedAt: { gte: filter.from, lte: filter.to } };
    const dateOme = { createdAt: { gte: filter.from, lte: filter.to } };
    const dateZerads = { callbackAt: { gte: filter.from, lte: filter.to } };
    const [internalAgg, omeAgg, zeradsAgg, internalRows, omeRows, zeradsRows] = await Promise.all([
        prisma.internalOfferwallAttempt.aggregate({
            where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
            _count: { id: true },
        }),
        prisma.offerwallMeCallback.aggregate({
            where: { ...userFilter, status: 1, ...dateOme },
            _count: { id: true },
            _sum: { polCredited: true },
        }),
        prisma.zeradsCallback.aggregate({
            where: { ...userFilter, ...dateZerads },
            _count: { id: true },
            _sum: { clicks: true, payoutAmount: true },
        }),
        prisma.internalOfferwallAttempt.findMany({
            where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
            select: { completedAt: true, offer: { select: { rewardPolAmount: true } } },
        }),
        prisma.offerwallMeCallback.findMany({
            where: { ...userFilter, status: 1, ...dateOme },
            select: { createdAt: true, polCredited: true },
        }),
        prisma.zeradsCallback.findMany({
            where: { ...userFilter, ...dateZerads },
            select: { callbackAt: true, clicks: true, payoutAmount: true },
        }),
    ]);
    return { internalAgg, omeAgg, zeradsAgg, internalRows, omeRows, zeradsRows };
}
