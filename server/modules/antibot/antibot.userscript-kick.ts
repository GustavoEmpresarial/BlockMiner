/**
 * Server policy: which integrity.userscriptManagers force session kill.
 * Keep in sync with client integrity.policy.ts ids.
 */
export const BLOCKED_USERSCRIPT_MANAGER_IDS = new Set([
  "tampermonkey",
  "tampermonkey_beta",
  "violentmonkey",
]);

export function userscriptManagerKickEnabled(): boolean {
  // Default OFF — set USERSCRIPT_MANAGER_KICK_ENABLED=1 to re-enable TM/VM session kill.
  return (process.env.USERSCRIPT_MANAGER_KICK_ENABLED ?? "0") === "1";
}

export function filterBlockedUserscriptManagers(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id && BLOCKED_USERSCRIPT_MANAGER_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Read blocked managers from a raw telemetry payload (pre or post sanitize). */
export function blockedManagersFromTelemetry(telemetry: unknown): string[] {
  if (!telemetry || typeof telemetry !== "object") return [];
  const integ = (telemetry as { integrity?: unknown }).integrity;
  if (!integ || typeof integ !== "object") return [];
  const o = integ as { userscriptManagerInstalled?: unknown; userscriptManagers?: unknown };
  const fromList = filterBlockedUserscriptManagers(o.userscriptManagers);
  if (fromList.length) return fromList;
  // Fallback: installed flag without list — do not kick (avoid FP on unknown managers).
  return [];
}
