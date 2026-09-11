/**
 * Which antibot telemetry eventTypes reach the detector pipeline.
 * Kept free of Prisma / riskEngine so unit tests stay light.
 */

export function antibotGamesOnly(): boolean {
  return (process.env.ANTIBOT_GAMES_ONLY ?? "1") !== "0";
}

/**
 * Restricted surface (default): game* + site:integrity*.
 * ANTIBOT_GAMES_ONLY=0 → all events.
 * ANTIBOT_EVENT_ALLOWLIST=game,site:integrity → explicit prefixes (wins).
 */
export function antibotEventAllowed(eventType: string): boolean {
  const allow = String(process.env.ANTIBOT_EVENT_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\*$/, ""))
    .filter(Boolean);
  if (allow.length) {
    return allow.some((prefix) => eventType.startsWith(prefix));
  }
  if (!antibotGamesOnly()) return true;
  return eventType.startsWith("game") || eventType.startsWith("site:integrity");
}
