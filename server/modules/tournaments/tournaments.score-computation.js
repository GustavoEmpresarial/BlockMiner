import prisma from "../../core/database/prisma.js";
import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import { registerTournamentMetricScorers, getMetricScorer } from "./tournaments.scorers.js";
import { notifyTournamentDirty } from "./tournaments.realtime.js";
import { invalidateLeaderboardCache } from "./tournaments.cache.js";
import { computeDepositScores } from "./deposit-score.js";
import { aggregateUserHashrates, loadUsersForHashrateTournament, } from "./ranking.hashrate.js";
import { isAutoMiningV2SchemaAvailable } from "../auto-mining/index.js";
async function batchUpsertEntries(tournamentId, rows) {
    const active = rows.filter((r) => r.score > 0);
    const activeIds = active.map((r) => r.userId);
    if (activeIds.length === 0) {
        await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
        await invalidateLeaderboardCache(tournamentId);
        notifyTournamentDirty(tournamentId);
        return;
    }
    await prisma.tournamentEntry.deleteMany({
        where: { tournamentId, userId: { notIn: activeIds } },
    });
    for (let i = 0; i < active.length; i += 100) {
        const chunk = active.slice(i, i + 100);
        await Promise.all(chunk.map(({ userId, score }) => prisma.tournamentEntry.upsert({
            where: { tournamentId_userId: { tournamentId, userId } },
            update: { score },
            create: { tournamentId, userId, score },
        })));
    }
    await invalidateLeaderboardCache(tournamentId);
    notifyTournamentDirty(tournamentId);
}
export async function computeScoresForTournament(tournament) {
    const now = new Date();
    const upperBound = tournament.endsAt < now ? tournament.endsAt : now;
    const { metric, startsAt } = tournament;
    if (metric === "HASHRATE") {
        const v2Ok = await isAutoMiningV2SchemaAvailable();
        const users = await loadUsersForHashrateTournament(now, v2Ok);
        const updates = users
            .map((u) => ({ userId: u.id, score: aggregateUserHashrates(u).totalHashrate }))
            .filter((r) => r.score > 0);
        await batchUpsertEntries(tournament.id, updates);
        return;
    }
    if (metric === "BLOCKS_MINED") {
        const rows = await prisma.blockMinerReward.groupBy({
            by: ["userId"],
            where: { createdAt: { gte: startsAt, lte: upperBound } },
            _count: { id: true },
        });
        await batchUpsertEntries(tournament.id, rows.map((r) => ({ userId: r.userId, score: r._count.id })));
        return;
    }
    if (metric === "CHECKINS") {
        const rows = await prisma.dailyCheckin.groupBy({
            by: ["userId"],
            where: {
                OR: [
                    { confirmedAt: { gte: startsAt, lte: upperBound } },
                    { createdAt: { gte: startsAt, lte: upperBound }, status: "confirmed" },
                ],
            },
            _count: { id: true },
        });
        await batchUpsertEntries(tournament.id, rows.map((r) => ({ userId: r.userId, score: r._count.id })));
        return;
    }
    if (metric === "TASKS_COMPLETED") {
        const rows = await prisma.userDailyTaskProgress.groupBy({
            by: ["userId"],
            where: { completedAt: { gte: startsAt, lte: upperBound } },
            _count: { id: true },
        });
        await batchUpsertEntries(tournament.id, rows.map((r) => ({ userId: r.userId, score: r._count.id })));
        return;
    }
    if (metric === "DEPOSITS_POL") {
        if (isTournamentIncrementalScoringEnabled()) {
            registerTournamentMetricScorers();
            const scorer = getMetricScorer("DEPOSITS_POL");
            if (scorer) {
                const scores = await scorer.reconcile({
                    id: tournament.id,
                    name: tournament.name,
                    metric: "DEPOSITS_POL",
                    startsAt,
                    endsAt: tournament.endsAt,
                    status: tournament.status,
                }, { startsAt, endsAt: upperBound });
                await batchUpsertEntries(tournament.id, Array.from(scores.entries())
                    .map(([userId, b]) => ({ userId, score: b.total }))
                    .filter((r) => r.score > 0));
                return;
            }
        }
        const scores = await computeDepositScores(startsAt, upperBound);
        await batchUpsertEntries(tournament.id, Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0));
        return;
    }
    if (metric === "DEPOSITS_USD") {
        registerTournamentMetricScorers();
        const scorer = getMetricScorer("DEPOSITS_USD");
        if (!scorer)
            throw new Error("DEPOSITS_USD scorer not registered");
        const scores = await scorer.reconcile({
            id: tournament.id,
            name: tournament.name,
            metric: "DEPOSITS_USD",
            startsAt,
            endsAt: tournament.endsAt,
            status: tournament.status,
        }, { startsAt, endsAt: upperBound });
        await batchUpsertEntries(tournament.id, Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0));
        return;
    }
    if (metric === "MINIGAME_WINS") {
        const rows = await prisma.gameSessionLog.groupBy({
            by: ["userId"],
            where: {
                success: true,
                rewardGranted: true,
                createdAt: { gte: startsAt, lte: upperBound },
            },
            _count: { id: true },
        });
        await batchUpsertEntries(tournament.id, rows.map((r) => ({ userId: r.userId, score: r._count.id })));
        return;
    }
    if (metric === "FAUCET" || metric === "SHORTLINK" || metric === "AUTO_MINING") {
        registerTournamentMetricScorers();
        const scorer = getMetricScorer(metric);
        if (!scorer)
            throw new Error(`${metric} scorer not registered`);
        const scores = await scorer.reconcile({
            id: tournament.id,
            name: tournament.name,
            metric,
            startsAt,
            endsAt: tournament.endsAt,
            status: tournament.status,
        }, { startsAt, endsAt: upperBound });
        await batchUpsertEntries(tournament.id, Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0));
        return;
    }
    if (metric === "OFFERS_INTERNAL" || metric === "OFFERS_EXTERNAL" || metric === "OFFERS_ALL") {
        const { computeOfferwallScores } = await import("./tournaments.scoring-config.js");
        const scores = await computeOfferwallScores(startsAt, upperBound, { metric });
        await batchUpsertEntries(tournament.id, Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0));
        return;
    }
}
