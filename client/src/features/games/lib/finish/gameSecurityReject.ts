/** Security deny codes — no reward, no tournament, show reason on verify. */
export const GAME_SECURITY_REJECT_CODES = [
  "anti_cheat_timing",
  "anti_cheat_burst",
  "antibot_blocked",
  "antibot_automation",
  "ANTIBOT_BLOCKED",
  "ANTIBOT_AUTOMATION",
  "captcha_required",
  "captcha_failed",
  "CAPTCHA_REQUIRED",
  "CAPTCHA_FAILED",
] as const;

export function isGameSecurityRejectCode(code: string | null | undefined): boolean {
  const c = String(code || "");
  return (GAME_SECURITY_REJECT_CODES as readonly string[]).includes(c);
}

export function resolveGameFinishReasonMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  data: { messageCode?: string | null; message?: string | null; code?: string | null } | null | undefined,
): string | null {
  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  const key = data?.messageCode || data?.code || null;
  if (typeof key === "string" && key.trim()) {
    const i18nKey = `minerGames.game_finish.${key.trim()}`;
    const keyed = t(i18nKey);
    if (keyed && keyed !== i18nKey) return keyed;
  }
  return null;
}
