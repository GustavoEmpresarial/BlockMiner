/**
 * Pure helpers for reward-inbox collect routing.
 * Keeps tournament hashrate_boost on the same path as temporary_power.
 */
export function isTemporaryPowerRewardType(rt) {
    return rt === "temporary_power" || rt === "hashrate_boost";
}
/** Tournament MINING_BOOST is applied to userPowerGame immediately — never queued in inbox. */
export function shouldQueueTournamentPrizeInInbox(prizeType) {
    return prizeType !== "MINING_BOOST";
}
export function isPendingTournamentPowerInboxItem(source, rewardType) {
    return source === "tournament" && isTemporaryPowerRewardType(rewardType);
}
export function resolvePowerBoostGame(rewardType, source) {
    if (rewardType === "hashrate_boost" || source === "tournament") {
        return { slug: "tournament-mining-boost", name: "Tournament mining boost" };
    }
    return { slug: "checkin-streak-bonus", name: "Check-in streak bonus" };
}
