import { ZERADS_MAX_CLICKS_PER_UTC_DAY, aggregateZeradsClicksPerUser, capZeradsClicksForUtcDay, } from "../zerads/index.js";
import prisma from "../../core/database/prisma.js";
export const TOURNAMENT_ZERADS_MAX_PER_WINDOW = ZERADS_MAX_CLICKS_PER_UTC_DAY;
export const ZERADS_SCORING_MODE = "clicks";
export function capZeradsPoints(raw) {
    return capZeradsClicksForUtcDay(raw);
}
export function scoringConfigPayload() {
    return {
        zeradsMode: ZERADS_SCORING_MODE,
        zeradsMaxPerUtcDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
        zeradsMaxPerBrtDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
        zeradsMaxPerWindow: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    };
}
export function formatUtcWindowLabel(startsAt, endsAt) {
    const fmt = (d) => `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
    return { start: fmt(startsAt), end: fmt(endsAt) };
}
/** @deprecated use formatUtcWindowLabel */
export const formatBrtWindowLabel = formatUtcWindowLabel;
const INTERNAL_OFFER_COMPLETED = "COMPLETED";
function emptyBreakdown() {
    return {
        internal: 0,
        offerwallMe: 0,
        moneyRain: 0,
        zeradsRaw: 0,
        zeradsCredited: 0,
        zeradsCapped: 0,
        total: 0,
    };
}
function mergeBreakdown(map, userId, patch) {
    const prev = map.get(userId) ?? emptyBreakdown();
    const next = { ...prev, ...patch };
    if (patch.zeradsCredited != null) {
        next.zeradsCapped = patch.zeradsCredited;
    }
    else if (patch.zeradsCapped != null) {
        next.zeradsCredited = patch.zeradsCapped;
    }
    next.total = next.internal + next.offerwallMe + next.moneyRain + next.zeradsCredited;
    map.set(userId, next);
}
/**
 * Source-of-truth batch scoring for offerwall tournaments.
 * Sources (must stay in sync with TOURNAMENT_ACTION_PROVIDER / providersForOfferwallMetric):
 *  - OFFERS_INTERNAL → InternalOfferwallAttempt COMPLETED
 *  - OFFERS_EXTERNAL → OfferwallMeCallback(status=1) + ZeradsCallback clicks + MoneyRainCallback
 *  - OFFERS_ALL → all of the above
 */
export async function computeOfferwallScores(startsAt, upperBound, opts) {
    const metric = opts?.metric;
    const includeInternal = metric != null
        ? metric === "OFFERS_INTERNAL" || metric === "OFFERS_ALL"
        : opts?.includeInternal !== false;
    const includeExternal = metric != null ? metric === "OFFERS_EXTERNAL" || metric === "OFFERS_ALL" : true;
    const userFilter = opts?.userId != null ? { userId: opts.userId } : {};
    const map = new Map();
    if (includeInternal) {
        const internal = await prisma.internalOfferwallAttempt.groupBy({
            by: ["userId"],
            where: {
                ...userFilter,
                status: INTERNAL_OFFER_COMPLETED,
                completedAt: { gte: startsAt, lte: upperBound },
            },
            _count: { id: true },
        });
        for (const r of internal) {
            mergeBreakdown(map, r.userId, { internal: r._count.id });
        }
    }
    if (includeExternal) {
        const ome = await prisma.offerwallMeCallback.groupBy({
            by: ["userId"],
            where: {
                ...userFilter,
                createdAt: { gte: startsAt, lte: upperBound },
                status: 1,
            },
            _count: { id: true },
        });
        for (const r of ome) {
            const prev = map.get(r.userId);
            mergeBreakdown(map, r.userId, {
                offerwallMe: r._count.id,
                internal: prev?.internal ?? 0,
                moneyRain: prev?.moneyRain ?? 0,
            });
        }
        const moneyRain = await prisma.moneyRainCallback.groupBy({
            by: ["userId"],
            where: {
                ...userFilter,
                createdAt: { gte: startsAt, lte: upperBound },
            },
            _count: { id: true },
        });
        for (const r of moneyRain) {
            const prev = map.get(r.userId);
            mergeBreakdown(map, r.userId, {
                moneyRain: r._count.id,
                internal: prev?.internal ?? 0,
                offerwallMe: prev?.offerwallMe ?? 0,
            });
        }
        const zeradsRows = await prisma.zeradsCallback.findMany({
            where: {
                ...userFilter,
                callbackAt: { gte: startsAt, lte: upperBound },
            },
            select: { userId: true, callbackAt: true, clicks: true },
        });
        const zeradsByUser = aggregateZeradsClicksPerUser(zeradsRows);
        for (const [userId, totals] of zeradsByUser) {
            if (totals.credited <= 0 && totals.raw <= 0)
                continue;
            const prev = map.get(userId);
            mergeBreakdown(map, userId, {
                zeradsRaw: totals.raw,
                zeradsCredited: totals.credited,
                internal: prev?.internal ?? 0,
                offerwallMe: prev?.offerwallMe ?? 0,
                moneyRain: prev?.moneyRain ?? 0,
            });
        }
    }
    return map;
}
export async function computeOfferwallScoreForUser(userId, startsAt, upperBound, includeInternal = true) {
    const map = await computeOfferwallScores(startsAt, upperBound, { userId, includeInternal });
    return map.get(userId) ?? emptyBreakdown();
}
