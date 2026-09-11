/**
 * Public surface of the notifications module (notifications + broadcast + reward-inbox fuse +
 * telegram config/outbox sub-namespace, including the real outbox worker as of Fase 10c — see
 * telegram.service.ts / telegram.worker.ts headers for the full scope notes).
 */
export { notificationsRouter } from "./notifications.routes.js";
export { broadcastRouter } from "./broadcast.routes.js";
export { broadcastAdminRouter } from "./broadcast.admin.routes.js";
export { rewardInboxRouter } from "./reward-inbox.routes.js";
export { createNotification } from "./notifications.service.js";
export { createRewardInboxEntry, grantTemporaryPowerInTx } from "./reward-inbox.service.js";
export { shouldQueueTournamentPrizeInInbox } from "./reward-inbox.power.js";
// ─── telegram sub-namespace ────────────────────────────────────────────────
export { telegramAdminRouter } from "./telegram.admin.routes.js";
export { TELEGRAM_EVENT_TYPES } from "./telegram.types.js";
export { getWithdrawalTelegramSettings, isTelegramPrivateAlertsEnabled, isTelegramPublicProofsEnabled, createTelegramOutboxEventTx, createGenericTelegramOutboxEvent, notifyWithdrawalRequested, notifyWithdrawalCompleted, notifyAutoWithdrawalSent, notifyHotWalletLowBalance, listTelegramOutboxEvents, retryTelegramOutboxEvent, createTelegramTestEvent, getTelegramWorkerHealth, } from "./telegram.service.js";
export { TELEGRAM_ERROR } from "./telegram.errors.js";
export { runTelegramOutboxTick, isTelegramOutboxWorkerRunning, processTelegramEvent, sendTelegramMessage, getWorkerConfig as getTelegramWorkerConfig, } from "./telegram.worker.js";
// ─── telegram subscription-broadcast bots (support + video) ───────────────
// Separate, parallel mechanism from the outbox above — own dedicated bot tokens
// (SUPPORT_TELEGRAM_BOT_TOKEN / VIDEO_TELEGRAM_BOT_TOKEN), own on-disk JSON chat stores under
// current/storage/telegram/. See telegram.subscription-bot.ts header for the full scope note.
export { startSupportTelegramNotifier, stopSupportTelegramNotifier, isSupportTelegramNotifierStarted, getSupportTelegramSubscriberChatIds, notifyNewSupportTicket, notifySupportReply, } from "./support-telegram.notifier.js";
export { startVideoTelegramNotifier, stopVideoTelegramNotifier, isVideoTelegramNotifierStarted, getVideoTelegramSubscriberChatIds, notifyNewVideoSubmission, notifyNewPublicSupportTicket, } from "./video-telegram.notifier.js";
