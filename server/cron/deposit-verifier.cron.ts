/**
 * Deposit verifier cron — ported from legacy/server/services/depositVerifier.ts's
 * `startDepositVerifier`, `setInterval`-based per doctrine (same shape as mining.cron.ts /
 * checkin.cron.ts). Polls `pending_verification` deposits and confirms them against the real
 * Polygon chain via wallet/deposit/deposit-verifier.service.ts. READ-ONLY blockchain access
 * only — see that file's header comment for the full security scope note.
 */
import { logger } from "../core/logger/index.js";
import { runDepositVerifier } from "../modules/wallet/deposit/deposit-verifier.service.js";
const log = logger.child("DepositVerifierCron");
const DEFAULT_INTERVAL_MS = 15_000; // matches legacy's INTERVAL_MS
export function startDepositVerifierCron() {
    const intervalMs = Number(process.env.DEPOSIT_VERIFIER_CRON_MS || DEFAULT_INTERVAL_MS);
    const run = () => {
        runDepositVerifier().catch((err) => {
            log.error("Deposit verifier run failed", { error: err instanceof Error ? err.message : String(err) });
        });
    };
    run();
    const handle = setInterval(run, intervalMs);
    handle.unref?.();
    log.info("Deposit verifier cron started", { intervalMs });
    return { stop: () => clearInterval(handle) };
}
