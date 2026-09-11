import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTournamentValidMetric,
  TOURNAMENT_VALID_METRICS,
} from "../../server/modules/tournaments/tournaments.valid-metrics.ts";
import { ClaimCountMetricScorer } from "../../server/modules/tournaments/tournaments.claim-scorers.ts";
import {
  TOURNAMENT_ACTION_PROVIDER,
  providerAllowedForMetric,
} from "../../server/modules/tournaments/tournaments.providers.ts";

describe("tournament valid metrics", () => {
  it("includes FAUCET, SHORTLINK, AUTO_MINING", () => {
    assert.ok(TOURNAMENT_VALID_METRICS.includes("FAUCET"));
    assert.ok(TOURNAMENT_VALID_METRICS.includes("SHORTLINK"));
    assert.ok(TOURNAMENT_VALID_METRICS.includes("AUTO_MINING"));
    assert.equal(isTournamentValidMetric("FAUCET"), true);
    assert.equal(isTournamentValidMetric("SHORTLINK"), true);
    assert.equal(isTournamentValidMetric("AUTO_MINING"), true);
    assert.equal(isTournamentValidMetric("NOT_A_METRIC"), false);
  });
});

describe("claim-count scorers", () => {
  it("onTournamentAction awards 1 for faucet claim in window", () => {
    const scorer = new ClaimCountMetricScorer("FAUCET", TOURNAMENT_ACTION_PROVIDER.FAUCET);
    const startsAt = new Date("2026-08-31T00:00:00Z");
    const endsAt = new Date("2026-08-31T23:59:59Z");
    const tournament = {
      id: 1,
      name: "Daily Faucet",
      metric: "FAUCET",
      startsAt,
      endsAt,
      status: "ACTIVE",
    };
    const delta = scorer.onTournamentAction(
      {
        actionId: "1",
        userId: 42,
        provider: TOURNAMENT_ACTION_PROVIDER.FAUCET,
        actionCount: 1,
        executedAtUTC: "2026-08-31T12:00:00.000Z",
        sourceId: "faucet:42:2026-08-31:x",
        tournamentEligible: true,
        metadata: null,
      },
      tournament,
    );
    assert.ok(delta);
    assert.equal(delta.userId, 42);
    assert.equal(delta.metricValue, 1);
  });

  it("providerAllowedForMetric gates claim providers", () => {
    assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.FAUCET, "FAUCET"), true);
    assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.MINIGAME, "FAUCET"), false);
    assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.SHORTLINK, "SHORTLINK"), true);
    assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.AUTO_MINING, "AUTO_MINING"), true);
  });
});
