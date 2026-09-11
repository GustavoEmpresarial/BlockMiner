// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/telegram/notifiers/video.notifier.ts — a broadcast-
 * subscription bot (NOT a command bot, see telegram.subscription-bot.ts header). Uses its own
 * bot token (VIDEO_TELEGRAM_BOT_TOKEN), distinct from TELEGRAM_BOT_TOKEN and from
 * SUPPORT_TELEGRAM_BOT_TOKEN. Runs in-process via
 * server/cron/telegram-subscription-bots.cron.ts.
 *
 * Deviation from legacy layout (documented, not silent): legacy oddly defined
 * `notifySupportReply` and `notifyNewPublicSupportTicket` inside video.notifier.ts (its own
 * comment block even says "Completely separate from the support-tickets bot" right above two
 * functions that are actually about support tickets/replies — this looks like an accidental
 * placement in the legacy codebase). Here, `notifySupportReply` was moved into
 * support-telegram.notifier.ts where it semantically belongs (support ticket concerns). Only
 * `notifyNewVideoSubmission` (this bot's actual purpose) and `notifyNewPublicSupportTicket` are
 * kept here, matching legacy's token/chat-store ownership (both fire through THIS bot's token in
 * legacy, so moving `notifyNewPublicSupportTicket` elsewhere would change delivery target).
 *
 * `notifyNewPublicSupportTicket` is ported but NOT wired to any call site: current/ has no
 * publicSupport module yet (no guest-ticket module exists to port from
 * legacy/server/modules/publicSupport/ in this pass) — see PROGRESSO.txt entry 10i.
 *
 * Graceful degradation: when VIDEO_TELEGRAM_BOT_TOKEN is unset, start() and notify*() are honest
 * no-ops (logged, never throw, never fake a send).
 */
import { createSubscriptionBotEngine, escapeHtml } from "./telegram.subscription-bot.js";
const engine = createSubscriptionBotEngine({
    name: "VideoTelegramNotifier",
    tokenEnvVar: "VIDEO_TELEGRAM_BOT_TOKEN",
    storeOverrideEnvVar: "VIDEO_TELEGRAM_CHAT_STORE",
    pollIntervalEnvVar: "VIDEO_TELEGRAM_POLL_INTERVAL",
    defaultStoreFilename: "video-telegram-chats.json",
    startAckText: "🎬 Pronto! Você vai receber aqui os avisos de novos vídeos para moderar no BlockMiner.",
    stopAckText: "🔕 Você não receberá mais avisos de vídeos neste chat.",
});
export function startVideoTelegramNotifier() {
    engine.start();
}
export function stopVideoTelegramNotifier() {
    engine.stop();
}
export function isVideoTelegramNotifierStarted() {
    return engine.isStarted();
}
export function getVideoTelegramSubscriberChatIds() {
    return engine.getSubscriberChatIds();
}
export function notifyNewVideoSubmission(video) {
    const userLabel = video.username ? `@${video.username}` : `#${video.userId}`;
    const title = (video.title || "(sem título)").slice(0, 180);
    const watchUrl = video.videoId ? `https://youtu.be/${video.videoId}` : escapeHtml(video.videoUrl || "(sem url)");
    const lines = [
        `🎬 <b>Novo vídeo para moderar</b> #${video.id}`,
        `<b>Canal:</b> ${escapeHtml(userLabel)}`,
        `<b>Título:</b> ${escapeHtml(title)}`,
        `<b>Assistir:</b> ${watchUrl}`,
    ];
    engine.notifyAll({ text: lines.join("\n"), parseMode: "HTML" });
}
/** Not wired to any call site yet — current/ has no publicSupport module to port from. */
export function notifyNewPublicSupportTicket(ticket) {
    const subject = (ticket.subject || "(sem assunto)").slice(0, 180);
    const msgPreview = (ticket.message || "").slice(0, 500);
    const lines = [
        `🆘 <b>Novo chamado de suporte</b> #${ticket.id}`,
        `<b>Assunto:</b> ${escapeHtml(subject)}`,
        ticket.guestName ? `<b>Nome:</b> ${escapeHtml(ticket.guestName.slice(0, 80))}` : null,
        ticket.guestEmail ? `<b>E-mail:</b> ${escapeHtml(ticket.guestEmail.slice(0, 120))}` : null,
        msgPreview ? `\n${escapeHtml(msgPreview)}` : null,
    ].filter(Boolean);
    engine.notifyAll({ text: lines.join("\n"), parseMode: "HTML" });
}
