/**
 * Check-in background jobs: pending wallet finalization + streak anomaly monitor.
 * Thin wrapper kept under server/cron for bootstrap; logic lives in modules/checkin.
 */
import { logger } from "../core/logger/index.js";
import {
  getCheckinMonitorCronMs,
  getCheckinPendingBatchSize,
  getCheckinPendingCronMs,
  isCheckinMonitorEnabled,
} from "../modules/checkin/checkin.config.js";
import { runCheckinStreakMonitor } from "../modules/checkin/checkin.monitor.js";
import { processStalePendingCheckins } from "../modules/checkin/index.js";

const log = logger.child("CheckinCron");

export function startCheckinCron(): { stop: () => void } {
  const pendingMs = getCheckinPendingCronMs();
  const monitorMs = getCheckinMonitorCronMs();
  const pendingBatchSize = getCheckinPendingBatchSize();

  const runPending = () => {
    processStalePendingCheckins({ batchSize: pendingBatchSize }).catch((err: unknown) => {
      log.error("processStalePendingCheckins failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const runMonitor = () => {
    if (!isCheckinMonitorEnabled()) return;
    runCheckinStreakMonitor().catch((err: unknown) => {
      log.error("runCheckinStreakMonitor failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const pendingHandle = setInterval(runPending, pendingMs);
  pendingHandle.unref?.();

  const monitorHandle = setInterval(runMonitor, monitorMs);
  monitorHandle.unref?.();

  log.info("Checkin cron started", { pendingMs, monitorMs, monitorEnabled: isCheckinMonitorEnabled() });
  return {
    stop: () => {
      clearInterval(pendingHandle);
      clearInterval(monitorHandle);
    },
  };
}
