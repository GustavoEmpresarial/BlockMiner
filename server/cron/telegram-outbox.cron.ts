/**
 * Telegram outbox cron — registers the poll loop for
 * modules/notifications/telegram.worker.ts's runTelegramOutboxTick(). Same setInterval shape as
 * deposit-verifier.cron.ts / mining.cron.ts (doctrine: cron/ only schedules, business logic lives
 * in the module). This is the in-process replacement for legacy's standalone
 * telegramProofWorker.js Docker process — see telegram.worker.ts header for the full adaptation
 * rationale.
 */
import { logger } from "../core/logger/index.js";
import { runTelegramOutboxTick, setTelegramOutboxWorkerRunning } from "../modules/notifications/telegram.worker.js";

const log = logger.child("TelegramOutboxCron");

const DEFAULT_INTERVAL_MS = 5000; // matches legacy's TELEGRAM_WORKER_POLL_INTERVAL_MS default

export function startTelegramOutboxCron(): { stop: () => void } {
  const intervalMs = Math.max(1000, Number(process.env.TELEGRAM_WORKER_POLL_INTERVAL_MS || DEFAULT_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  const run = () => {
    runTelegramOutboxTick().catch((err: unknown) => {
      log.error("Telegram outbox tick failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  setTelegramOutboxWorkerRunning(true);
  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Telegram outbox cron started", { intervalMs });
  return {
    stop: () => {
      clearInterval(handle);
      setTelegramOutboxWorkerRunning(false);
    },
  };
}
