// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Generic engine for a Telegram "subscription broadcast" bot — ported from the SHARED shape of
 * legacy/server/modules/telegram/notifiers/support.notifier.ts and
 * legacy/server/modules/telegram/notifiers/video.notifier.ts.
 *
 * IMPORTANT — these are NOT command bots. They are broadcast-subscription bots:
 *  - `getUpdates` long-polling exists ONLY to capture `chat_id` for whoever sends `/start` to the
 *    bot (self-service subscribe) or `/stop` (unsubscribe). There is no other command handling,
 *    and no "admin replies via Telegram" functionality of any kind — confirmed by reading both
 *    legacy files in full. (An earlier note in PROGRESSO.txt Fase 8/10c mischaracterized these as
 *    "command bots that let an admin reply" — that description was wrong; see PROGRESSO entry
 *    10i for the correction.)
 *  - Each `notify*` function fans a single message out to every currently-subscribed chat id.
 *  - Subscriber chat ids persist to a JSON file on disk, exactly like legacy. Legacy resolved the
 *    path via `resolveUploadsRoot()` (uploads/ volume); current/ has no such shared uploads-root
 *    helper for arbitrary JSON state, so the path is retargeted to `current/storage/telegram/`
 *    (the established runtime-data directory for this project) — same on-disk JSON shape, no
 *    Prisma model introduced.
 *  - Each bot uses ITS OWN dedicated token (e.g. SUPPORT_TELEGRAM_BOT_TOKEN /
 *    VIDEO_TELEGRAM_BOT_TOKEN), never the generic TELEGRAM_BOT_TOKEN used by telegram.worker.ts's
 *    outbox worker. This is a second, independent Telegram integration, running in parallel with
 *    the outbox — not a replacement for it (see support.service.ts / social.service.ts, which
 *    still write outbox rows via createGenericTelegramOutboxEvent for the same events).
 *
 * Graceful degradation (mandatory, matches telegram.worker.ts / ip-intelligence.service.ts):
 * when the bot's token env var is not set, `start()` logs and returns without starting the poll
 * loop, and every `notify*` call becomes a safe no-op (logged, never throws, never fakes a send).
 * Real sends always go through a genuine `fetch()` to `https://api.telegram.org/bot<token>/...`.
 */
import fs from "fs";
import path from "path";
import { logger } from "../../core/logger/index.js";
function storageRoot() {
    // current/storage/ is the established runtime-data directory for this project (backups/,
    // uploads/ already live there) — see current/docs/ARQUITETURA.md.
    return path.resolve(process.cwd(), "storage", "telegram");
}
export function createSubscriptionBotEngine(options) {
    const log = logger.child(options.name);
    let chatStore = { chats: {}, lastUpdateId: 0 };
    let started = false;
    let pollTimer = null;
    let storePath = "";
    function getToken() {
        const t = process.env[options.tokenEnvVar]?.trim();
        return t || null;
    }
    function resolveStorePath() {
        const override = process.env[options.storeOverrideEnvVar]?.trim();
        if (override)
            return path.resolve(override);
        return path.join(storageRoot(), options.defaultStoreFilename);
    }
    function loadStore() {
        try {
            if (fs.existsSync(storePath)) {
                const raw = fs.readFileSync(storePath, "utf8");
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    chatStore = {
                        chats: parsed.chats && typeof parsed.chats === "object" ? parsed.chats : {},
                        lastUpdateId: Number(parsed.lastUpdateId) || 0,
                    };
                }
            }
        }
        catch (err) {
            log.warn("Failed to load chat store", { err: err instanceof Error ? err.message : String(err) });
        }
    }
    function persistStore() {
        try {
            fs.mkdirSync(path.dirname(storePath), { recursive: true });
            fs.writeFileSync(storePath, JSON.stringify(chatStore, null, 2), "utf8");
        }
        catch (err) {
            log.warn("Failed to persist chat store", { err: err instanceof Error ? err.message : String(err) });
        }
    }
    async function tgApi(method, payload) {
        const token = getToken();
        if (!token)
            return null;
        const url = `https://api.telegram.org/bot${token}/${method}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Telegram ${method} failed: ${res.status} ${text.slice(0, 200)}`);
        }
        return res.json();
    }
    async function pollOnce() {
        const token = getToken();
        if (!token)
            return;
        try {
            const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=20&offset=${chatStore.lastUpdateId + 1}`;
            const res = await fetch(url, { method: "GET" });
            if (!res.ok)
                return;
            const json = (await res.json());
            if (!json.ok || !Array.isArray(json.result))
                return;
            let changed = false;
            for (const upd of json.result) {
                if (typeof upd.update_id === "number" && upd.update_id > chatStore.lastUpdateId) {
                    chatStore.lastUpdateId = upd.update_id;
                    changed = true;
                }
                const msg = upd.message;
                if (!msg || !msg.chat)
                    continue;
                const text = (msg.text || "").trim().toLowerCase();
                const chatId = String(msg.chat.id);
                if (text.startsWith("/start")) {
                    if (!chatStore.chats[chatId]) {
                        chatStore.chats[chatId] = {
                            registeredAt: new Date().toISOString(),
                            firstName: msg.chat.first_name || msg.from?.first_name,
                            username: msg.chat.username || msg.from?.username,
                        };
                        changed = true;
                        try {
                            await tgApi("sendMessage", { chat_id: msg.chat.id, text: options.startAckText });
                        }
                        catch (e) {
                            log.warn("Failed to send /start ack", { err: e instanceof Error ? e.message : String(e) });
                        }
                    }
                }
                else if (text.startsWith("/stop")) {
                    if (chatStore.chats[chatId]) {
                        delete chatStore.chats[chatId];
                        changed = true;
                        try {
                            await tgApi("sendMessage", { chat_id: msg.chat.id, text: options.stopAckText });
                        }
                        catch {
                            /* ignore */
                        }
                    }
                }
            }
            if (changed)
                persistStore();
        }
        catch (err) {
            log.debug("getUpdates poll error", { err: err instanceof Error ? err.message : String(err) });
        }
    }
    function scheduleNext() {
        const intervalSec = Math.max(1, Number(process.env[options.pollIntervalEnvVar] || 5) || 5);
        pollTimer = setTimeout(() => {
            void pollOnce().finally(() => scheduleNext());
        }, intervalSec * 1000);
        pollTimer.unref?.();
    }
    function start() {
        if (started)
            return;
        if (!getToken()) {
            log.info(`${options.tokenEnvVar} not set; ${options.name} disabled (graceful no-op).`);
            return;
        }
        storePath = resolveStorePath();
        loadStore();
        started = true;
        log.info(`${options.name} started`, { storePath, chatsRegistered: Object.keys(chatStore.chats).length });
        void pollOnce().finally(() => scheduleNext());
    }
    function stop() {
        if (pollTimer)
            clearTimeout(pollTimer);
        pollTimer = null;
        started = false;
    }
    function getSubscriberChatIds() {
        return Object.keys(chatStore.chats);
    }
    function notifyAll(params) {
        if (!started || !getToken()) {
            log.debug(`${options.name}: notify skipped (not started or no token configured) — honest no-op`);
            return;
        }
        const chatIds = getSubscriberChatIds();
        if (!chatIds.length)
            return;
        for (const chatId of chatIds) {
            void tgApi("sendMessage", {
                chat_id: chatId,
                text: params.text,
                parse_mode: params.parseMode,
                disable_web_page_preview: true,
            }).catch((err) => {
                log.warn("Failed to send Telegram notification", {
                    chatId,
                    err: err instanceof Error ? err.message : String(err),
                });
            });
        }
    }
    return { start, stop, isStarted: () => started, getSubscriberChatIds, notifyAll };
}
export function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function escapeMarkdownV2(value) {
    return value.replace(/([_*`\[\]()~>#+\-=|{}.!\\])/g, "\\$1");
}
