/**
 * Real Telegram Bot API outbox worker — poll+send+retry logic ported from
 * legacy/server/modules/telegram/worker/telegramProofWorker.js (message builders, claim/send/
 * markSent/markFailed/backoff), plus outbound-only message text for the current/-only generic
 * event types (support/social) that legacy fed to two separate long-polling command bots
 * (notifiers/support.notifier.ts, notifiers/video.notifier.ts).
 *
 * DELIBERATE ADAPTATION (documented, not a silent deviation): legacy ran this as a standalone
 * Docker process with its own Dockerfile/healthcheck (`telegramProofWorker.js`'s `runWorker()`
 * loop). Per the "monólito modular simples" doctrine (ARQUITETURA.md §8/§9 — workers/cron live
 * in-process, registered from server/cron/), this module exports pure claim/process functions and
 * a single-tick entry point (`runTelegramOutboxTick`); the actual polling loop is a setInterval
 * registered by server/cron/telegram-outbox.cron.ts, same shape as deposit-verifier.cron.ts.
 *
 * NOT PORTED (out of scope, documented):
 *  - The two long-polling command bots (support.notifier.ts / video.notifier.ts `getUpdates`
 *    loops + their on-disk JSON chat stores). Those let an admin *reply* to Telegram messages and
 *    have them routed back into support/social. Only OUTBOUND sending (outbox -> Telegram) is
 *    implemented here — no inbound command handling of any kind.
 *  - TELEGRAM_POLYGONSCAN_SCREENSHOT_ENABLED headless-browser screenshot capture: the ported
 *    reference file (telegramProofWorker.js) itself never captured a real screenshot when this
 *    flag was on — it only logged a warning and sent the text-only proof message anyway. This
 *    worker preserves that exact behavior (log + text-only send), so no headless-browser
 *    dependency is introduced by this change; true screenshot capture remains unported.
 *
 * SAFETY INVARIANT (do not weaken): an event is marked "sent" ONLY after `sendTelegramMessage`
 * resolves, which only happens after a genuine HTTP 200 response from
 * `https://api.telegram.org/bot<token>/<method>`. When TELEGRAM_BOT_TOKEN is not configured,
 * `telegramFetch` throws before any network call — the event is routed through the exact same
 * failure/backoff/dead-letter path as a real API error. No code path here ever calls markSent()
 * without going through a real send attempt first.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { TELEGRAM_EVENT_TYPES } from "./telegram.types.js";
import { cleanString, boolFromEnv, safeError, isValidPolygonTxHash, normalizeThreadId, normalizePolygonscanBaseUrl, } from "./telegram.helpers.js";
const log = logger.child("TelegramOutboxWorker");
// ─── worker runtime status (consumed by telegram.service.ts's getTelegramWorkerHealth) ────────
let workerRunning = false;
export function isTelegramOutboxWorkerRunning() {
    return workerRunning;
}
export function setTelegramOutboxWorkerRunning(value) {
    workerRunning = value;
}
export function getWorkerConfig() {
    const botToken = cleanString(process.env.TELEGRAM_BOT_TOKEN);
    return {
        botToken,
        botTokenConfigured: Boolean(botToken),
        privateChatId: cleanString(process.env.TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID),
        publicChatId: cleanString(process.env.TELEGRAM_PUBLIC_PROOF_CHAT_ID),
        publicThreadId: normalizeThreadId(process.env.TELEGRAM_PUBLIC_PROOF_THREAD_ID),
        screenshotEnabled: boolFromEnv("TELEGRAM_POLYGONSCAN_SCREENSHOT_ENABLED", false),
        maxAttempts: Math.max(1, Number(process.env.TELEGRAM_WORKER_MAX_ATTEMPTS || 5) || 5),
        batchSize: Math.max(1, Math.min(10, Number(process.env.TELEGRAM_WORKER_BATCH_SIZE || 3) || 3)),
        polygonscanBaseUrl: normalizePolygonscanBaseUrl(),
    };
}
export function computeBackoffMs(attempts) {
    const n = Math.max(1, Number(attempts) || 1);
    return Math.min(60 * 60 * 1000, 30_000 * 2 ** (n - 1));
}
function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function amountText(value) {
    const n = Number(value || 0);
    return `${Number.isFinite(n) ? n.toFixed(8) : "0.00000000"} POL`;
}
function formatTelegramDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: process.env.TZ || "America/Sao_Paulo",
    }).format(date);
}
function buildPolygonscanTxUrl(txHash, baseUrl = normalizePolygonscanBaseUrl()) {
    if (!txHash)
        return baseUrl;
    return `${baseUrl}/tx/${txHash}`;
}
function payloadOf(event) {
    return event.payload || {};
}
export function buildPrivateAlertMessage(event) {
    const payload = payloadOf(event);
    const username = esc(payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`);
    const lines = [
        "⚠️ <b>Novo Saque Solicitado</b>",
        "",
        `👤 <b>Usuário:</b> @${username} <code>(#${event.userId || "?"})</code>`,
        payload.emailMasked ? `📧 <b>Email:</b> <code>${esc(payload.emailMasked)}</code>` : null,
        `💰 <b>Valor:</b> <b>${esc(amountText(event.amount))}</b>`,
        `📍 <b>Destino:</b> <code>${esc(event.destinationWallet || payload.destinationWallet || "-")}</code>`,
        `📅 <b>Data:</b> ${esc(formatTelegramDate(payload.createdAt || event.createdAt))}`,
        `🆔 <b>ID Transação:</b> #${event.transactionId || event.id}`,
        `📊 <b>Status:</b> Pendente`,
        payload.lastIp ? `🌐 <b>IP:</b> <code>${esc(payload.lastIp)}</code>` : null,
    ];
    return lines.filter(Boolean).join("\n");
}
export function buildAutoSentAlertMessage(event) {
    const payload = payloadOf(event);
    const username = esc(payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`);
    const via = esc(payload.via || "hotwallet");
    const txHash = cleanString(event.txHash || payload.txHash);
    const txLine = txHash
        ? isValidPolygonTxHash(txHash)
            ? `🔗 <b>Hash:</b> <code>${esc(txHash)}</code>`
            : `🔗 <b>Ref:</b> <code>${esc(txHash)}</code>`
        : `🔗 <b>Hash:</b> <i>aguardando confirmação</i>`;
    const lines = [
        "🤖 <b>Auto-Saque Enviado</b>",
        "",
        `👤 <b>Usuário:</b> @${username} <code>(#${event.userId || "?"})</code>`,
        payload.emailMasked ? `📧 <b>Email:</b> <code>${esc(payload.emailMasked)}</code>` : null,
        `💰 <b>Valor:</b> <b>${esc(amountText(event.amount))}</b>`,
        `📍 <b>Destino:</b> <code>${esc(event.destinationWallet || payload.destinationWallet || "-")}</code>`,
        `⚙️ <b>Via:</b> ${via === "coinex" ? "CoinEx API" : "Hot Wallet"}`,
        txLine,
        `📅 <b>Enviado em:</b> ${esc(formatTelegramDate(payload.completedAt || event.createdAt))}`,
        `🆔 <b>ID Transação:</b> #${event.transactionId || event.id}`,
    ];
    return lines.filter(Boolean).join("\n");
}
export function buildHotWalletLowBalanceMessage(event) {
    const payload = payloadOf(event);
    const balance = esc(payload.balance ?? "0");
    const required = esc(payload.required ?? "0");
    const pending = Number(payload.pendingCount || 0);
    const triggeredAt = payload.triggeredAt || event.createdAt;
    return [
        "🚨 <b>Hot Wallet sem Saldo</b>",
        "",
        `💼 <b>Saldo atual:</b> <code>${balance} POL</code>`,
        `📦 <b>Necessário para fila:</b> <code>${required} POL</code>`,
        `⏳ <b>Saques aprovados aguardando:</b> <b>${pending}</b>`,
        "",
        `🔒 <b>Envio automático pausado</b> — o cron tentará novamente após a janela de cooldown.`,
        `📅 <b>Detectado em:</b> ${esc(formatTelegramDate(triggeredAt))}`,
        "",
        `<i>Recarregue a hot wallet para retomar o processamento automático.</i>`,
    ].join("\n");
}
export function buildPublicProofMessage(event, baseUrl = normalizePolygonscanBaseUrl()) {
    const payload = payloadOf(event);
    const txHash = cleanString(event.txHash || payload.txHash);
    const url = buildPolygonscanTxUrl(txHash, baseUrl);
    const username = esc(payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`);
    return [
        "✅ <b>Saque Confirmado</b>",
        "",
        `👤 <b>Usuário:</b> ${username}`,
        `💰 <b>Valor:</b> ${esc(amountText(event.amount))}`,
        "",
        `🔗 <b>Hash:</b> <code>${esc(txHash)}</code>`,
        `🌐 <b>Explorer:</b> ${esc(url)}`,
        "",
        `📅 <b>Data:</b> ${esc(formatTelegramDate(payload.completedAt || event.sentAt || event.updatedAt || event.createdAt))}`,
        "",
        `<i>⛏️ BlockMiner</i>`,
    ].join("\n");
}
/**
 * Generic (current/-only) event text — support tickets / video submissions. These never existed
 * in the legacy outbox worker (they went to the separate command bots instead); the text format
 * here is new but follows the same escaping/formatting conventions as the ported builders above.
 */
export function buildGenericEventMessage(event) {
    const payload = payloadOf(event);
    const username = esc(payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`);
    const titles = {
        [TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW]: "🎫 <b>Novo Ticket de Suporte</b>",
        [TELEGRAM_EVENT_TYPES.SUPPORT_REPLY_NEW]: "💬 <b>Nova Resposta de Suporte</b>",
        [TELEGRAM_EVENT_TYPES.PUBLIC_SUPPORT_TICKET_NEW]: "🎫 <b>Novo Ticket Público</b>",
        [TELEGRAM_EVENT_TYPES.PUBLIC_GUEST_MESSAGE_NEW]: "💬 <b>Nova Mensagem de Convidado</b>",
        [TELEGRAM_EVENT_TYPES.VIDEO_SUBMISSION_NEW]: "🎬 <b>Novo Vídeo Enviado</b>",
    };
    const title = titles[event.type] || `📣 <b>${esc(event.type)}</b>`;
    const subject = cleanString(payload.subject) || cleanString(payload.title) || null;
    const message = cleanString(payload.message) || cleanString(payload.body) || null;
    const lines = [
        title,
        "",
        `👤 <b>Usuário:</b> @${username} <code>(#${event.userId || "?"})</code>`,
        subject ? `📌 <b>Assunto:</b> ${esc(subject)}` : null,
        message ? `📝 ${esc(message).slice(0, 500)}` : null,
        `📅 <b>Data:</b> ${esc(formatTelegramDate(event.createdAt))}`,
        `🆔 <b>ID Evento:</b> #${event.id}`,
    ];
    return lines.filter(Boolean).join("\n");
}
// ─── real Telegram Bot API call ────────────────────────────────────────────────────────────────
async function telegramFetch(method, botToken, body) {
    if (!botToken)
        throw new Error("TELEGRAM_BOT_TOKEN nao configurado.");
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, body);
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Telegram ${method} failed (${response.status}): ${text.slice(0, 250)}`);
    }
    return response.json().catch(() => ({}));
}
export async function sendTelegramMessage(params) {
    const { botToken, chatId, threadId, text, fetchImpl = telegramFetch } = params;
    if (!chatId)
        throw new Error("chat_id nao configurado.");
    const body = {
        chat_id: String(chatId),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
    };
    if (threadId)
        body.message_thread_id = Number(threadId);
    return fetchImpl("sendMessage", botToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
// ─── outbox claim/process/mark ─────────────────────────────────────────────────────────────────
async function claimNextEvent() {
    const event = await prisma.telegramOutboxEvent.findFirst({
        where: {
            status: { in: ["pending", "failed"] },
            nextRunAt: { lte: new Date() },
        },
        orderBy: { createdAt: "asc" },
    });
    if (!event)
        return null;
    const claimed = await prisma.telegramOutboxEvent.updateMany({
        where: {
            id: event.id,
            status: event.status,
            nextRunAt: { lte: new Date() },
        },
        data: {
            status: "processing",
            attempts: { increment: 1 },
            lastError: null,
        },
    });
    if (claimed.count !== 1)
        return null;
    return prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
}
async function markSent(eventId) {
    await prisma.telegramOutboxEvent.update({
        where: { id: eventId },
        data: { status: "sent", sentAt: new Date(), lastError: null },
    });
}
async function markFailed(event, error, config) {
    const attempts = Number(event.attempts || 0);
    const dead = attempts >= config.maxAttempts;
    await prisma.telegramOutboxEvent.update({
        where: { id: event.id },
        data: {
            status: dead ? "dead" : "failed",
            lastError: safeError(error),
            nextRunAt: new Date(Date.now() + computeBackoffMs(attempts)),
        },
    });
}
const GENERIC_EVENT_TYPES = [
    TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW,
    TELEGRAM_EVENT_TYPES.SUPPORT_REPLY_NEW,
    TELEGRAM_EVENT_TYPES.PUBLIC_SUPPORT_TICKET_NEW,
    TELEGRAM_EVENT_TYPES.PUBLIC_GUEST_MESSAGE_NEW,
    TELEGRAM_EVENT_TYPES.VIDEO_SUBMISSION_NEW,
];
/**
 * Sends one outbox event via the real Bot API. Throws on any failure — including a missing
 * bot token or missing destination chat id — so the caller's markFailed/backoff path handles it
 * uniformly. Never resolves without `sendTelegramMessage` actually completing a real fetch.
 */
export async function processTelegramEvent(event, config = getWorkerConfig(), fetchImpl) {
    if (event.type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT) {
        await sendTelegramMessage({
            botToken: config.botToken,
            chatId: config.privateChatId,
            text: buildPrivateAlertMessage(event),
            fetchImpl,
        });
        return { sent: true };
    }
    if (event.type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_AUTO_SENT_PRIVATE_ALERT) {
        await sendTelegramMessage({
            botToken: config.botToken,
            chatId: config.privateChatId,
            text: buildAutoSentAlertMessage(event),
            fetchImpl,
        });
        return { sent: true };
    }
    if (event.type === TELEGRAM_EVENT_TYPES.HOT_WALLET_LOW_BALANCE_ALERT) {
        await sendTelegramMessage({
            botToken: config.botToken,
            chatId: config.privateChatId,
            text: buildHotWalletLowBalanceMessage(event),
            fetchImpl,
        });
        return { sent: true };
    }
    if (event.type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF) {
        const txHash = cleanString(event.txHash || payloadOf(event).txHash);
        if (!isValidPolygonTxHash(txHash))
            throw new Error("txHash invalido.");
        if (config.screenshotEnabled) {
            log.warn("Polygonscan screenshot capture not ported; sending text-only proof", { eventId: event.id });
        }
        await sendTelegramMessage({
            botToken: config.botToken,
            chatId: config.publicChatId,
            threadId: config.publicThreadId,
            text: buildPublicProofMessage(event, config.polygonscanBaseUrl),
            fetchImpl,
        });
        return { sent: true };
    }
    if (GENERIC_EVENT_TYPES.includes(event.type)) {
        // Generic (support/social) events are private-alert-shaped: they go to the same private
        // chat as withdrawal alerts (no separate chat id existed for these in legacy — they went to
        // command bots with their own chat stores, out of scope here).
        await sendTelegramMessage({
            botToken: config.botToken,
            chatId: config.privateChatId,
            text: buildGenericEventMessage(event),
            fetchImpl,
        });
        return { sent: true };
    }
    throw new Error(`Tipo de evento Telegram desconhecido: ${event.type}`);
}
/**
 * Processes up to `config.batchSize` outbox events in a single tick. Returns how many events
 * were claimed (attempted) this tick, regardless of whether each individually succeeded or
 * failed — callers (the cron) just need to know the worker ran, not the outcome breakdown
 * (that's visible via getTelegramWorkerHealth's queue counts).
 */
export async function runTelegramOutboxTick(overrides = {}) {
    const config = overrides.config ?? getWorkerConfig();
    let processed = 0;
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < config.batchSize; i += 1) {
        const event = await claimNextEvent();
        if (!event)
            break;
        processed += 1;
        try {
            await processTelegramEvent(event, config, overrides.fetchImpl);
            await markSent(event.id);
            sent += 1;
            log.info("Telegram outbox event sent", { eventId: event.id, type: event.type });
        }
        catch (error) {
            failed += 1;
            log.warn("Telegram outbox event failed", {
                eventId: event.id,
                type: event.type,
                error: safeError(error),
            });
            await markFailed(event, error, config);
        }
    }
    return { processed, sent, failed };
}
