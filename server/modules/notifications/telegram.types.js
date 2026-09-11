/**
 * Telegram config/outbox types. Ported from legacy/server/modules/telegram/telegram.types.ts.
 *
 * Scope note (Fase 8): only the config + outbox side of legacy's telegram/ module is ported
 * here, as a sub-namespace of notifications/. The legacy worker (poll loop that actually calls
 * the Telegram Bot API) is process-level infra and is explicitly NOT ported — see
 * telegram.service.ts header for details.
 */
export const TELEGRAM_EVENT_TYPES = Object.freeze({
    WITHDRAWAL_REQUESTED_PRIVATE_ALERT: "withdrawal_requested_private_alert",
    WITHDRAWAL_COMPLETED_PUBLIC_PROOF: "withdrawal_completed_public_proof",
    WITHDRAWAL_AUTO_SENT_PRIVATE_ALERT: "withdrawal_auto_sent_private_alert",
    HOT_WALLET_LOW_BALANCE_ALERT: "hot_wallet_low_balance_alert",
    // Extra event types (current/-only): legacy modeled these as two entirely separate
    // long-polling bots (support.notifier.ts / video.notifier.ts) with their own JSON chat
    // stores, not through the withdrawal outbox. Since no worker is ported here anyway, they
    // are folded into the same outbox table (type is a free-form string column, no DB enum) so
    // support/social can go from "log only" to "actually persisted, awaiting a worker" — see
    // PROGRESSO.txt Fase 8 section for the full rationale.
    SUPPORT_TICKET_NEW: "support_ticket_new",
    SUPPORT_REPLY_NEW: "support_reply_new",
    PUBLIC_SUPPORT_TICKET_NEW: "public_support_ticket_new",
    PUBLIC_GUEST_MESSAGE_NEW: "public_guest_message_new",
    VIDEO_SUBMISSION_NEW: "video_submission_new",
});
