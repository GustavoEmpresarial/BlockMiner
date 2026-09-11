/**
 * Ported from legacy/server/modules/telegram/notifiers/support.notifier.ts — a broadcast-
 * subscription bot (NOT a command bot, see telegram.subscription-bot.ts header for the full
 * scope note). Uses its own bot token (SUPPORT_TELEGRAM_BOT_TOKEN), distinct from
 * TELEGRAM_BOT_TOKEN (the generic outbox worker's token). Runs in-process via
 * server/cron/telegram-subscription-bots.cron.ts, per the monólito modular doctrine (no separate
 * Docker process, matching deposit-verifier.cron.ts / telegram-outbox.cron.ts).
 *
 * Graceful degradation: when SUPPORT_TELEGRAM_BOT_TOKEN is unset, start() and notify*() are
 * honest no-ops (logged, never throw, never fake a send).
 */
import { createSubscriptionBotEngine, escapeMarkdownV2 } from "./telegram.subscription-bot.js";
const engine = createSubscriptionBotEngine({
    name: "SupportTelegramNotifier",
    tokenEnvVar: "SUPPORT_TELEGRAM_BOT_TOKEN",
    storeOverrideEnvVar: "SUPPORT_TELEGRAM_CHAT_STORE",
    pollIntervalEnvVar: "SUPPORT_TELEGRAM_POLL_INTERVAL",
    defaultStoreFilename: "support-telegram-chats.json",
    startAckText: "✅ Pronto! Você vai receber aqui notificações de novos tickets de suporte do BlockMiner.",
    stopAckText: "🔕 Você não receberá mais notificações de tickets neste chat.",
});
export function startSupportTelegramNotifier() {
    engine.start();
}
export function stopSupportTelegramNotifier() {
    engine.stop();
}
export function isSupportTelegramNotifierStarted() {
    return engine.isStarted();
}
export function getSupportTelegramSubscriberChatIds() {
    return engine.getSubscriberChatIds();
}
export function notifyNewSupportTicket(ticket) {
    const subject = (ticket.subject || "(sem assunto)").slice(0, 180);
    const bodyPreview = (ticket.body || "").slice(0, 500);
    const userLabel = ticket.username ? `@${ticket.username}` : ticket.userId ? `#${ticket.userId}` : "convidado";
    const lines = [
        `🆘 *Novo ticket de suporte* #${ticket.id}`,
        `*Assunto:* ${escapeMarkdownV2(subject)}`,
        `*Usuário:* ${escapeMarkdownV2(userLabel)}`,
        ticket.name ? `*Nome:* ${escapeMarkdownV2(ticket.name)}` : null,
        ticket.email ? `*E-mail:* ${escapeMarkdownV2(ticket.email)}` : null,
        bodyPreview ? `\n${escapeMarkdownV2(bodyPreview)}` : null,
    ].filter(Boolean);
    engine.notifyAll({ text: lines.join("\n"), parseMode: "MarkdownV2" });
}
export function notifySupportReply(reply) {
    const subject = (reply.subject || "(sem assunto)").slice(0, 120);
    const userLabel = reply.username ? `@${reply.username}` : reply.userId ? `#${reply.userId}` : "usuário";
    const msgPreview = (reply.message || "").slice(0, 500);
    const lines = [
        `💬 *Nova resposta no ticket* #${reply.ticketId}`,
        `*Usuário:* ${escapeMarkdownV2(userLabel)}`,
        `*Assunto:* ${escapeMarkdownV2(subject)}`,
        msgPreview ? `\n${escapeMarkdownV2(msgPreview)}` : null,
    ].filter(Boolean);
    engine.notifyAll({ text: lines.join("\n"), parseMode: "MarkdownV2" });
}
