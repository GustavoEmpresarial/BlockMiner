import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import {
  computeScoresForTournament,
  finalizeTournament,
  alignActiveTournamentWindows,
} from "./tournaments.service.js";
import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import { reconcileAllActive, reconcileLegacyBatchTournament } from "./tournaments.engine.js";
import { backfillMinigameTournamentFromLogs } from "./tournaments.minigame-backfill.js";
import {
  OFFERS_INCREMENTAL_METRICS,
  MINIGAME_INCREMENTAL_METRICS,
} from "./tournaments.providers.js";
import { processTournamentOutboxBatch } from "./tournaments.outbox.js";
import { registerTournamentMetricScorers } from "./tournaments.scorers.js";
import { reportError } from "../../core/errors/index.js";
import { TOURNAMENT_ERROR } from "./tournaments.errors.js";
import { nonOverlapping } from "./tournaments.tick-guard.js";

const log = logger.child("tournaments.cron");

let scoreIntervalId: ReturnType<typeof setInterval> | null = null;
let lifecycleIntervalId: ReturnType<typeof setInterval> | null = null;
let outboxIntervalId: ReturnType<typeof setInterval> | null = null;
let reconcileIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Schedules `job` so a tick can never overlap the previous one — see
 * tournaments.tick-guard.ts for why every job here needs it.
 *
 * A skipped tick is logged at WARN, not reported as an error: shedding it is the
 * correct outcome. It is logged because a job that keeps skipping is running
 * longer than its own interval, which is the signal that something needs
 * attention before it becomes a stall.
 */
function guardedTick(jobName: string, job: () => Promise<void>): () => Promise<void> {
  return nonOverlapping(job, () =>
    log.warn("tournaments.cron.tick_skipped", {
      job: jobName,
      reason: "previous tick still running",
    }),
  );
}

/** Score updater interval — product copy says ~5 min; 2 min keeps boards fresher. */
const SCORE_UPDATE_INTERVAL_MS = Number(process.env.TOURNAMENT_SCORE_INTERVAL_MS || 2 * 60 * 1000);
const RECONCILE_INTERVAL_MS = Number(process.env.TOURNAMENT_RECONCILE_INTERVAL_MS || 15 * 60 * 1000);
const LIFECYCLE_INTERVAL_MS = Number(process.env.TOURNAMENT_LIFECYCLE_INTERVAL_MS || 60 * 1000);
const OUTBOX_INTERVAL_MS = Number(process.env.TOURNAMENT_OUTBOX_INTERVAL_MS || 5_000);

const INCREMENTAL_METRICS = new Set([
  "DEPOSITS_USD",
  "DEPOSITS_POL",
  ...MINIGAME_INCREMENTAL_METRICS,
]);

/** Offerwall always batch-recomputes from ZeradsCallback / offerwall.me / internal (source of truth). */
const OFFERWALL_SOURCE_METRICS = new Set<string>([...OFFERS_INCREMENTAL_METRICS]);
const OUTBOX_METRICS = new Set(["BLOCKS_MINED"]);

/**
 * The outbox drain used to be `processTournamentOutboxBatch().catch(() => {})`
 * in both call sites — a silent swallow. This job owns BLOCKS_MINED scoring, so
 * a persistent failure froze those leaderboards with no log line anywhere.
 */
async function runOutbox(): Promise<void> {
  try {
    await processTournamentOutboxBatch();
  } catch (err) {
    reportError({
      code: TOURNAMENT_ERROR.OUTBOX_TICK_FAILED,
      category: "BUSINESS",
      severity: "ERROR",
      // BLOCKS_MINED scores stall while this is down: players see a frozen board
      // and the tournament can finalize on stale scores.
      impact: "HIGH",
      module: "tournaments",
      operation: "cron.processTournamentOutboxBatch",
      error: err,
    });
  }
}

export function startTournamentsCron() {
  registerTournamentMetricScorers();

  // Built once and shared between the interval and the startup kick, so the
  // immediate run and the first tick cannot overlap each other either.
  const tickScoreUpdater = guardedTick("scoreUpdater", runScoreUpdater);
  const tickReconcile = guardedTick("reconcile", runReconcile);
  const tickOutbox = guardedTick("outbox", runOutbox);
  const tickLifecycle = guardedTick("lifecycle", runLifecycleManager);

  scoreIntervalId = setInterval(() => void tickScoreUpdater(), SCORE_UPDATE_INTERVAL_MS);

  if (isTournamentIncrementalScoringEnabled()) {
    reconcileIntervalId = setInterval(() => void tickReconcile(), RECONCILE_INTERVAL_MS);
  }

  outboxIntervalId = setInterval(() => void tickOutbox(), OUTBOX_INTERVAL_MS);

  lifecycleIntervalId = setInterval(() => void tickLifecycle(), LIFECYCLE_INTERVAL_MS);

  // Goes through the same guard as the interval, so this startup run and the
  // first scheduled tick cannot both be inside finalizeTournament at once.
  void tickLifecycle().then(() =>
    alignActiveTournamentWindows().catch((err) =>
      reportError({
        code: TOURNAMENT_ERROR.WINDOW_ALIGN_FAILED,
        category: "BUSINESS",
        severity: "ERROR",
        // Windows drifting off their UTC boundary means scores are counted over
        // the wrong period — wrong winners, not just a cosmetic label.
        impact: "HIGH",
        module: "tournaments",
        operation: "cron.alignActiveTournamentWindows",
        error: err,
      }),
    ),
  );
  void tickScoreUpdater();
  if (isTournamentIncrementalScoringEnabled()) {
    void tickReconcile();
  }
  void tickOutbox();

  return {
    stop: () => {
      if (scoreIntervalId) clearInterval(scoreIntervalId);
      if (lifecycleIntervalId) clearInterval(lifecycleIntervalId);
      if (outboxIntervalId) clearInterval(outboxIntervalId);
      if (reconcileIntervalId) clearInterval(reconcileIntervalId);
      scoreIntervalId = null;
      lifecycleIntervalId = null;
      outboxIntervalId = null;
      reconcileIntervalId = null;
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
        if (
          OUTBOX_METRICS.has(tournament.metric) ||
          (isTournamentIncrementalScoringEnabled() && INCREMENTAL_METRICS.has(tournament.metric))
        ) {
          continue;
        }
        // HASHRATE / CHECKINS / FAUCET / SHORTLINK / AUTO_MINING / etc. — batch recompute
        await computeScoresForTournament(tournament);
      } catch (err) {
        // Isolated on purpose: one tournament failing to rescore must not stop
        // the loop and freeze every other active board.
        reportError({
          code: TOURNAMENT_ERROR.SCORE_UPDATE_FAILED,
          category: "BUSINESS",
          severity: "ERROR",
          impact: "MEDIUM",
          module: "tournaments",
          operation: "cron.computeScoresForTournament",
          error: err,
          context: { tournamentId: tournament.id, metric: tournament.metric },
        });
      }
    }
  } catch (err) {
    reportError({
      code: TOURNAMENT_ERROR.SCORE_UPDATER_TICK_FAILED,
      category: "BUSINESS",
      severity: "ERROR",
      // Nothing rescores at all while this is failing: every batch-scored board
      // is frozen, not just one.
      impact: "HIGH",
      module: "tournaments",
      operation: "cron.runScoreUpdater",
      error: err,
    });
  }
}

async function runReconcile() {
  try {
    const reports = await reconcileAllActive();
    const withDrift = reports.filter((r) => r.driftCount > 0);
    const corrected = withDrift.filter((r) => r.corrected > 0);
    const detectedOnly = withDrift.filter((r) => r.corrected === 0);
    if (corrected.length > 0) {
      log.warn(
        `[tournaments] reconcile auto-corrected drift in ${corrected.length} deposit tournament(s)`,
      );
    }
    if (detectedOnly.length > 0) {
      log.warn(
        `[tournaments] reconcile detected drift in ${detectedOnly.length} tournament(s) (no auto-fix)`,
      );
    }
    const active = await prisma.tournament.findMany({ where: { status: "ACTIVE" } });
    for (const t of active) {
      if (!INCREMENTAL_METRICS.has(t.metric) && !OUTBOX_METRICS.has(t.metric)) {
        await reconcileLegacyBatchTournament(t.id);
      }
    }
  } catch (err) {
    reportError({
      code: TOURNAMENT_ERROR.RECONCILE_TICK_FAILED,
      category: "BUSINESS",
      severity: "ERROR",
      // Reconcile is the net that catches scoring drift. While it is down,
      // drift accumulates undetected and a tournament can pay on wrong scores.
      impact: "HIGH",
      module: "tournaments",
      operation: "cron.runReconcile",
      error: err,
    });
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
          // Fire-and-forget: the tournament is already ACTIVE. Without the
          // backfill it starts from zero and every win logged before activation
          // is lost from the score.
          reportError({
            code: TOURNAMENT_ERROR.MINIGAME_BACKFILL_FAILED,
            category: "BUSINESS",
            severity: "ERROR",
            impact: "HIGH",
            module: "tournaments",
            operation: "cron.backfillMinigameTournamentFromLogs",
            error: err,
            context: { tournamentId: t.id, tournamentName: t.name },
          });
        });
      }
    }

    const toFinalize = await prisma.tournament.findMany({
      where: { status: "ACTIVE", endsAt: { lte: now } },
    });
    for (const t of toFinalize) {
      const startedAt = Date.now();
      try {
        const { ranked, rewarded, failed } = await finalizeTournament(t.id);
        log.info("tournament.finalized", {
          tournamentId: t.id,
          tournamentName: t.name,
          metric: t.metric,
          ranked,
          rewarded,
          failed,
          duration_ms: Date.now() - startedAt,
        });
      } catch (err) {
        // A throw here leaves the tournament ACTIVE with endsAt in the past, so
        // this same finalize is retried every LIFECYCLE_INTERVAL_MS forever and
        // nobody in it gets paid until someone intervenes. That is CRITICAL.
        reportError({
          code: TOURNAMENT_ERROR.FINALIZE_PARTIAL,
          category: "BUSINESS",
          severity: "CRITICAL",
          impact: "CRITICAL",
          module: "tournaments",
          operation: "cron.finalizeTournament",
          error: err,
          context: {
            tournamentId: t.id,
            tournamentName: t.name,
            metric: t.metric,
            endsAt: t.endsAt,
            duration_ms: Date.now() - startedAt,
            note: "tournament stays ACTIVE and will be retried on the next tick",
          },
        });
      }
    }
  } catch (err) {
    reportError({
      code: TOURNAMENT_ERROR.LIFECYCLE_TICK_FAILED,
      category: "BUSINESS",
      severity: "ERROR",
      impact: "HIGH",
      module: "tournaments",
      operation: "cron.runLifecycleManager",
      error: err,
    });
  }
}
