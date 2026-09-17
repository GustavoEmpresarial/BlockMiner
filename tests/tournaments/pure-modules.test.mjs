/**
 * Unit coverage for every dependency-free module in the tournaments package:
 * helpers, feature flags, deposit presentation, UTC windows, providers and the
 * pure functions in types.
 *
 * No Prisma, no Redis, no HTTP — these run anywhere.
 *
 * Every import is in the ONE top-level await below. Do not add another
 * `await import(...)` further down: node:test starts running at the first tick
 * of the event loop, and a mid-file top-level await registers everything after
 * it too late — those tests never execute and are still reported as passing.
 */
import test from "node:test";
import assert from "node:assert/strict";

const BASE = "../../server/modules/tournaments";

const [helpers, flags, presentation, windows, providers, types] = await Promise.all([
  import(`${BASE}/tournaments.helpers.ts`),
  import(`${BASE}/tournaments.flags.ts`),
  import(`${BASE}/deposit-presentation.ts`),
  import(`${BASE}/tournament-window.ts`),
  import(`${BASE}/tournaments.providers.ts`),
  import(`${BASE}/tournaments.types.ts`),
]);

// ─── tournaments.helpers ─────────────────────────────────────────────────────

test("isDepositMetric accepts exactly the two deposit metrics", () => {
  assert.equal(helpers.isDepositMetric("DEPOSITS_POL"), true);
  assert.equal(helpers.isDepositMetric("DEPOSITS_USD"), true);
  for (const other of ["HASHRATE", "BLOCKS_MINED", "deposits_pol", "", "DEPOSITS"]) {
    assert.equal(helpers.isDepositMetric(other), false, `${other} must not count as a deposit metric`);
  }
});

test("depositScoreMismatch uses a coarser epsilon for USD than for POL", () => {
  // USD tolerates a cent; POL is tracked four decimals deep.
  assert.equal(helpers.depositScoreMismatch(100, 100.009, "DEPOSITS_USD"), false);
  assert.equal(helpers.depositScoreMismatch(100, 100.02, "DEPOSITS_USD"), true);

  assert.equal(helpers.depositScoreMismatch(100, 100.00009, "DEPOSITS_POL"), false);
  assert.equal(helpers.depositScoreMismatch(100, 100.001, "DEPOSITS_POL"), true);
});

test("depositScoreMismatch is symmetric — drift in either direction counts", () => {
  assert.equal(helpers.depositScoreMismatch(100.02, 100, "DEPOSITS_USD"), true);
  assert.equal(helpers.depositScoreMismatch(100, 100.02, "DEPOSITS_USD"), true);
});

test("depositScoreMismatch treats an exactly-epsilon gap as a match", () => {
  // Strictly greater-than: the boundary itself is not drift.
  assert.equal(helpers.depositScoreMismatch(0, 0.01, "DEPOSITS_USD"), false);
  assert.equal(helpers.depositScoreMismatch(0, 0.0001, "DEPOSITS_POL"), false);
});

// ─── tournaments.flags ───────────────────────────────────────────────────────

/** Flags read process.env at call time, so each case restores what it touched. */
function withEnv(vars, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("engine V2 flag accepts 1/true/yes and nothing else", () => {
  for (const on of ["1", "true", "yes", "TRUE", "  Yes  "]) {
    withEnv({ TOURNAMENT_ENGINE_V2: on }, () => {
      assert.equal(flags.isTournamentEngineV2Enabled(), true, `${JSON.stringify(on)} should enable`);
    });
  }
  for (const off of ["0", "false", "no", "", "on", undefined]) {
    withEnv({ TOURNAMENT_ENGINE_V2: off }, () => {
      assert.equal(
        flags.isTournamentEngineV2Enabled(),
        false,
        `${JSON.stringify(off)} should not enable`,
      );
    });
  }
});

test("skip-get-recompute is always on (public GET never recomputes)", () => {
  withEnv({ TOURNAMENT_ENGINE_V2: "1", TOURNAMENT_SKIP_GET_RECOMPUTE: "false" }, () => {
    assert.equal(flags.isTournamentSkipGetRecomputeEnabled(), true);
  });
  withEnv({ TOURNAMENT_ENGINE_V2: "0", TOURNAMENT_SKIP_GET_RECOMPUTE: "0" }, () => {
    assert.equal(flags.isTournamentSkipGetRecomputeEnabled(), true);
  });
  withEnv({ TOURNAMENT_ENGINE_V2: "0", TOURNAMENT_SKIP_GET_RECOMPUTE: undefined }, () => {
    assert.equal(flags.isTournamentSkipGetRecomputeEnabled(), true);
  });
});

test("incremental scoring tracks the engine V2 flag exactly", () => {
  withEnv({ TOURNAMENT_ENGINE_V2: "true" }, () => {
    assert.equal(flags.isTournamentIncrementalScoringEnabled(), true);
  });
  withEnv({ TOURNAMENT_ENGINE_V2: undefined }, () => {
    assert.equal(flags.isTournamentIncrementalScoringEnabled(), false);
  });
});

test("offerwall autocorrect is off unless explicitly enabled", () => {
  // It rewrites the live ranking of tournaments that pay prizes, so the default
  // matters more than usual.
  withEnv({ TOURNAMENT_OFFERWALL_AUTOCORRECT: undefined }, () => {
    assert.equal(flags.isOfferwallAutocorrectEnabled(), false);
  });
  withEnv({ TOURNAMENT_OFFERWALL_AUTOCORRECT: "1" }, () => {
    assert.equal(flags.isOfferwallAutocorrectEnabled(), true);
  });
});

// ─── deposit-presentation ────────────────────────────────────────────────────

test("depositRankingUnit maps USD to usd and everything else to pol_legacy", () => {
  assert.equal(presentation.depositRankingUnit("DEPOSITS_USD"), "usd");
  assert.equal(presentation.depositRankingUnit("DEPOSITS_POL"), "pol_legacy");
  assert.equal(presentation.depositRankingUnit("HASHRATE"), "pol_legacy");
});

test("isDepositTournamentMetric matches the helpers version", () => {
  assert.equal(presentation.isDepositTournamentMetric("DEPOSITS_USD"), true);
  assert.equal(presentation.isDepositTournamentMetric("DEPOSITS_POL"), true);
  assert.equal(presentation.isDepositTournamentMetric("BLOCKS_MINED"), false);
});

test("normalizeDepositSummary returns null for missing raw input", () => {
  assert.equal(presentation.normalizeDepositSummary("DEPOSITS_USD", null), null);
  assert.equal(presentation.normalizeDepositSummary("DEPOSITS_USD", undefined), null);
});

test("normalizeDepositSummary coerces every numeric field and defaults to 0", () => {
  const out = presentation.normalizeDepositSummary("DEPOSITS_POL", {});
  assert.deepEqual(out, {
    rankingUnit: "pol_legacy",
    totalPol: 0,
    totalUsd: null,
    txCount: 0,
    participantCount: 0,
    largestDepositPol: 0,
    largestDepositUsd: null,
    remainderPol: 0,
    remainderUsd: null,
    remainderTxCount: 0,
  });
});

test("normalizeDepositSummary keeps USD fields null rather than coercing null to 0", () => {
  // null and 0 mean different things here: "no USD figure" vs "zero dollars".
  const out = presentation.normalizeDepositSummary("DEPOSITS_USD", {
    totalPol: "12.5",
    totalUsd: null,
    largestDepositPol: "3",
    largestDepositUsd: 0,
    remainderPol: "0.25",
    remainderUsd: null,
    txCount: "4",
    participantCount: 2,
    remainderTxCount: "1",
  });
  assert.equal(out.rankingUnit, "usd");
  assert.equal(out.totalPol, 12.5);
  assert.equal(out.totalUsd, null, "null USD must stay null");
  assert.equal(out.largestDepositUsd, 0, "an explicit 0 must survive as 0");
  assert.equal(out.txCount, 4);
  assert.equal(out.remainderTxCount, 1);
});

// ─── tournament-window ───────────────────────────────────────────────────────

test("utcWeekStart snaps to Monday 00:00 UTC", () => {
  // 2026-09-17 is a Thursday.
  const monday = windows.utcWeekStart(new Date("2026-09-17T13:45:00.000Z"));
  assert.equal(monday.toISOString(), "2026-09-14T00:00:00.000Z");
});

test("utcWeekStart on a Sunday goes back six days, not forward", () => {
  // Sunday is day 0; the naive (dow - 1) would jump to the wrong week.
  const monday = windows.utcWeekStart(new Date("2026-09-20T23:59:59.999Z"));
  assert.equal(monday.toISOString(), "2026-09-14T00:00:00.000Z");
});

test("utcWeekStart on a Monday is idempotent", () => {
  const monday = windows.utcWeekStart(new Date("2026-09-14T00:00:00.000Z"));
  assert.equal(monday.toISOString(), "2026-09-14T00:00:00.000Z");
});

test("utcMonthStart and utcMonthEnd bracket the calendar month", () => {
  const start = windows.utcMonthStart(new Date("2026-09-17T13:45:00.000Z"));
  assert.equal(start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(windows.utcMonthEnd(start).toISOString(), "2026-10-01T00:00:00.000Z");
});

test("utcMonthEnd rolls the year over in December", () => {
  const start = windows.utcMonthStart(new Date("2026-12-31T23:00:00.000Z"));
  assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(windows.utcMonthEnd(start).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("utcMonthEnd handles a leap February", () => {
  const start = windows.utcMonthStart(new Date("2028-02-10T00:00:00.000Z"));
  assert.equal(windows.utcMonthEnd(start).toISOString(), "2028-03-01T00:00:00.000Z");
});

test("snapWindowForType covers DAILY, WEEKLY and MONTHLY", () => {
  const anchor = new Date("2026-09-17T13:45:00.000Z");

  const daily = windows.snapWindowForType("DAILY", anchor);
  assert.equal(daily.start.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(daily.end.toISOString(), "2026-09-18T00:00:00.000Z");

  const weekly = windows.snapWindowForType("WEEKLY", anchor);
  assert.equal(weekly.start.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(weekly.end.toISOString(), "2026-09-21T00:00:00.000Z");

  const monthly = windows.snapWindowForType("MONTHLY", anchor);
  assert.equal(monthly.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(monthly.end.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("snapWindowForType returns null for CUSTOM and unknown types", () => {
  // CUSTOM windows are author-defined, so there is nothing canonical to snap to.
  const anchor = new Date("2026-09-17T13:45:00.000Z");
  assert.equal(windows.snapWindowForType("CUSTOM", anchor), null);
  assert.equal(windows.snapWindowForType("YEARLY", anchor), null);
  assert.equal(windows.snapWindowForType(undefined, anchor), null);
});

test("snapWindowForActiveTournament snaps to startsAt, never to now", () => {
  // Snapping an ACTIVE DAILY tournament to `now` slides its window forward and
  // skips finalize/payout for the cycle that just ended.
  const startsAt = new Date("2026-09-10T00:00:00.000Z");
  const now = new Date("2026-09-17T13:45:00.000Z");
  const snap = windows.snapWindowForActiveTournament("DAILY", startsAt, null, now);
  assert.equal(snap.start.toISOString(), "2026-09-10T00:00:00.000Z");
  assert.equal(snap.end.toISOString(), "2026-09-11T00:00:00.000Z");
});

// ─── tournaments.providers ───────────────────────────────────────────────────

test("providersForOfferwallMetric returns the right provider set per metric", () => {
  assert.deepEqual(providers.providersForOfferwallMetric("OFFERS_INTERNAL"), ["internal"]);
  assert.equal(providers.providersForOfferwallMetric("OFFERS_EXTERNAL").length, 5);
  assert.equal(providers.providersForOfferwallMetric("OFFERS_ALL").length, 6);
  assert.deepEqual(providers.providersForOfferwallMetric("MINIGAME_WINS"), ["minigame"]);
});

test("providersForOfferwallMetric returns an empty list for unknown metrics", () => {
  assert.deepEqual(providers.providersForOfferwallMetric("HASHRATE"), []);
  assert.deepEqual(providers.providersForOfferwallMetric(""), []);
});

test("OFFERS_INTERNAL does not accept external providers", () => {
  // The whole point of splitting internal from external is that a Zerads
  // callback must not score an internal-only tournament.
  assert.equal(providers.providerAllowedForMetric("internal", "OFFERS_INTERNAL"), true);
  assert.equal(providers.providerAllowedForMetric("zerads", "OFFERS_INTERNAL"), false);
  assert.equal(providers.providerAllowedForMetric("zerads", "OFFERS_EXTERNAL"), true);
  assert.equal(providers.providerAllowedForMetric("internal", "OFFERS_EXTERNAL"), false);
  assert.equal(providers.providerAllowedForMetric("zerads", "OFFERS_ALL"), true);
  assert.equal(providers.providerAllowedForMetric("internal", "OFFERS_ALL"), true);
});

test("providerAllowedForMetric refuses an unknown metric outright", () => {
  assert.equal(providers.providerAllowedForMetric("internal", "NOPE"), false);
});

test("ACTION_INCREMENTAL_METRICS is the union of every incremental family", () => {
  const union = [
    ...providers.OFFERS_INCREMENTAL_METRICS,
    ...providers.MINIGAME_INCREMENTAL_METRICS,
    ...providers.FAUCET_INCREMENTAL_METRICS,
    ...providers.SHORTLINK_INCREMENTAL_METRICS,
    ...providers.AUTO_MINING_INCREMENTAL_METRICS,
  ];
  assert.deepEqual([...providers.ACTION_INCREMENTAL_METRICS], union);
  assert.equal(new Set(union).size, union.length, "a metric is listed in two families");
});

test("contributionSourceId namespaces the source by provider", () => {
  // Two providers can hand over the same sourceId; without the prefix they
  // would dedupe against each other.
  assert.equal(providers.contributionSourceId("zerads", "abc"), "zerads:abc");
  assert.notEqual(
    providers.contributionSourceId("zerads", "abc"),
    providers.contributionSourceId("moneyrain", "abc"),
  );
});

// ─── tournaments.types (pure functions) ──────────────────────────────────────

const window = {
  startsAt: new Date("2026-09-01T00:00:00.000Z"),
  endsAt: new Date("2026-10-01T00:00:00.000Z"),
};

test("windowContains is inclusive on both ends", () => {
  assert.equal(types.windowContains(window, window.startsAt), true);
  assert.equal(types.windowContains(window, window.endsAt), true);
});

test("windowContains rejects events outside the window", () => {
  assert.equal(types.windowContains(window, new Date("2026-08-31T23:59:59.999Z")), false);
  assert.equal(types.windowContains(window, new Date("2026-10-01T00:00:00.001Z")), false);
});

test("windowContains clamps to upperBound when it falls inside the window", () => {
  // This is how a still-running tournament scores only up to "now".
  const upper = new Date("2026-09-15T00:00:00.000Z");
  assert.equal(types.windowContains(window, new Date("2026-09-10T00:00:00.000Z"), upper), true);
  assert.equal(types.windowContains(window, new Date("2026-09-20T00:00:00.000Z"), upper), false);
  assert.equal(types.windowContains(window, upper, upper), true);
});

test("windowContains ignores an upperBound past the window end", () => {
  const upper = new Date("2027-01-01T00:00:00.000Z");
  assert.equal(types.windowContains(window, new Date("2026-10-05T00:00:00.000Z"), upper), false);
});

test("idempotency keys are distinct per event family and stable", () => {
  assert.equal(types.tournamentActionIdempotencyKey("zerads", "a1"), "tournament_action:zerads:a1");
  assert.equal(types.depositConfirmedIdempotencyKey(77), "deposit_confirmed:77");
  assert.equal(types.miningBlockSettledIdempotencyKey(1234), "mining_block_settled:1234");

  const all = new Set([
    types.tournamentActionIdempotencyKey("zerads", "1"),
    types.depositConfirmedIdempotencyKey(1),
    types.miningBlockSettledIdempotencyKey(1),
  ]);
  assert.equal(all.size, 3, "two event families collide on the same idempotency key");
});

test("event name constants are the strings the outbox matches on", () => {
  assert.equal(types.TOURNAMENT_EVENT_ACTION_RECORDED, "tournament_action_recorded");
  assert.equal(types.TOURNAMENT_EVENT_DEPOSIT_CONFIRMED, "deposit_confirmed");
  assert.equal(types.TOURNAMENT_EVENT_BLOCK_MINED, "mining_block_settled");
});

test("tournamentActionOutboxPayload stringifies a bigint id and ISO-formats the date", () => {
  const payload = types.tournamentActionOutboxPayload({
    id: 9007199254740993n, // beyond Number.MAX_SAFE_INTEGER — must not lose precision
    userId: 5,
    provider: "zerads",
    actionCount: 2,
    executedAtUTC: new Date("2026-09-17T13:45:00.000Z"),
    sourceId: "s1",
    tournamentEligible: true,
    metadata: { campaign: "x" },
  });
  assert.equal(payload.actionId, "9007199254740993");
  assert.equal(payload.executedAtUTC, "2026-09-17T13:45:00.000Z");
  assert.deepEqual(payload.metadata, { campaign: "x" });
});

test("tournamentActionOutboxPayload normalizes non-object metadata to null", () => {
  // An array or scalar would break consumers expecting a record.
  const base = {
    id: 1,
    userId: 5,
    provider: "internal",
    actionCount: 1,
    executedAtUTC: new Date("2026-09-17T00:00:00.000Z"),
    sourceId: "s",
    tournamentEligible: false,
  };
  for (const metadata of [undefined, null, [1, 2], "str", 42]) {
    const payload = types.tournamentActionOutboxPayload({ ...base, metadata });
    assert.equal(payload.metadata, null, `metadata ${JSON.stringify(metadata)} should normalize to null`);
  }
});

// ─── Remaining branch edges ──────────────────────────────────────────────────

test("skip-get-recompute stays on regardless of env spelling", () => {
  for (const on of ["1", "true", "yes", "0", "false", undefined]) {
    withEnv({ TOURNAMENT_ENGINE_V2: "0", TOURNAMENT_SKIP_GET_RECOMPUTE: on }, () => {
      assert.equal(flags.isTournamentSkipGetRecomputeEnabled(), true, `${on} still skips`);
    });
  }
});

test("offerwall autocorrect accepts every truthy spelling", () => {
  for (const on of ["1", "true", "yes"]) {
    withEnv({ TOURNAMENT_OFFERWALL_AUTOCORRECT: on }, () => {
      assert.equal(flags.isOfferwallAutocorrectEnabled(), true);
    });
  }
});

test("normalizeDepositSummary keeps every USD field when all are present", () => {
  // Complements the null case above: exercises the other side of each
  // `!= null` ternary.
  const out = presentation.normalizeDepositSummary("DEPOSITS_USD", {
    totalPol: 10,
    totalUsd: 25.5,
    largestDepositPol: 4,
    largestDepositUsd: 9.75,
    remainderPol: 1,
    remainderUsd: 2.25,
    txCount: 3,
    participantCount: 1,
    remainderTxCount: 2,
  });
  assert.equal(out.totalUsd, 25.5);
  assert.equal(out.largestDepositUsd, 9.75);
  assert.equal(out.remainderUsd, 2.25);
});

test("normalizeDepositSummary coerces numeric strings on the POL side", () => {
  const out = presentation.normalizeDepositSummary("DEPOSITS_POL", {
    totalPol: "7.5",
    largestDepositPol: "2.25",
    remainderPol: "0.5",
  });
  assert.equal(out.totalPol, 7.5);
  assert.equal(out.largestDepositPol, 2.25);
  assert.equal(out.remainderPol, 0.5);
  assert.equal(out.totalUsd, null);
});
