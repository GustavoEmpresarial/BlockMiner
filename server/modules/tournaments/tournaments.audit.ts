// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
import { isDepositMetric, depositScoreMismatch } from "./tournaments.helpers.js";
import { registerTournamentMetricScorers, getMetricScorer } from "./tournaments.scorers.js";
import { computeDepositScores, aggregateDepositSummary, getDepositScoreDetailForUser, } from "./deposit-score.js";
import { formatUtcWindowLabel } from "./tournaments.scoring-config.js";
import { normalizeDepositSummary, depositRankingUnit } from "./deposit-presentation.js";
export function tournamentUpperBound(tournament, now = new Date()) {
    return tournament.endsAt < now ? tournament.endsAt : now;
}
export function isAuditableMetric(metric) {
    return isDepositMetric(metric);
}
export async function adminTournamentScoreAudit(tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament)
        return null;
    if (!isAuditableMetric(tournament.metric)) {
        throw new Error("Score audit is only available for deposit tournament metrics");
    }
    const now = new Date();
    const upperBound = tournamentUpperBound(tournament, now);
    const stored = await prisma.tournamentEntry.findMany({
        where: { tournamentId },
        orderBy: { score: "desc" },
        take: 500,
        include: { user: { select: { id: true, username: true, name: true } } },
    });
    if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
        registerTournamentMetricScorers();
        const scorer = getMetricScorer(tournament.metric);
        const scores = scorer
            ? await scorer.reconcile({
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                startsAt: tournament.startsAt,
                endsAt: tournament.endsAt,
                status: tournament.status,
            }, { startsAt: tournament.startsAt, endsAt: upperBound })
            : tournament.metric === "DEPOSITS_POL"
                ? await computeDepositScores(tournament.startsAt, upperBound)
                : new Map();
        const summary = scorer?.getAggregateSummary
            ? await scorer.getAggregateSummary({
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                startsAt: tournament.startsAt,
                endsAt: tournament.endsAt,
                status: tournament.status,
            }, { startsAt: tournament.startsAt, endsAt: upperBound })
            : tournament.metric === "DEPOSITS_POL"
                ? await aggregateDepositSummary(tournament.startsAt, upperBound)
                : null;
        const entries = stored.map((e, idx) => {
            const breakdown = scores.get(e.userId) ?? { total: 0, txCount: 0 };
            const storedScore = Number(e.score);
            return {
                rank: e.rank ?? idx + 1,
                userId: e.userId,
                username: e.user.username ?? e.user.name,
                storedScore,
                breakdown,
                mismatch: depositScoreMismatch(storedScore, breakdown.total, tournament.metric),
            };
        });
        return {
            tournament: {
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                depositRankingUnit: depositRankingUnit(tournament.metric),
                status: tournament.status,
                startsAt: tournament.startsAt.toISOString(),
                endsAt: tournament.endsAt.toISOString(),
                windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
                upperBound: upperBound.toISOString(),
            },
            serverNow: now.toISOString(),
            serverNowUtc: formatUtcWindowLabel(now, now).start,
            depositSummary: summary
                ? normalizeDepositSummary(tournament.metric, summary)
                : null,
            entries,
        };
    }
    throw new Error("Unsupported audit metric");
}
export async function adminTournamentScoreAuditUser(tournamentId, userId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament)
        return null;
    if (!isAuditableMetric(tournament.metric)) {
        throw new Error("Score audit is only available for deposit tournament metrics");
    }
    const upperBound = tournamentUpperBound(tournament);
    const stored = await prisma.tournamentEntry.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
        registerTournamentMetricScorers();
        const scorer = getMetricScorer(tournament.metric);
        const detail = scorer?.getUserBreakdown
            ? await scorer.getUserBreakdown(userId, {
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                startsAt: tournament.startsAt,
                endsAt: tournament.endsAt,
                status: tournament.status,
            }, { startsAt: tournament.startsAt, endsAt: upperBound })
            : await getDepositScoreDetailForUser(userId, tournament.startsAt, upperBound);
        const breakdownTotal = detail.breakdown?.total ?? 0;
        const detailObj = detail;
        return {
            tournament: {
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                startsAt: tournament.startsAt.toISOString(),
                endsAt: tournament.endsAt.toISOString(),
                windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
                upperBound: upperBound.toISOString(),
            },
            serverNow: new Date().toISOString(),
            userId,
            storedScore: stored ? Number(stored.score) : null,
            ...detailObj,
            mismatch: stored
                ? depositScoreMismatch(Number(stored.score), breakdownTotal, tournament.metric)
                : false,
        };
    }
    throw new Error("Unsupported audit metric");
}
export async function getMyTournamentScoreBreakdown(tournamentId, userId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || !isAuditableMetric(tournament.metric))
        return null;
    const upperBound = tournamentUpperBound(tournament);
    if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
        registerTournamentMetricScorers();
        const scorer = getMetricScorer(tournament.metric);
        const detail = scorer?.getUserBreakdown
            ? await scorer.getUserBreakdown(userId, {
                id: tournament.id,
                name: tournament.name,
                metric: tournament.metric,
                startsAt: tournament.startsAt,
                endsAt: tournament.endsAt,
                status: tournament.status,
            }, { startsAt: tournament.startsAt, endsAt: upperBound })
            : await getDepositScoreDetailForUser(userId, tournament.startsAt, upperBound);
        const detailObj = detail;
        return {
            tournamentId,
            metric: tournament.metric,
            windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
            ...detailObj,
        };
    }
    return null;
}
