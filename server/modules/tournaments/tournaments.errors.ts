/**
 * Stable error codes for the tournament prize/finalization path.
 *
 * These are contract, not copy: they are logged verbatim and support quotes
 * them back. Never rename one to "make a log read better" — add a new code.
 */

export const TOURNAMENT_ERROR = {
  /** Prize row carries a missing, zero or negative amount for its prizeType. */
  PRIZE_INVALID_AMOUNT: "TOURNAMENT_PRIZE_INVALID_AMOUNT",
  /** MACHINE prize whose miner catalog row was deleted or never joined. */
  PRIZE_MINER_MISSING: "TOURNAMENT_PRIZE_MINER_MISSING",
  /** prizeType outside the supported set (POL / BLK / MINING_BOOST / MACHINE). */
  PRIZE_UNSUPPORTED_TYPE: "TOURNAMENT_PRIZE_UNSUPPORTED_TYPE",
  /** A single winner's grant threw; its claim was rolled back and stays retryable. */
  GRANT_FAILED: "TOURNAMENT_GRANT_FAILED",
  /** Tournament closed with at least one winner left ungranted. */
  FINALIZE_PARTIAL: "TOURNAMENT_FINALIZE_PARTIAL",
  /** A recurring tournament closed but its next cycle could not be created. */
  RECURRING_SPAWN_FAILED: "TOURNAMENT_RECURRING_SPAWN_FAILED",
  /** The lifecycle cron tick failed before it reached any tournament. */
  LIFECYCLE_TICK_FAILED: "TOURNAMENT_LIFECYCLE_TICK_FAILED",

  // ── Cron ticks ────────────────────────────────────────────────────────────
  /** Batch score recompute failed for one specific tournament; the others continue. */
  SCORE_UPDATE_FAILED: "TOURNAMENT_SCORE_UPDATE_FAILED",
  /** The score updater tick failed before it reached any tournament. */
  SCORE_UPDATER_TICK_FAILED: "TOURNAMENT_SCORE_UPDATER_TICK_FAILED",
  /** The drift reconcile tick failed. */
  RECONCILE_TICK_FAILED: "TOURNAMENT_RECONCILE_TICK_FAILED",
  /** The outbox drain failed — BLOCKS_MINED scores stop advancing until it recovers. */
  OUTBOX_TICK_FAILED: "TOURNAMENT_OUTBOX_TICK_FAILED",
  /** Realigning active tournament windows to their UTC boundaries failed. */
  WINDOW_ALIGN_FAILED: "TOURNAMENT_WINDOW_ALIGN_FAILED",
  /** Rebuilding a MINIGAME_WINS tournament from game logs failed. */
  MINIGAME_BACKFILL_FAILED: "TOURNAMENT_MINIGAME_BACKFILL_FAILED",

  // ── Read path (HTTP controller) ───────────────────────────────────────────
  // These exist because every controller catch used to be `catch {}` — the 500
  // went out with no log line at all, so a broken tournament page was entirely
  // invisible in production. One code per endpoint keeps the fingerprints
  // distinct, which is what makes "only /:id is failing" readable in a log.
  /** GET /api/tournaments — the active tournament list could not be built. */
  LIST_FAILED: "TOURNAMENT_LIST_FAILED",
  /** GET /api/tournaments/:id — tournament + leaderboard could not be loaded. */
  DETAIL_FAILED: "TOURNAMENT_DETAIL_FAILED",
  /** GET /api/tournaments/:id/my-rank — the caller's own rank could not be read. */
  MY_RANK_FAILED: "TOURNAMENT_MY_RANK_FAILED",
  /** GET /api/tournaments/my-history — the caller's entry history could not be read. */
  MY_HISTORY_FAILED: "TOURNAMENT_MY_HISTORY_FAILED",
  /** GET /api/tournaments/:id/my-score-breakdown — per-metric breakdown failed. */
  MY_SCORE_BREAKDOWN_FAILED: "TOURNAMENT_MY_SCORE_BREAKDOWN_FAILED",
} as const;

export type TournamentErrorCode = (typeof TOURNAMENT_ERROR)[keyof typeof TOURNAMENT_ERROR];
