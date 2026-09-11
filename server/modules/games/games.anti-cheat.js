/**
 * Ported from legacy/server/modules/games/gameAntiCheatV2.ts. Pure trust-score
 * evaluation, no DB. Wired from games.socket finishGame.
 */
export const REJECT_THRESHOLD = 30;
/** Minimum play time in ms per game slug before a win is considered valid. */
export const GAME_MIN_DURATION_MS = {
    "crypto-memory": 5_000,
    "crypto-match-3": 5_000,
    "cart-rush": 5_000,
    "sky-runner": 5_000,
};
/**
 * Max score points per second of play (server score). Above this → score_anomaly.
 * Named defaults — override via env GAME_ANTICHEAT_MAX_SCORE_PER_SEC_<SLUG> not needed;
 * keep table here so tests stay deterministic.
 */
export const GAME_MAX_SCORE_PER_SEC = {
    "crypto-memory": 8,
    "crypto-match-3": 120,
    "sky-runner": 4,
    "cart-rush": 80,
};
/** Max game:action events per rolling second (memory / match-3 / sky flap). */
export const GAME_MAX_ACTIONS_PER_SEC = 12;
const CART_TICK_MS = 200;
const CART_COIN_POINTS = 50;
const CART_MIN_MS_PER_COIN = 1_200;
const CART_ABSOLUTE_MIN_MS = 5_000;
const EVENT_DEDUCTIONS = {
    timing_below_minimum: 80,
    score_anomaly: 40,
    replay_detected: 100,
    action_flood: 50,
};
export function evaluateCartRushTrust(elapsedMs, distance, btcCount, score) {
    let trustScore = 100;
    const events = [];
    const safeElapsed = Math.max(0, elapsedMs);
    const safeDistance = Math.max(0, distance);
    const safeBtc = Math.max(0, btcCount);
    const distanceScore = Math.floor(safeDistance / 10);
    const expectedScore = distanceScore + safeBtc * CART_COIN_POINTS;
    const minFromDistance = distanceScore * CART_TICK_MS * 0.8;
    const minFromCoins = safeBtc * CART_MIN_MS_PER_COIN;
    const minRequired = Math.max(CART_ABSOLUTE_MIN_MS, minFromDistance, minFromCoins);
    if (safeElapsed < minRequired) {
        events.push("timing_below_minimum");
        trustScore -= EVENT_DEDUCTIONS.timing_below_minimum;
    }
    if (score <= 0 || Math.abs(score - expectedScore) > 2) {
        events.push("score_anomaly");
        trustScore -= EVENT_DEDUCTIONS.score_anomaly;
    }
    return { trustScore: Math.max(0, trustScore), rejected: trustScore < REJECT_THRESHOLD, events };
}
/**
 * Generic trust: min duration + score>0 + optional score-rate / action-flood.
 * Sky should pass server-derived score (pipesPassed), not client-reported points.
 */
export function evaluateTrust(gameSlug, playTimeMs, score, opts = {}) {
    let trustScore = 100;
    const events = [];
    const minMs = GAME_MIN_DURATION_MS[gameSlug] ?? 5_000;
    if (playTimeMs < minMs) {
        events.push("timing_below_minimum");
        trustScore -= EVENT_DEDUCTIONS.timing_below_minimum;
    }
    if (score <= 0) {
        events.push("score_anomaly");
        trustScore -= EVENT_DEDUCTIONS.score_anomaly;
    }
    const maxPerSec = GAME_MAX_SCORE_PER_SEC[gameSlug];
    if (maxPerSec != null && playTimeMs > 0 && score > 0) {
        const rate = score / (playTimeMs / 1000);
        if (rate > maxPerSec) {
            events.push("score_anomaly");
            trustScore -= EVENT_DEDUCTIONS.score_anomaly;
        }
    }
    const actionCount = Number(opts.actionCount);
    if (Number.isFinite(actionCount) && actionCount > 0 && playTimeMs > 0) {
        const actionsPerSec = actionCount / (playTimeMs / 1000);
        if (actionsPerSec > GAME_MAX_ACTIONS_PER_SEC) {
            events.push("action_flood");
            trustScore -= EVENT_DEDUCTIONS.action_flood;
        }
    }
    return { trustScore: Math.max(0, trustScore), rejected: trustScore < REJECT_THRESHOLD, events };
}
