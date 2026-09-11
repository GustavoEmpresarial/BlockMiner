/**
 * Pure helpers for reward-inbox collect routing.
 * Keeps tournament hashrate_boost on the same path as temporary_power.
 */
export function isTemporaryPowerRewardType(rt: string): boolean {
  return rt === "temporary_power" || rt === "hashrate_boost";
}

/** Tournament MINING_BOOST is applied to userPowerGame immediately — never queued in inbox. */
export function shouldQueueTournamentPrizeInInbox(prizeType: string): boolean {
  return prizeType !== "MINING_BOOST";
}

export function isPendingTournamentPowerInboxItem(source: string, rewardType: string): boolean {
  return source === "tournament" && isTemporaryPowerRewardType(rewardType);
}

export function resolvePowerBoostGame(
  rewardType: string,
  source: string,
): { slug: string; name: string } {
  if (rewardType === "hashrate_boost" || source === "tournament") {
    return { slug: "tournament-mining-boost", name: "Tournament mining boost" };
  }
  return { slug: "checkin-streak-bonus", name: "Check-in streak bonus" };
}
