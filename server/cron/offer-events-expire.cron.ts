/**
 * Offer events expire cron — ported from legacy/server/cron/offerEventsExpireCron.ts,
 * `setInterval`-based (same as mining.cron.ts / checkin.cron.ts). Deactivates offer events whose
 * `endsAt` has passed. The actual DB write lives in modules/offer-events (deactivateExpiredOfferEvents)
 * per cron doctrine — this file only schedules it.
 */
import { logger } from "../core/logger/index.js";
import { deactivateExpiredOfferEvents } from "../modules/offer-events/index.js";

const log = logger.child("OfferEventsExpireCron");

const DEFAULT_INTERVAL_MS = 300_000; // 5 minutes, matches legacy default

export function startOfferEventsExpireCron(): { stop: () => void } {
  const intervalMs = Number(process.env.OFFER_EVENTS_EXPIRE_CRON_MS || DEFAULT_INTERVAL_MS);
  const run = () => {
    deactivateExpiredOfferEvents().catch((err: unknown) => {
      log.warn("Expire sweep failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Offer events expire cron started", { intervalMs });
  return { stop: () => clearInterval(handle) };
}
