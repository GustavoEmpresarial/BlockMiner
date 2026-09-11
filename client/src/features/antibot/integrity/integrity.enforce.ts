/**
 * Force logout + hard navigate to /login with reason when a blocked
 * userscript manager is present. Idempotent per page lifetime.
 *
 * Awaits /auth/logout so httpOnly cookies die before navigation — otherwise
 * LoginPage checkSession still sees a session and bounces back to /dashboard.
 */
import { useAuthStore } from "../../../shared/auth/auth.store";
import {
  filterBlockedUserscriptManagers,
  hasBlockedUserscriptManager,
  loginUrlWithUserscriptReason,
  USERSCRIPT_MANAGER_LOGOUT_REASON,
  userscriptManagerKickEnabled,
} from "./integrity.policy";

let enforcing = false;

function alreadyOnReasonLogin(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.location.pathname.includes("/login")) return false;
  return new URLSearchParams(window.location.search).get("reason") === USERSCRIPT_MANAGER_LOGOUT_REASON;
}

function resetEnforcingIfLeftLogin(): void {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.includes("/login")) enforcing = false;
}

/** Returns true if a kick was started (or already in flight). */
export async function enforceUserscriptManagerLogout(managers: readonly string[]): Promise<boolean> {
  if (!userscriptManagerKickEnabled()) return false;
  const blocked = filterBlockedUserscriptManagers(managers);
  if (!hasBlockedUserscriptManager(blocked) && managers.length === 0) return false;
  // Allow kick when caller already decided (e.g. page markers / test script) by passing blocked ids
  // or the literal "tampermonkey" via filter — if empty list but we were called from broadened path,
  // callers should pass ["tampermonkey"].
  if (!hasBlockedUserscriptManager(blocked)) return false;
  if (typeof window === "undefined") return false;

  resetEnforcingIfLeftLogin();

  // On the reason login screen, keep the user there — do not latch `enforcing`
  // forever, or a later SPA re-login never gets kicked again.
  if (alreadyOnReasonLogin()) {
    try {
      sessionStorage.setItem("bm_logout_reason", USERSCRIPT_MANAGER_LOGOUT_REASON);
    } catch {
      /* ignore */
    }
    return true;
  }

  if (enforcing) return true;
  enforcing = true;

  try {
    await useAuthStore.getState().logout();
  } catch {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  }

  if (alreadyOnReasonLogin()) {
    enforcing = false;
    return true;
  }
  window.location.replace(loginUrlWithUserscriptReason());
  return true;
}

export function maybeKickFromIntegrityManagers(managers: readonly string[]): void {
  void enforceUserscriptManagerLogout(managers);
}
