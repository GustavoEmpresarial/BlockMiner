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
];
export function isTournamentValidMetric(value) {
    return typeof value === "string" && TOURNAMENT_VALID_METRICS.includes(value);
}
