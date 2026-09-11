// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logAdminAction } from "../admin/admin.audit-log.service.js";
import { TELEGRAM_EVENT_TYPES, createTelegramTestEvent, getWithdrawalTelegramSettings, getTelegramWorkerHealth, listTelegramOutboxEvents, retryTelegramOutboxEvent, updateWithdrawalTelegramSettings, } from "./telegram.service.js";
function readMessage(e) {
    if (e instanceof Error)
        return e.message;
    if (e !== null && typeof e === "object" && "message" in e) {
        const m = e.message;
        return typeof m === "string" ? m : undefined;
    }
    return undefined;
}
function toTelegramErrorReply(e, fallback) {
    let status = 500;
    let message = fallback;
    if (typeof e === "object" && e !== null && "statusCode" in e) {
        const raw = e.statusCode;
        if (typeof raw === "number" && Number.isFinite(raw)) {
            status = raw || 500;
            if (raw)
                message = readMessage(e) ?? fallback;
        }
    }
    return { status, message };
}
export async function getSettings(_req, res) {
    try {
        const settings = await getWithdrawalTelegramSettings();
        res.json({ ok: true, settings });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to load Telegram settings." });
    }
}
export async function putSettings(_req, res) {
    try {
        const settings = await updateWithdrawalTelegramSettings();
        res.json({ ok: true, settings });
    }
    catch (error) {
        const r = toTelegramErrorReply(error, "Unable to save Telegram settings.");
        res.status(r.status).json({ ok: false, message: r.message });
    }
}
export async function patchSettings(req, res) {
    return putSettings(req, res);
}
export async function testPrivateAlert(req, res) {
    try {
        const event = await createTelegramTestEvent(TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT, req.body ?? {});
        void logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: "ADMIN_TELEGRAM_TEST_PRIVATE_ALERT",
            module: "telegram",
            resource: "telegram_outbox_event",
            resourceId: String(event.id),
        });
        res.json({
            ok: true,
            event,
            delivered: false,
            note: "Evento gravado no outbox (telegram_outbox_events). Nenhum worker de envio real esta portado nesta versao — o Telegram nao recebeu nada.",
        });
    }
    catch (error) {
        const r = toTelegramErrorReply(error, "Unable to queue Telegram private alert test.");
        res.status(r.status).json({ ok: false, message: r.message });
    }
}
export async function testPublicProof(req, res) {
    try {
        const event = await createTelegramTestEvent(TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF, req.body ?? {});
        void logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: "ADMIN_TELEGRAM_TEST_PUBLIC_PROOF",
            module: "telegram",
            resource: "telegram_outbox_event",
            resourceId: String(event.id),
        });
        res.json({
            ok: true,
            event,
            delivered: false,
            note: "Evento gravado no outbox (telegram_outbox_events). Nenhum worker de envio real esta portado nesta versao — o Telegram nao recebeu nada.",
        });
    }
    catch (error) {
        const r = toTelegramErrorReply(error, "Unable to queue Telegram public proof test.");
        res.status(r.status).json({ ok: false, message: r.message });
    }
}
export async function listEvents(req, res) {
    try {
        const page = Number(req.query?.page ?? 1);
        const limit = Number(req.query?.limit ?? 25);
        const result = await listTelegramOutboxEvents({ page, limit });
        res.json({ ok: true, ...result, page, limit });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to load Telegram events." });
    }
}
export async function retryEvent(req, res) {
    try {
        const event = await retryTelegramOutboxEvent(req.params?.id ?? "");
        void logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: "ADMIN_TELEGRAM_EVENT_RETRY",
            module: "telegram",
            resource: "telegram_outbox_event",
            resourceId: String(event.id),
        });
        res.json({
            ok: true,
            event,
            note: "Status resetado para pending — nenhum worker de envio real esta portado nesta versao, entao o evento nao sera efetivamente reenviado ao Telegram sozinho.",
        });
    }
    catch (error) {
        const r = toTelegramErrorReply(error, "Unable to retry Telegram event.");
        res.status(r.status).json({ ok: false, message: r.message });
    }
}
export async function getHealth(_req, res) {
    try {
        const health = await getTelegramWorkerHealth();
        res.json({ ok: true, health });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to load Telegram worker health." });
    }
}
