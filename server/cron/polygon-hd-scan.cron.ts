/**
 * Polygon HD deposit scanner cron — ported from legacy/server/services/
 * polygonHdDepositScanner.ts's `startPolygonHdDepositScanner`, same `setInterval` shape as
 * deposit-verifier.cron.ts. READ-ONLY blockchain access only (Polygonscan API, no key) — see
 * server/modules/wallet/deposit/polygonHdDepositScanner.ts header for the full scope note.
 */
import { logger } from "../core/logger/index.js";
import { runPolygonHdDepositScanOnce } from "../modules/wallet/deposit/polygonHdDepositScanner.js";

const log = logger.child("PolygonHdDepositScannerCron");

// Delay the first scan so it doesn't compete for the shared Etherscan rate-limiter budget
// against other startup work (mirrors legacy's 2min startup delay).
const STARTUP_DELAY_MS = 2 * 60 * 1000;

export function startPolygonHdDepositScannerCron(): { stop: () => void } {
  const raw = parseInt(process.env.POLYGON_HD_DEPOSIT_SCAN_INTERVAL_MS || "900000", 10);
  const intervalMs = Number.isFinite(raw) && raw >= 60_000 ? raw : 900_000;
  let warnedMissingKey = false;

  const run = () => {
    runPolygonHdDepositScanOnce()
      .then((r) => {
        if (r.skipped && r.reason === "missing_polygonscan_api_key" && !warnedMissingKey) {
          warnedMissingKey = true;
          log.warn("Polygon HD auto-scan disabled: set ETHERSCAN_API_KEY or POLYGONSCAN_API_KEY.");
        } else if (!r.skipped && r.created > 0) {
          log.info("Polygon HD deposit scan finished", { created: r.created, rows: r.rows });
        }
      })
      .catch((err: unknown) => log.error("Polygon HD deposit scan error", { error: err instanceof Error ? err.message : String(err) }));
  };

  const startTimer = setTimeout(run, STARTUP_DELAY_MS);
  startTimer.unref?.();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Polygon HD deposit scanner cron scheduled", { startupDelayMs: STARTUP_DELAY_MS, intervalMs });
  return {
    stop: () => {
      clearTimeout(startTimer);
      clearInterval(handle);
    },
  };
}
