/**
 * User-facing deny reasons for mini-game reward blocks.
 * Socket payload includes both messageCode (i18n) and message (fallback).
 * Deny paths must NEVER call recordTournamentAction / grant power.
 */
export const GAME_FINISH_DENY_MESSAGES = {
    anti_cheat_timing: {
        pt: "Sem recompensa: o anti-cheat detectou tempo ou pontuação irreais. Esta partida não conta no torneio.",
        en: "No reward: anti-cheat detected unreal play time or score. This run does not count for the tournament.",
        es: "Sin recompensa: el anti-cheat detectó tiempo o puntuación irreales. Esta partida no cuenta en el torneo.",
    },
    anti_cheat_burst: {
        pt: "Sem recompensa: padrão de partidas em excesso detectado. Esta partida não conta no torneio.",
        en: "No reward: too many finishes in a short window. This run does not count for the tournament.",
        es: "Sin recompensa: demasiadas partidas en poco tiempo. Esta partida no cuenta en el torneo.",
    },
    antibot_blocked: {
        pt: "Sem recompensa: risco antibot elevado nesta conta/dispositivo. Esta partida não conta no torneio.",
        en: "No reward: elevated antibot risk on this account/device. This run does not count for the tournament.",
        es: "Sin recompensa: riesgo antibot elevado en esta cuenta/dispositivo. Esta partida no cuenta en el torneo.",
    },
    antibot_automation: {
        pt: "Sem recompensa: automação (bot/webdriver) detectada. Esta partida não conta no torneio.",
        en: "No reward: automation (bot/webdriver) detected. This run does not count for the tournament.",
        es: "Sin recompensa: automatización (bot/webdriver) detectada. Esta partida no cuenta en el torneo.",
    },
    captcha_required: {
        pt: "Sem recompensa: resolva a verificação humana (Cloudflare) para receber o prêmio desta partida.",
        en: "No reward: complete the human verification (Cloudflare) to claim this run's reward.",
        es: "Sin recompensa: complete la verificación humana (Cloudflare) para reclamar la recompensa.",
    },
    captcha_failed: {
        pt: "Sem recompensa: a verificação humana falhou. Tente de novo na próxima partida.",
        en: "No reward: human verification failed. Try again on the next run.",
        es: "Sin recompensa: la verificación humana falló. Inténtalo de nuevo en la próxima partida.",
    },
};
export function gameFinishDenyMessage(code, locale = "pt") {
    const entry = GAME_FINISH_DENY_MESSAGES[code];
    if (!entry)
        return GAME_FINISH_DENY_MESSAGES.antibot_blocked.pt;
    const lang = String(locale || "pt").toLowerCase();
    if (lang.startsWith("en"))
        return entry.en;
    if (lang.startsWith("es"))
        return entry.es;
    return entry.pt;
}
export function isSecurityRejectCode(code) {
    const c = String(code || "");
    return (c === "anti_cheat_timing" ||
        c === "anti_cheat_burst" ||
        c === "antibot_blocked" ||
        c === "antibot_automation" ||
        c === "captcha_required" ||
        c === "captcha_failed");
}
