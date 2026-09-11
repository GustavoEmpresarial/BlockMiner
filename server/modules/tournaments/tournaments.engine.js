import { getMetricScorer, registerTournamentMetricScorers } from "./tournaments.scorers.js";
import { ACTION_INCREMENTAL_METRICS } from "./tournaments.providers.js";
import { isTournamentIncrementalScoringEnabled, isOfferwallAutocorrectEnabled, } from "./tournaments.flags.js";
import { applyContribution } from "./tournaments.projection.js";
import { detectOfferwallDrift } from "./tournaments.offerwall-drift.js";
import { isOfferwallIncrementalMetric, isMinigameIncrementalMetric, } from "./tournaments.metrics.js";
import { batchUpsertEntriesFromReconcile, findActiveTournaments, findActiveTournamentsByMetrics, findTournamentById, getEntryScores, touchScoresReconciledAt, } from "./tournaments.repository.js";
import { computeScoresForTournament } from "./tournaments.score-computation.js";
import { notifyTournamentDirty } from "./tournaments.realtime.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("TournamentEngine");
const DRIFT_TOLERANCE = 0.0001;
const DEPOSIT_INCREMENTAL_METRICS = ["DEPOSITS_USD", "DEPOSITS_POL"];
const INCREMENTAL_METRICS = [
    ...DEPOSIT_INCREMENTAL_METRICS,
    ...ACTION_INCREMENTAL_METRICS,
];
export async function handleDepositConfirmed(payload) {
    if (!isTournamentIncrementalScoringEnabled())
        return;
    const tournaments = await findActiveTournamentsByMetrics(DEPOSIT_INCREMENTAL_METRICS);
    for (const tournament of tournaments) {
        const scorer = getMetricScorer(tournament.metric);
        if (!scorer?.onDepositConfirmed)
            continue;
        const delta = scorer.onDepositConfirmed(payload, tournament);
        if (!delta)
            continue;
        await applyContribution(tournament.id, delta);
    }
}
export async function handleTournamentAction(payload) {
    if (!isTournamentIncrementalScoringEnabled())
        return;
    const tournaments = await findActiveTournamentsByMetrics([
        ...ACTION_INCREMENTAL_METRICS,
    ]);
    for (const tournament of tournaments) {
        const scorer = getMetricScorer(tournament.metric);
        if (!scorer?.onTournamentAction)
            continue;
        const delta = scorer.onTournamentAction(payload, tournament);
        if (!delta)
            continue;
        const result = await applyContribution(tournament.id, delta);
        if (!result.applied && result.reason === "duplicate") {
            log.info("tournament.action.projection.duplicate", {
                tournamentId: tournament.id,
                userId: payload.userId,
                provider: payload.provider,
                providerEventId: payload.sourceId,
            });
        }
    }
}
export function buildMiningBlockContributions(tournaments, payload) {
    const eventAt = new Date(payload.eventAt);
    if (!Number.isFinite(eventAt.getTime()))
        throw new Error("Invalid mining block event timestamp");
    return tournaments
        .filter((tournament) => eventAt >= tournament.startsAt && eventAt <= tournament.endsAt)
        .flatMap((tournament) => payload.userIds.map((userId) => ({
        tournamentId: tournament.id,
        userId,
        sourceType: "BLOCKS_MINED",
        sourceId: `block:${payload.blockNumber}:user:${userId}`,
        metricValue: 1,
        eventAt,
        metadata: { blockNumber: payload.blockNumber },
    })));
}
export async function handleMiningBlockSettled(payload) {
    const tournaments = await findActiveTournamentsByMetrics(["BLOCKS_MINED"]);
    const tasks = buildMiningBlockContributions(tournaments, payload);
    const concurrency = 2;
    let nextTask = 0;
    async function processNext() {
        while (nextTask < tasks.length) {
            const task = tasks[nextTask++];
            await applyContribution(task.tournamentId, {
                userId: task.userId,
                sourceType: task.sourceType,
                sourceId: task.sourceId,
                metricValue: task.metricValue,
                eventAt: task.eventAt,
                metadata: task.metadata,
            });
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => processNext()));
}
async function reconcileDepositTournament(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament)
        throw new Error("Tournament not found");
    const scorer = getMetricScorer(tournament.metric);
    if (!scorer) {
        await computeScoresForTournament(tournament);
        await touchScoresReconciledAt(tournamentId);
        return { tournamentId, driftCount: 0, corrected: 0 };
    }
    const window = { startsAt: tournament.startsAt, endsAt: tournament.endsAt };
    const expected = await scorer.reconcile(tournament, window);
    const stored = await getEntryScores(tournamentId);
    let driftCount = 0;
    let corrected = 0;
    const allUserIds = new Set([...expected.keys(), ...stored.keys()]);
    for (const userId of allUserIds) {
        const exp = expected.get(userId)?.total ?? 0;
        const got = stored.get(userId) ?? 0;
        if (Math.abs(exp - got) > DRIFT_TOLERANCE) {
            driftCount++;
            log.warn("tournament.deposit.drift", {
                tournamentId,
                userId,
                expected: exp,
                stored: got,
                metric: tournament.metric,
            });
        }
    }
    if (driftCount > 0 && tournament.status === "ACTIVE") {
        const rows = Array.from(expected.entries()).map(([userId, b]) => ({
            userId,
            score: b.total,
        }));
        await batchUpsertEntriesFromReconcile(tournamentId, rows);
        corrected = driftCount;
        notifyTournamentDirty(tournamentId);
        log.warn("tournament.deposit.drift.corrected", { tournamentId, corrected });
    }
    await touchScoresReconciledAt(tournamentId);
    return { tournamentId, driftCount, corrected };
}
async function reconcileOfferwallTournament(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament)
        throw new Error("Tournament not found");
    const offerwallDrift = await detectOfferwallDrift(tournament);
    let corrected = 0;
    if (isOfferwallAutocorrectEnabled() &&
        offerwallDrift.driftCount > 0 &&
        tournament.status === "ACTIVE") {
        const rows = offerwallDrift.actionTotals;
        await batchUpsertEntriesFromReconcile(tournamentId, rows);
        corrected = offerwallDrift.driftCount;
        notifyTournamentDirty(tournamentId);
    }
    return {
        tournamentId,
        driftCount: offerwallDrift.driftCount,
        corrected,
        offerwallDrift,
    };
}
async function reconcileMinigameTournament(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament)
        throw new Error("Tournament not found");
    const scorer = getMetricScorer(tournament.metric);
    if (!scorer) {
        await computeScoresForTournament(tournament);
        await touchScoresReconciledAt(tournamentId);
        return { tournamentId, driftCount: 0, corrected: 0 };
    }
    const window = { startsAt: tournament.startsAt, endsAt: tournament.endsAt };
    const expected = await scorer.reconcile(tournament, window);
    const stored = await getEntryScores(tournamentId);
    let driftCount = 0;
    let corrected = 0;
    const allUserIds = new Set([...expected.keys(), ...stored.keys()]);
    for (const userId of allUserIds) {
        const exp = expected.get(userId)?.total ?? 0;
        const got = stored.get(userId) ?? 0;
        if (Math.abs(exp - got) > DRIFT_TOLERANCE) {
            driftCount++;
        }
    }
    if (driftCount > 0 && tournament.status === "ACTIVE") {
        const rows = Array.from(expected.entries()).map(([userId, b]) => ({
            userId,
            score: b.total,
        }));
        await batchUpsertEntriesFromReconcile(tournamentId, rows);
        corrected = driftCount;
        notifyTournamentDirty(tournamentId);
    }
    await touchScoresReconciledAt(tournamentId);
    return { tournamentId, driftCount, corrected };
}
export async function reconcileTournament(tournamentId, options = {}) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament)
        throw new Error("Tournament not found");
    if (tournament.metric === "BLOCKS_MINED" && !options.recomputeBlocks) {
        await touchScoresReconciledAt(tournamentId);
        return { tournamentId, driftCount: 0, corrected: 0 };
    }
    if (isOfferwallIncrementalMetric(tournament.metric)) {
        return reconcileOfferwallTournament(tournamentId);
    }
    if (isMinigameIncrementalMetric(tournament.metric)) {
        return reconcileMinigameTournament(tournamentId);
    }
    if (DEPOSIT_INCREMENTAL_METRICS.includes(tournament.metric)) {
        return reconcileDepositTournament(tournamentId);
    }
    await computeScoresForTournament(tournament);
    await touchScoresReconciledAt(tournamentId);
    return { tournamentId, driftCount: 0, corrected: 0 };
}
export async function reconcileAllActive() {
    const active = await findActiveTournaments();
    const reports = [];
    for (const t of active) {
        try {
            reports.push(await reconcileTournament(t.id));
        }
        catch (err) {
            log.error("tournament.reconcile.failed", {
                tournamentId: t.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return reports;
}
export async function reconcileLegacyBatchTournament(tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament)
        return;
    if (INCREMENTAL_METRICS.includes(tournament.metric) ||
        tournament.metric === "BLOCKS_MINED") {
        return;
    }
    await computeScoresForTournament(tournament);
}
// Ensure scorers exist when engine is first imported under V2.
registerTournamentMetricScorers();
