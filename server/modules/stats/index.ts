/** Public surface of the stats module — the only import path other modules may use. */
export { statsRouter } from "./stats.routes.js";
export {
  getUserEarningsStats,
  parseEarningsPeriod,
  rollupEarningsTotalsFromSourceMap,
  EARNINGS_STATS_PAYLOAD_KEYS,
} from "./stats.earnings.service.js";
export {
  rollupEarningsTotalsFromSourceMap as rollupEarningsTotalsFromSourceMapPure,
  parseEarningsPeriod as parseEarningsPeriodPure,
  EARNINGS_STATS_PAYLOAD_KEYS as EARNINGS_STATS_PAYLOAD_KEYS_PURE,
} from "./stats.earnings.pure.js";
