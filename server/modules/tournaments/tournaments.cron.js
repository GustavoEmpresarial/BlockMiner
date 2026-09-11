import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { computeScoresForTournament, finalizeTournament, alignActiveTournamentWindows, } from "./tournaments.service.js";
import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import { reconcileAllActive, reconcileLegacyBatchTournament } from "./tournaments.engine.js";
import { backfillMinigameTournamentFromLogs } from "./tournaments.minigame-backfill.js";
import { OFFERS_INCREMENTAL_METRICS, MINIGAME_INCREMENTAL_METRICS, } from "./tournaments.providers.js";
import { processTournamentOutboxBatch } from "./tournaments.outbox.js";
import { registerTournamentMetricScorers } from "./tournaments.scorers.js";
import { runOfferwallShadowValidation } from "./tournaments.offerwall-drift.js";
const log = logger.child("tournaments.cron");
let scoreIntervalId = null;
let lifecycleIntervalId = null;
let outboxIntervalId = null;
let reconcileIntervalId = null;
let shadowValidationIntervalId = null;
/** Score updater interval — product copy says ~5 min; 2 min keeps boards fresher. */
const SCORE_UPDATE_INTERVAL_MS = Number(process.env.TOURNAMENT_SCORE_INTERVAL_MS || 2 * 60 * 1000);
const RECONCILE_INTERVAL_MS = Number(process.env.TOURNAMENT_RECONCILE_INTERVAL_MS || 15 * 60 * 1000);
const SHADOW_INTERVAL_MS = Number(process.env.TOURNAMENT_SHADOW_INTERVAL_MS || 60 * 60 * 1000);
const LIFECYCLE_INTERVAL_MS = Number(process.env.TOURNAMENT_LIFECYCLE_INTERVAL_MS || 60 * 1000);
const OUTBOX_INTERVAL_MS = Number(process.env.TOURNAMENT_OUTBOX_INTERVAL_MS || 5_000);
const INCREMENTAL_METRICS = new Set([
    "DEPOSITS_USD",
    "DEPOSITS_POL",
    ...MINIGAME_INCREMENTAL_METRICS,
]);
/** Offerwall always batch-recomputes from ZeradsCallback / offerwall.me / internal (source of truth). */
const OFFERWALL_SOURCE_METRICS = new Set([...OFFERS_INCREMENTAL_METRICS]);
const OUTBOX_METRICS = new Set(["BLOCKS_MINED"]);
export function startTournamentsCron() {
    registerTournamentMetricScorers();
    scoreIntervalId = setInterval(() => {
        void runScoreUpdater();
    }, SCORE_UPDATE_INTERVAL_MS);
    if (isTournamentIncrementalScoringEnabled()) {
        reconcileIntervalId = setInterval(() => {
            void runReconcile();
        }, RECONCILE_INTERVAL_MS);
        shadowValidationIntervalId = setInterval(() => {
            void runShadowValidation();
        }, SHADOW_INTERVAL_MS);
    }
    outboxIntervalId = setInterval(() => {
        void processTournamentOutboxBatch().catch(() => { });
    }, OUTBOX_INTERVAL_MS);
    lifecycleIntervalId = setInterval(() => {
        void runLifecycleManager();
    }, LIFECYCLE_INTERVAL_MS);
    void runLifecycleManager();
    void alignActiveTournamentWindows().catch((err) => log.error("[tournaments] align windows error:", { error: String(err) }));
    void runScoreUpdater();
    if (isTournamentIncrementalScoringEnabled()) {
        void runReconcile();
        void runShadowValidation();
    }
    void processTournamentOutboxBatch().catch(() => { });
    return {
        stop: () => {
            if (scoreIntervalId)
                clearInterval(scoreIntervalId);
            if (lifecycleIntervalId)
                clearInterval(lifecycleIntervalId);
            if (outboxIntervalId)
                clearInterval(outboxIntervalId);
            if (reconcileIntervalId)
                clearInterval(reconcileIntervalId);
            if (shadowValidationIntervalId)
                clearInterval(shadowValidationIntervalId);
            scoreIntervalId = null;
            lifecycleIntervalId = null;
            outboxIntervalId = null;
            reconcileIntervalId = null;
            shadowValidationIntervalId = null;
        },
    };
}
async function runScoreUpdater() {
    try {
        const active = await prisma.tournament.findMany({
            where: { status: "ACTIVE" },
        });
        for (const tournament of active) {
            try {
                // Offerwall: always recompute from source tables so Zerads clicks are never dropped
                // when TournamentAction / Engine V2 missed a callback.
                if (OFFERWALL_SOURCE_METRICS.has(tournament.metric)) {
                    await computeScoresForTournament(tournament);
                    continue;
                }
                if (OUTBOX_METRICS.has(tournament.metric) ||
                    (isTournamentIncrementalScoringEnabled() && INCREMENTAL_METRICS.has(tournament.metric))) {
                    continue;
                }
                // HASHRATE / CHECKINS / FAUCET / SHORTLINK / AUTO_MINING / etc. — batch recompute
                await computeScoresForTournament(tournament);
            }
            catch (err) {
                log.error(`[tournaments] score update failed for #${tournament.id}:`, {
                    error: String(err),
                });
            }
        }
    }
    catch (err) {
        log.error("[tournaments] score updater error:", { error: String(err) });
    }
}
async function runShadowValidation() {
    try {
        const reports = await runOfferwallShadowValidation();
        const drift = reports.filter((r) => r.driftCount > 0);
        if (drift.length > 0) {
            log.warn(`[tournaments] shadow validation drift in ${drift.length} offerwall tournament(s) (stub)`);
        }
    }
    catch (err) {
        log.error("[tournaments] shadow validation error:", { error: String(err) });
    }
}
async function runReconcile() {
    try {
        const reports = await reconcileAllActive();
        const withDrift = reports.filter((r) => r.driftCount > 0);
        const corrected = withDrift.filter((r) => r.corrected > 0);
        const detectedOnly = withDrift.filter((r) => r.corrected === 0);
        if (corrected.length > 0) {
            log.warn(`[tournaments] reconcile auto-corrected drift in ${corrected.length} deposit tournament(s)`);
        }
        if (detectedOnly.length > 0) {
            log.warn(`[tournaments] reconcile detected drift in ${detectedOnly.length} tournament(s) (no auto-fix)`);
        }
        const active = await prisma.tournament.findMany({ where: { status: "ACTIVE" } });
        for (const t of active) {
            if (!INCREMENTAL_METRICS.has(t.metric) && !OUTBOX_METRICS.has(t.metric)) {
                await reconcileLegacyBatchTournament(t.id);
            }
        }
    }
    catch (err) {
        log.error("[tournaments] reconcile error:", { error: String(err) });
    }
}
async function runLifecycleManager() {
    const now = new Date();
    try {
        const toActivate = await prisma.tournament.findMany({
            where: { status: "SCHEDULED", startsAt: { lte: now } },
        });
        for (const t of toActivate) {
            await prisma.tournament.update({ where: { id: t.id }, data: { status: "ACTIVE" } });
            log.info(`[tournaments] activated tournament #${t.id} "${t.name}"`);
            if (t.metric === "MINIGAME_WINS") {
                void backfillMinigameTournamentFromLogs(t.id).catch((err) => {
                    log.error(`[tournaments] minigame backfill on activate #${t.id}:`, {
                        error: String(err),
                    });
                });
            }
        }
        const toFinalize = await prisma.tournament.findMany({
            where: { status: "ACTIVE", endsAt: { lte: now } },
        });
        for (const t of toFinalize) {
            try {
                const { ranked, rewarded } = await finalizeTournament(t.id);
                log.info(`[tournaments] finalized #${t.id} "${t.name}" — ${ranked} ranked, ${rewarded} rewarded`);
            }
            catch (err) {
                log.error(`[tournaments] finalization failed for #${t.id}:`, { error: String(err) });
            }
        }
    }
    catch (err) {
        log.error("[tournaments] lifecycle manager error:", { error: String(err) });
    }
}
