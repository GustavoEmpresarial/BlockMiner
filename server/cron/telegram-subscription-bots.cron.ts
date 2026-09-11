/**
 * Registers the two Telegram subscription-broadcast bots (support + video moderation) —
 * ported from legacy/server/modules/telegram/notifiers/{support,video}.notifier.ts. Each bot
 * self-schedules its own getUpdates poll loop internally (see
 * modules/notifications/telegram.subscription-bot.ts's createSubscriptionBotEngine); this cron
 * file only starts/stops both, same "cron/ only schedules" doctrine as telegram-outbox.cron.ts /
 * deposit-verifier.cron.ts. In-process, no separate Docker process (per ARQUITETURA.md).
 *
 * Both are graceful no-ops when their token env var (SUPPORT_TELEGRAM_BOT_TOKEN /
 * VIDEO_TELEGRAM_BOT_TOKEN) is not configured — see the engine's start() for the honest-skip
 * logging.
 */
import { logger } from "../core/logger/index.js";
import { startSupportTelegramNotifier, stopSupportTelegramNotifier } from "../modules/notifications/support-telegram.notifier.js";
import { startVideoTelegramNotifier, stopVideoTelegramNotifier } from "../modules/notifications/video-telegram.notifier.js";

const log = logger.child("TelegramSubscriptionBotsCron");

export function startTelegramSubscriptionBotsCron(): { stop: () => void } {
  startSupportTelegramNotifier();
  startVideoTelegramNotifier();
  log.info("Telegram subscription bots cron started (support + video)");
  return {
    stop: () => {
      stopSupportTelegramNotifier();
      stopVideoTelegramNotifier();
    },
  };
}
