import test from "node:test";
import assert from "node:assert/strict";
import { isTournamentCronEnabled } from "../../server/modules/tournaments/tournaments.flags.ts";

function withEnv(value, fn) {
  const prev = process.env.TOURNAMENT_CRON_ENABLED;
  if (value === undefined) delete process.env.TOURNAMENT_CRON_ENABLED;
  else process.env.TOURNAMENT_CRON_ENABLED = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.TOURNAMENT_CRON_ENABLED;
    else process.env.TOURNAMENT_CRON_ENABLED = prev;
  }
}

test("tournament cron runs when the flag is unset (production default)", () => {
  withEnv(undefined, () => assert.equal(isTournamentCronEnabled(), true));
  withEnv("", () => assert.equal(isTournamentCronEnabled(), true));
  withEnv("1", () => assert.equal(isTournamentCronEnabled(), true));
});

test("tournament cron is off only when explicitly disabled", () => {
  for (const v of ["0", "false", "no", " FALSE "]) {
    withEnv(v, () => assert.equal(isTournamentCronEnabled(), false, v));
  }
});
