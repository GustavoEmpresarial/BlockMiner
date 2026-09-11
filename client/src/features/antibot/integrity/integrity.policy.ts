/**
 * Product policy: Tampermonkey / Violentmonkey (and TM beta) are not allowed
 * while using BlockMiner. Detection → logout + login banner.
 *
 * Other managers (ScriptCat, Greasemonkey, …) stay telemetry-only unless listed here.
 */

export const USERSCRIPT_MANAGER_LOGOUT_REASON = "userscript_manager";

export const USERSCRIPT_MANAGER_BLOCKED_CODE = "USERSCRIPT_MANAGER_BLOCKED";

/** Managers that force logout (stable ids from integrity.managers). */
export const BLOCKED_USERSCRIPT_MANAGER_IDS = new Set([
  "tampermonkey",
  "tampermonkey_beta",
  "violentmonkey",
]);

export function userscriptManagerKickEnabled(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const raw = env?.VITE_USERSCRIPT_MANAGER_KICK_ENABLED;
    // Explicit off
    if (raw === "0" || raw === false || raw === "false") return false;
    // Explicit on
    if (raw === "1" || raw === true || raw === "true") return true;
  } catch {
    /* node / non-vite */
  }
  // Default OFF until product re-enables (was kicking users without a clear login card).
  return false;
}

export function filterBlockedUserscriptManagers(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => BLOCKED_USERSCRIPT_MANAGER_IDS.has(id)))];
}

export function hasBlockedUserscriptManager(ids: readonly string[]): boolean {
  return filterBlockedUserscriptManagers(ids).length > 0;
}

export function loginUrlWithUserscriptReason(): string {
  return `/login?reason=${USERSCRIPT_MANAGER_LOGOUT_REASON}`;
}
