/**
 * Security artifact cleanup cron — ported from
 * legacy/server/cron/securityArtifactCleanupCron.ts, `setInterval`-based (same as
 * mining.cron.ts / checkin.cron.ts). Deletes expired `callback_queue` rows used as generic
 * storage for rate-limit buckets (SEC_SW_RL — core/http/middleware/distributedRateLimit.ts),
 * idempotency keys (SEC_IDEM — core/http/middleware/idempotency.ts) and login lockout records
 * (SEC_LOCK — modules/auth/login/login.lockout.ts). Without this sweep the table grows
 * unbounded since none of those callers prune their own rows.
 */
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";

const log = logger.child("SecurityArtifactCleanupCron");

const CALLBACK_TYPES = ["SEC_SW_RL", "SEC_IDEM", "SEC_LOCK"] as const;

const DEFAULT_INTERVAL_MS = 3_600_000; // 1 hour, matches legacy default
const DEFAULT_MAX_AGE_HOURS = 72; // matches legacy default

export async function cleanupExpiredSecurityArtifacts(): Promise<number> {
  const maxAgeHours = Math.max(1, Number(process.env.SECURITY_ARTIFACT_MAX_AGE_H) || DEFAULT_MAX_AGE_HOURS);
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const res = await prisma.callbackQueue.deleteMany({
    where: {
      callbackType: { in: [...CALLBACK_TYPES] },
      createdAt: { lt: cutoff },
    },
  });
  if (res.count > 0) {
    log.info("Security artifact cleanup", { deleted: res.count, maxAgeHours });
  }
  return res.count;
}

export function startSecurityArtifactCleanupCron(): { stop: () => void } {
  const intervalMs = Math.max(60_000, Number(process.env.SECURITY_ARTIFACT_CLEANUP_MS) || DEFAULT_INTERVAL_MS);
  const run = () => {
    cleanupExpiredSecurityArtifacts().catch((err: unknown) => {
      log.error("Security artifact cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Security artifact cleanup cron started", { intervalMs });
  return { stop: () => clearInterval(handle) };
}
