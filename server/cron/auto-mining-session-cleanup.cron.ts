/**
 * Auto-mining session cleanup cron — ported from
 * legacy/server/cron/autoMiningSessionCleanupCron.ts, `setInterval`-based (same as legacy).
 *
 * Sweeps zombie v2 sessions left `isActive: true` by closed tabs (no explicit stop call), and
 * unclaimed turbo banner impressions older than 7 days — both delegated to
 * auto-mining/auto-mining.v2.service.ts, never reimplemented here.
 */
import { logger } from "../core/logger/index.js";
import {
  deactivateStaleAutoMiningSessions,
  cleanupStaleAutoMiningV2Impressions,
} from "../modules/auto-mining/index.js";

const log = logger.child("AutoMiningSessionCleanupCron");

const DEFAULT_CRON_INTERVAL_MS = 300_000; // 5 minutes, matches legacy default

export function startAutoMiningSessionCleanupCron(): { stop: () => void } {
  const intervalMs = Number(process.env.AUTO_MINING_SESSION_CLEANUP_CRON_MS || DEFAULT_CRON_INTERVAL_MS);
  const run = () => {
    deactivateStaleAutoMiningSessions().catch((err: unknown) => {
      log.warn("Stale session sweep failed", { error: err instanceof Error ? err.message : String(err) });
    });
    cleanupStaleAutoMiningV2Impressions().catch((err: unknown) => {
      log.warn("Stale banner impression cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Auto-mining session cleanup cron started", { intervalMs });
  return { stop: () => clearInterval(handle) };
}
