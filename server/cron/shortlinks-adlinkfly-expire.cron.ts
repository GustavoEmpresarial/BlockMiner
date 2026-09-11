/**
 * Expires stale pending AdLinkFly external shortlink sessions globally.
 */
import { logger } from "../core/logger/index.js";
import { expireStaleAdlinkflySessions } from "../modules/shortlinks/shortlinks-adlinkfly.service.js";

const log = logger.child("ShortlinksAdlinkflyExpireCron");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export function startShortlinksAdlinkflyExpireCron() {
  const intervalMs = Number(process.env.SHORTLINK_ADLINKFLY_EXPIRE_CRON_MS || DEFAULT_INTERVAL_MS);
  const run = () => {
    expireStaleAdlinkflySessions().catch((err) => {
      log.warn("AdLinkFly expire sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Shortlinks AdLinkFly expire cron started", { intervalMs });
  return { stop: () => clearInterval(handle) };
}
