export { tournamentsRouter } from "./tournaments.routes.js";
export { tournamentsAdminRouter, adminTournamentsRouter } from "./tournaments.admin.routes.js";
export { rankingRouter } from "./ranking.routes.js";
export { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "./tournaments.actions.js";
export type { TournamentActionProvider, RecordTournamentActionInput } from "./tournaments.actions.js";
export { scoringConfigPayload } from "./tournaments.scoring-config.js";
export { startTournamentsCron } from "./tournaments.cron.js";
export { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
export { countsForDepositTournament } from "./deposit-score.js";
export {
  providersForOfferwallMetric,
  providerAllowedForMetric,
  contributionSourceId,
  OFFERS_INCREMENTAL_METRICS,
  MINIGAME_INCREMENTAL_METRICS,
} from "./tournaments.providers.js";
export {
  isTournamentEngineV2Enabled,
  isTournamentSkipGetRecomputeEnabled,
  isOfferwallAutocorrectEnabled,
} from "./tournaments.flags.js";
export { registerTournamentMetricScorers } from "./tournaments.scorers.js";
export { processTournamentOutboxBatch } from "./tournaments.outbox.js";
export { publishDepositConfirmedOutbox } from "./tournaments.repository.js";
export type { DepositConfirmedPayload } from "./tournaments.types.js";
/** Consumed by the stats module (GET /api/stats/power) for the network-hashrate breakdown +
 *  ranking, reusing the same hashrate aggregation used for HASHRATE tournament scoring. */
export {
  aggregateUserHashrates,
  buildRankingRows,
  CHECKIN_BONUS_GAME_SLUG,
  loadUsersForHashrateTournament,
  getCachedRankingRows,
} from "./ranking.hashrate.js";
export type { RankingRow } from "./ranking.hashrate.js";

/** Realtime — consumed only by core/socket/index.ts to register this module's socket handlers. */
export { registerTournamentSocketHandlers } from "./tournaments.socket.js";
export { setTournamentIo, getTournamentIo, emitTournamentUpdateNow, buildLeaderboardSlice } from "./tournaments.realtime.js";
