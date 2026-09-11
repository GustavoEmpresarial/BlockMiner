// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export { energyTaxRouter } from "./energy-tax.routes.js";
export { runWeeklySweep, checkAndUpdateEnergyBlock, isEnergyTaxActive, isEnergyTaxAutoSweepDay, lastSevenUtcDays, lastSevenMiningPeriodStarts, lastSevenClosedMiningPeriodStarts, miningPeriodStart, miningPeriodEndKey, lastClosedMiningPeriodStart, firstTaxableDayStart, isTaxableDay, DAILY_PER_DAY_RATE, AUTO_PER_DAY_RATE, payDailyTax, computeWeekSummary, } from "./energy-tax.service.js";
export { EnergyTaxAlreadyPaid, EnergyTaxInsufficientBalance, EnergyTaxNoRewards, EnergyTaxNotStarted, } from "./energy-tax.errors.js";
