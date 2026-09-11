/**
 * Count-based claim metrics (FAUCET / SHORTLINK / AUTO_MINING).
 * Prisma is loaded only inside reconcile so pure action tests stay DB-free.
 */
import { windowContains } from "./tournaments.types.js";
import { contributionSourceId, providerAllowedForMetric, TOURNAMENT_ACTION_PROVIDER, } from "./tournaments.providers.js";
function upperBound(tournament) {
    const now = new Date();
    return tournament.endsAt < now ? tournament.endsAt : now;
}
export class ClaimCountMetricScorer {
    metric;
    provider;
    constructor(metric, provider) {
        this.metric = metric;
        this.provider = provider;
    }
    onTournamentAction(event, tournament) {
        if (!event.tournamentEligible || event.actionCount <= 0)
            return null;
        if (tournament.metric !== this.metric)
            return null;
        if (!providerAllowedForMetric(event.provider, this.metric))
            return null;
        const eventAt = new Date(event.executedAtUTC);
        if (!windowContains(tournament, eventAt, upperBound(tournament)))
            return null;
        return {
            userId: event.userId,
            sourceType: "action",
            sourceId: contributionSourceId(event.provider, event.sourceId),
            metricValue: event.actionCount,
            eventAt,
            metadata: { provider: event.provider, actionId: event.actionId },
        };
    }
    async reconcile(tournament, window, opts) {
        const { default: prisma } = await import("../../core/database/prisma.js");
        const upper = upperBound(tournament);
        const endAt = window.endsAt < upper ? window.endsAt : upper;
        const userFilter = opts?.userId != null ? { userId: opts.userId } : {};
        if (this.metric === "FAUCET") {
            const actions = await prisma.tournamentAction.groupBy({
                by: ["userId"],
                where: {
                    provider: this.provider,
                    tournamentEligible: true,
                    executedAtUTC: { gte: window.startsAt, lte: endAt },
                    ...userFilter,
                },
                _sum: { actionCount: true },
            });
            const map = new Map();
            for (const r of actions) {
                const total = Number(r._sum.actionCount ?? 0);
                if (total <= 0)
                    continue;
                map.set(r.userId, { total, txCount: total });
            }
            if (map.size > 0)
                return map;
            // faucet_claims is one row/user (last claim only) — count temp-power grants instead.
            const grants = await prisma.userPowerGame.groupBy({
                by: ["userId"],
                where: {
                    playedAt: { gte: window.startsAt, lte: endAt },
                    game: { slug: "faucet_power" },
                    ...userFilter,
                },
                _count: { id: true },
            });
            for (const g of grants) {
                const total = Number(g._count.id ?? 0);
                if (total <= 0)
                    continue;
                map.set(g.userId, { total, txCount: total });
            }
            return map;
        }
        if (this.metric === "SHORTLINK") {
            const rows = await prisma.shortlinkPower.groupBy({
                by: ["userId"],
                where: {
                    claimedAt: { gte: window.startsAt, lte: endAt },
                    ...userFilter,
                },
                _count: { id: true },
            });
            const map = new Map();
            for (const r of rows) {
                const total = Number(r._count.id ?? 0);
                if (total <= 0)
                    continue;
                map.set(r.userId, { total, txCount: total });
            }
            return map;
        }
        const map = new Map();
        const v2 = await prisma.autoMiningV2PowerGrant.groupBy({
            by: ["userId"],
            where: {
                earnedAt: { gte: window.startsAt, lte: endAt },
                ...userFilter,
            },
            _count: { id: true },
        });
        for (const r of v2) {
            const total = Number(r._count.id ?? 0);
            if (total <= 0)
                continue;
            map.set(r.userId, { total, txCount: total });
        }
        const v1 = await prisma.autoMiningGpu.groupBy({
            by: ["userId"],
            where: {
                isClaimed: true,
                claimedAt: { gte: window.startsAt, lte: endAt },
                ...userFilter,
            },
            _count: { id: true },
        });
        for (const r of v1) {
            const total = Number(r._count.id ?? 0);
            if (total <= 0)
                continue;
            const prev = map.get(r.userId) ?? { total: 0, txCount: 0 };
            map.set(r.userId, { total: prev.total + total, txCount: prev.txCount + total });
        }
        return map;
    }
}
export function createClaimCountScorers() {
    return [
        new ClaimCountMetricScorer("FAUCET", TOURNAMENT_ACTION_PROVIDER.FAUCET),
        new ClaimCountMetricScorer("SHORTLINK", TOURNAMENT_ACTION_PROVIDER.SHORTLINK),
        new ClaimCountMetricScorer("AUTO_MINING", TOURNAMENT_ACTION_PROVIDER.AUTO_MINING),
    ];
}
