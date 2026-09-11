/**
 * Withdrawal auto-send cron — ported from legacy/server/cron/withdrawalsCron.ts's
 * `startWithdrawalMonitoring` (node-cron "every 2 min" + "every 3 min" schedules), rewritten to the
 * `setInterval` doctrine used everywhere else in current/ (see deposit-verifier.cron.ts /
 * mining.cron.ts for the template). No-op by default: processPendingWithdrawals() itself
 * early-returns unless WITHDRAWAL_AUTO_SEND=true, and further degrades to safe mode when
 * WITHDRAWAL_PRIVATE_KEY is unconfigured (see withdrawal.auto-send.ts header for full detail).
 */
import { logger } from "../core/logger/index.js";
import { processPendingWithdrawals, pollCoinExWithdrawals } from "../modules/wallet/withdrawal/withdrawal.auto-send.js";

const log = logger.child("WithdrawalAutoSendCron");

const DEFAULT_SEND_INTERVAL_MS = 120_000; // matches legacy's */2 * * * *
const DEFAULT_POLL_INTERVAL_MS = 180_000; // matches legacy's */3 * * * *

export function startWithdrawalAutoSendCron(): { stop: () => void } {
  const sendIntervalMs = Number(process.env.WITHDRAWAL_AUTO_SEND_CRON_MS || DEFAULT_SEND_INTERVAL_MS);
  const pollIntervalMs = Number(process.env.WITHDRAWAL_COINEX_POLL_CRON_MS || DEFAULT_POLL_INTERVAL_MS);

  const runSend = () => {
    processPendingWithdrawals().catch((err: unknown) => {
      log.error("Auto-send tick failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  const runPoll = () => {
    pollCoinExWithdrawals().catch((err: unknown) => {
      log.error("CoinEx poll tick failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };

  runSend();
  const sendHandle = setInterval(runSend, sendIntervalMs);
  sendHandle.unref?.();
  const pollHandle = setInterval(runPoll, pollIntervalMs);
  pollHandle.unref?.();

  log.info("Withdrawal auto-send cron started", { sendIntervalMs, pollIntervalMs });
  return {
    stop: () => {
      clearInterval(sendHandle);
      clearInterval(pollHandle);
    },
  };
}
