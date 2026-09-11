import test from "node:test";
import assert from "node:assert/strict";

const { scoringConfigPayload, formatUtcWindowLabel, ZERADS_SCORING_MODE } = await import(
  "../../server/modules/tournaments/tournaments.scoring-config.ts"
);
const { ZERADS_MAX_CLICKS_PER_UTC_DAY } = await import("../../server/modules/zerads/index.ts");
const { countsForDepositTournament } = await import(
  "../../server/modules/tournaments/deposit-score.ts"
);
const { buildRankingRows } = await import("../../server/modules/tournaments/ranking.hashrate.ts");
const {
  resolveTournamentOutboxDispatch,
  tournamentOutboxRetryDecision,
  isTournamentOutboxLeaseExpired,
} = await import("../../server/modules/tournaments/tournaments.outbox.ts");
const {
  tournamentActionIdempotencyKey,
  TOURNAMENT_EVENT_ACTION_RECORDED,
  TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
  TOURNAMENT_EVENT_BLOCK_MINED,
} = await import("../../server/modules/tournaments/tournaments.types.ts");

test("scoringConfigPayload — exposes zerads caps from zerads module", () => {
  const cfg = scoringConfigPayload();
  assert.equal(cfg.zeradsMode, ZERADS_SCORING_MODE);
  assert.equal(cfg.zeradsMaxPerUtcDay, ZERADS_MAX_CLICKS_PER_UTC_DAY);
  assert.equal(cfg.zeradsMaxPerBrtDay, ZERADS_MAX_CLICKS_PER_UTC_DAY);
  assert.equal(cfg.zeradsMaxPerWindow, ZERADS_MAX_CLICKS_PER_UTC_DAY);
});

test("formatUtcWindowLabel — formats ISO-ish UTC labels", () => {
  const start = new Date("2026-08-01T00:00:00.000Z");
  const end = new Date("2026-08-02T00:00:00.000Z");
  const label = formatUtcWindowLabel(start, end);
  assert.match(label.start, /UTC$/);
  assert.match(label.end, /UTC$/);
  assert.ok(label.start.includes("2026-08-01"));
});

test("countsForDepositTournament — includes all sources including hd_deposit", () => {
  assert.equal(countsForDepositTournament(null), true);
  assert.equal(countsForDepositTournament(JSON.stringify({ source: "contract" })), true);
  assert.equal(countsForDepositTournament(JSON.stringify({ source: "hd_deposit" })), true);
  assert.equal(countsForDepositTournament(JSON.stringify({ source: "treasury" })), true);
  assert.equal(countsForDepositTournament("not-json"), true);
});

test("buildRankingRows — sorts by totalHashRate desc", () => {
  const rows = buildRankingRows([
    {
      id: 1,
      username: "a",
      miners: [{ hashRate: 10, isActive: true }],
      gamePowers: [],
      ytPowers: [],
      gpuAccess: [],
    },
    {
      id: 2,
      username: "b",
      miners: [{ hashRate: 50, isActive: true }],
      gamePowers: [],
      ytPowers: [],
      gpuAccess: [],
    },
  ]);
  assert.equal(rows[0].id, 2);
  assert.equal(rows[0].totalHashRate, 50);
  assert.equal(rows[1].id, 1);
});

test("outbox dispatch resolver — known event types", () => {
  assert.equal(resolveTournamentOutboxDispatch(TOURNAMENT_EVENT_DEPOSIT_CONFIRMED), "deposit_confirmed");
  assert.equal(resolveTournamentOutboxDispatch(TOURNAMENT_EVENT_ACTION_RECORDED), "action_recorded");
  assert.equal(resolveTournamentOutboxDispatch(TOURNAMENT_EVENT_BLOCK_MINED), "block_mined");
  assert.equal(resolveTournamentOutboxDispatch("unknown"), null);
});

test("outbox retry / lease helpers", () => {
  assert.equal(tournamentOutboxRetryDecision(9).exhausted, false);
  assert.equal(tournamentOutboxRetryDecision(10).exhausted, true);
  const now = new Date("2026-08-08T12:00:00.000Z");
  const fresh = new Date("2026-08-08T11:59:00.000Z");
  const stale = new Date("2026-08-08T10:00:00.000Z");
  assert.equal(isTournamentOutboxLeaseExpired(fresh, now, 30 * 60 * 1000), false);
  assert.equal(isTournamentOutboxLeaseExpired(stale, now, 30 * 60 * 1000), true);
});

test("tournamentActionIdempotencyKey", () => {
  assert.equal(tournamentActionIdempotencyKey("zerads", "abc"), "tournament_action:zerads:abc");
});

test("index exports critical public API", async () => {
  const mod = await import("../../server/modules/tournaments/index.ts");
  assert.ok(mod.tournamentsRouter);
  assert.ok(mod.tournamentsAdminRouter);
  assert.ok(mod.adminTournamentsRouter);
  assert.ok(mod.rankingRouter);
  assert.equal(typeof mod.recordTournamentAction, "function");
  assert.ok(mod.TOURNAMENT_ACTION_PROVIDER);
  assert.equal(typeof mod.scoringConfigPayload, "function");
  assert.equal(typeof mod.startTournamentsCron, "function");
  assert.equal(typeof mod.isTournamentIncrementalScoringEnabled, "function");
  assert.equal(typeof mod.countsForDepositTournament, "function");
});
