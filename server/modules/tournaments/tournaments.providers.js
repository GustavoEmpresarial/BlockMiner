/** Normalized action providers — integrations map callbacks to these values only. */
export const TOURNAMENT_ACTION_PROVIDER = {
    INTERNAL: "internal",
    OFFERWALLME: "offerwallme",
    ZERADS: "zerads",
    MONEYRAIN: "moneyrain",
    MULTIWALL: "multiwall",
    OFFERWALLGG: "offerwallgg",
    MINIGAME: "minigame",
    FAUCET: "faucet",
    SHORTLINK: "shortlink",
    AUTO_MINING: "auto_mining",
};
export const OFFERS_INCREMENTAL_METRICS = [
    "OFFERS_INTERNAL",
    "OFFERS_EXTERNAL",
    "OFFERS_ALL",
];
export const MINIGAME_INCREMENTAL_METRICS = ["MINIGAME_WINS"];
export const FAUCET_INCREMENTAL_METRICS = ["FAUCET"];
export const SHORTLINK_INCREMENTAL_METRICS = ["SHORTLINK"];
export const AUTO_MINING_INCREMENTAL_METRICS = ["AUTO_MINING"];
export const ACTION_INCREMENTAL_METRICS = [
    ...OFFERS_INCREMENTAL_METRICS,
    ...MINIGAME_INCREMENTAL_METRICS,
    ...FAUCET_INCREMENTAL_METRICS,
    ...SHORTLINK_INCREMENTAL_METRICS,
    ...AUTO_MINING_INCREMENTAL_METRICS,
];
const PROVIDERS_BY_METRIC = {
    OFFERS_INTERNAL: [TOURNAMENT_ACTION_PROVIDER.INTERNAL],
    OFFERS_EXTERNAL: [
        TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
        TOURNAMENT_ACTION_PROVIDER.ZERADS,
        TOURNAMENT_ACTION_PROVIDER.MONEYRAIN,
        TOURNAMENT_ACTION_PROVIDER.MULTIWALL,
        TOURNAMENT_ACTION_PROVIDER.OFFERWALLGG,
    ],
    OFFERS_ALL: [
        TOURNAMENT_ACTION_PROVIDER.INTERNAL,
        TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
        TOURNAMENT_ACTION_PROVIDER.ZERADS,
        TOURNAMENT_ACTION_PROVIDER.MONEYRAIN,
        TOURNAMENT_ACTION_PROVIDER.MULTIWALL,
        TOURNAMENT_ACTION_PROVIDER.OFFERWALLGG,
    ],
    MINIGAME_WINS: [TOURNAMENT_ACTION_PROVIDER.MINIGAME],
    FAUCET: [TOURNAMENT_ACTION_PROVIDER.FAUCET],
    SHORTLINK: [TOURNAMENT_ACTION_PROVIDER.SHORTLINK],
    AUTO_MINING: [TOURNAMENT_ACTION_PROVIDER.AUTO_MINING],
};
export function providersForOfferwallMetric(metric) {
    return PROVIDERS_BY_METRIC[metric] ?? [];
}
export function providerAllowedForMetric(provider, metric) {
    const allowed = PROVIDERS_BY_METRIC[metric];
    if (!allowed)
        return false;
    return allowed.includes(provider);
}
export function contributionSourceId(provider, sourceId) {
    return `${provider}:${sourceId}`;
}
