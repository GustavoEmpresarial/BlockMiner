/** Canonical whitelist for admin create/update tournament metric. */
export const TOURNAMENT_VALID_METRICS = [
  "HASHRATE",
  "BLOCKS_MINED",
  "CHECKINS",
  "TASKS_COMPLETED",
  "DEPOSITS_POL",
  "DEPOSITS_USD",
  "OFFERS_INTERNAL",
  "OFFERS_EXTERNAL",
  "OFFERS_ALL",
  "MINIGAME_WINS",
  "FAUCET",
  "SHORTLINK",
  "AUTO_MINING",
] as const;

export type TournamentValidMetric = (typeof TOURNAMENT_VALID_METRICS)[number];

export function isTournamentValidMetric(value: unknown): value is TournamentValidMetric {
  return typeof value === "string" && (TOURNAMENT_VALID_METRICS as readonly string[]).includes(value);
}
