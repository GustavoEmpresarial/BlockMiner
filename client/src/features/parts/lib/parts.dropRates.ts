import type { PartDropRates } from './parts.types';

/** Server defaults (parts.drop.ts). Used until /parts answers, and on the Manual. */
export const DEFAULT_PART_DROP_RATES: PartDropRates = {
  activityBps: 3000,
  frequentActivityBps: 1000,
  offerwallMicroBps: 4000,
};

/** 3000 bps → "30"; keeps one decimal only when the rate needs it. */
export function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}
