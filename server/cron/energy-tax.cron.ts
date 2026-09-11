// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Energy-tax cron — hourly poll that delegates to `runWeeklySweep()`.
 *
 * The sweep itself no-ops unless it is Monday UTC (`isEnergyTaxAutoSweepDay`), matching
 * the taxes UI countdown to Mon 00:00 UTC. Do NOT charge mid-week — that was the bug
 * that marked every closed day as `mode=auto` at the 15% penalty rate.
 *
 * Multi-node: reintroduce a Redis lock if replicas multiply (legacy used SET NX PX).
 */
import { logger } from "../core/logger/index.js";
import { runWeeklySweep } from "../modules/energy-tax/index.js";
const log = logger.child("EnergyTaxCron");
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly poll; Monday gate lives in runWeeklySweep
export function startEnergyTaxCron() {
    const intervalMs = Number(process.env.ENERGY_TAX_SWEEP_CRON_MS || DEFAULT_SWEEP_INTERVAL_MS);
    const run = () => {
        runWeeklySweep().catch((err) => {
            log.error("Weekly energy-tax sweep failed", { error: err instanceof Error ? err.message : String(err) });
        });
    };
    const handle = setInterval(run, intervalMs);
    handle.unref?.();
    log.info("Energy-tax cron started", { intervalMs, sweepDay: "Monday UTC" });
    return { stop: () => clearInterval(handle) };
}
